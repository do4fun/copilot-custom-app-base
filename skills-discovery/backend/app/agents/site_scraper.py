"""
Agent 1 — Site Scraper
Picks URLs from discovered_urls (status='pending'), fetches each page,
extracts skill info via Claude API (or heuristics), saves to skills table.
"""
import asyncio
import json
import re
import os
import httpx
from datetime import datetime
from typing import Optional, Dict, Any

import aiosqlite

from .url_utils import extract_urls_from_text, is_skippable, normalize_url

HEADERS = {"User-Agent": "SkillsHub-Scraper/1.0 (+github.com/do4fun/skills-discovery)"}
MAX_HTML_CHARS = 12_000   # chars sent to Claude


# ─── HTML → plain text ────────────────────────────────────────────────────────

def _strip_html(html: str) -> str:
    # Remove scripts, styles, nav blocks
    html = re.sub(r'<(script|style|nav|footer|header|noscript)[^>]*>.*?</\1>', ' ', html, flags=re.S | re.I)
    # Remove tags
    text = re.sub(r'<[^>]+>', ' ', html)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:MAX_HTML_CHARS]


def _extract_title(html: str) -> str:
    m = re.search(r'<title[^>]*>([^<]{1,200})</title>', html, re.I)
    return m.group(1).strip() if m else ""


def _extract_description(html: str) -> str:
    for pattern in [
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']{10,500})["\']',
        r'<meta[^>]+content=["\']([^"\']{10,500})["\'][^>]+name=["\']description["\']',
    ]:
        m = re.search(pattern, html, re.I)
        if m:
            return m.group(1).strip()
    return ""


# ─── Heuristic extraction (no Claude) ────────────────────────────────────────

CATEGORY_HINTS = {
    "MCP Server": ["mcp server", "model context protocol", "mcpservers", "mcp-server"],
    "Claude Code Skill": ["claude code", "claude skill", "/deep-research", "/code-review"],
    "AI Coding Tool": ["ai coding", "code assistant", "autocomplete", "copilot", "cursor", "aider", "codeium"],
    "AI Productivity Tool": ["ai productivity", "ai assistant", "perplexity", "chatgpt", "claude.ai"],
}

PRICING_HINTS = {
    "free": ["free", "open source", "open-source", "mit license", "apache license", "no cost"],
    "paid": ["pricing", "subscribe", "per month", "per year", "enterprise", "paid plan"],
    "freemium": ["free tier", "free plan", "upgrade", "pro plan", "starter plan"],
}


def _heuristic_extract(url: str, title: str, description: str, text: str) -> Optional[Dict]:
    combined = (url + " " + title + " " + description + " " + text[:2000]).lower()

    # Detect category
    category = "AI Productivity Tool"
    for cat, hints in CATEGORY_HINTS.items():
        if any(h in combined for h in hints):
            category = cat
            break

    # Detect pricing
    pricing = "free"
    for price, hints in PRICING_HINTS.items():
        if any(h in combined for h in hints):
            pricing = price
            break
    if "open source" in combined or "github.com" in url:
        pricing = "free"

    # Require at least a title
    if not title or len(title) < 4:
        return None

    return {
        "name": title[:120],
        "description": description or text[:250],
        "category": category,
        "pricing": pricing,
        "features": json.dumps([]),
        "tags": [],
        "confidence": 0.4,
    }


# ─── Claude-powered extraction ─────────────────────────────────────────────────

async def _claude_extract(url: str, title: str, text: str) -> Optional[Dict]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        prompt = f"""Analyze this web page and determine if it describes an AI skill, tool, MCP server, or developer utility.

URL: {url}
Title: {title}
Content (truncated):
{text[:MAX_HTML_CHARS]}

If this page describes a skill/tool, return a JSON object with these fields:
{{
  "is_skill": true,
  "name": "Tool name (max 80 chars)",
  "description": "Clear description (max 300 chars)",
  "category": one of ["MCP Server", "Claude Code Skill", "AI Coding Tool", "AI Productivity Tool", "Software"],
  "pricing": one of ["free", "freemium", "paid"],
  "price_details": "Optional pricing details",
  "features": ["feature 1", "feature 2", ...] (max 8),
  "tags": ["tag1", "tag2", ...] (max 6, lowercase),
  "install_instructions": "How to install/use (optional)",
  "confidence": 0.0 to 1.0
}}

If this page does NOT describe a skill/tool, return: {{"is_skill": false}}

Respond with valid JSON only, no explanation."""

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        # Extract JSON
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            data = json.loads(m.group())
            if data.get("is_skill") and data.get("name"):
                return data
    except Exception:
        pass
    return None


# ─── DB helpers ───────────────────────────────────────────────────────────────

async def _save_skill(db: aiosqlite.Connection, url: str, source: str, data: Dict) -> int:
    name = (data.get("name") or "").strip()[:200]
    if not name:
        return 0

    async with db.execute("SELECT id FROM skills WHERE LOWER(name) = LOWER(?)", (name,)) as cur:
        exists = await cur.fetchone()
    if exists:
        return 0

    features = data.get("features", [])
    if isinstance(features, list):
        features = json.dumps(features)

    now = datetime.utcnow().isoformat()
    cursor = await db.execute(
        """INSERT INTO skills
           (name, description, category, source_url, source_name,
            pricing, price_details, features, install_instructions,
            popularity_score, last_checked, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            name,
            (data.get("description") or "")[:500],
            data.get("category", "AI Productivity Tool"),
            url,
            source or "web-agent",
            data.get("pricing", "free"),
            data.get("price_details", ""),
            features,
            data.get("install_instructions", ""),
            float(data.get("confidence", 0.5) * 6),
            now, now, now,
        ),
    )
    skill_id = cursor.lastrowid

    for tag in (data.get("tags") or []):
        tag = str(tag).strip().lower()
        if not tag or len(tag) > 40:
            continue
        async with db.execute("SELECT id FROM tags WHERE name=?", (tag,)) as tc:
            tr = await tc.fetchone()
        tid = tr["id"] if tr else (await db.execute("INSERT INTO tags (name) VALUES (?)", (tag,))).lastrowid
        await db.execute("INSERT OR IGNORE INTO skill_tags (skill_id, tag_id) VALUES (?,?)", (skill_id, tid))

    await db.commit()
    return skill_id


# ─── Main scraper loop ────────────────────────────────────────────────────────

async def run_site_scraper(
    session_id: int,
    db: aiosqlite.Connection,
    config: dict,
    stop_flag: dict,
    pause_event: asyncio.Event,
    log_fn,
):
    delay = float(config.get("delay_seconds", 3.0))
    batch_size = int(config.get("batch_size", 5))
    min_confidence = float(config.get("min_confidence", 0.35))
    use_claude = bool(os.environ.get("ANTHROPIC_API_KEY"))

    total_processed = 0
    total_added = 0

    if use_claude:
        await log_fn(db, session_id, "✅ Claude API disponible — extraction intelligente activée")
    else:
        await log_fn(db, session_id, "⚠️  Pas de ANTHROPIC_API_KEY — mode heuristique uniquement")

    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        while not stop_flag.get("stop"):

            # Pause check
            if not pause_event.is_set():
                await log_fn(db, session_id, "⏸ En pause…")
                await asyncio.get_event_loop().run_in_executor(None, pause_event.wait)
                await log_fn(db, session_id, "▶ Reprise")

            # Fetch next batch from queue
            async with db.execute(
                "SELECT * FROM discovered_urls WHERE status='pending' ORDER BY discovered_at ASC LIMIT ?",
                (batch_size,),
            ) as cur:
                rows = await cur.fetchall()

            if not rows:
                await log_fn(db, session_id, "⏳ Queue vide — attente de nouvelles URLs…")
                await asyncio.sleep(10)
                continue

            for row in rows:
                if stop_flag.get("stop"):
                    break

                url_id = row["id"]
                url = row["url"]
                source = row["source"] or "web"

                # Mark as processing
                await db.execute(
                    "UPDATE discovered_urls SET status='processing' WHERE id=?", (url_id,)
                )
                await db.commit()

                await log_fn(db, session_id, f"🌐 {url[:80]}…")

                try:
                    r = await client.get(url, headers=HEADERS, timeout=15)
                    r.raise_for_status()
                    html = r.text
                except Exception as e:
                    await db.execute(
                        "UPDATE discovered_urls SET status='failed', error_msg=?, processed_at=? WHERE id=?",
                        (str(e)[:200], datetime.utcnow().isoformat(), url_id),
                    )
                    await db.commit()
                    await log_fn(db, session_id, f"  ✗ Erreur réseau: {e}")
                    continue

                title = _extract_title(html) or row.get("title") or ""
                description = _extract_description(html)
                text = _strip_html(html)

                # Try Claude first, fall back to heuristic
                data = None
                if use_claude:
                    data = await _claude_extract(url, title, text)

                if not data or data.get("confidence", 0) < min_confidence:
                    data = _heuristic_extract(url, title, description, text)

                skill_id = 0
                if data and data.get("confidence", 0) >= min_confidence:
                    skill_id = await _save_skill(db, url, source, data)
                    if skill_id:
                        total_added += 1
                        await log_fn(db, session_id, f"  ✅ Skill ajouté: {data.get('name')}")
                    else:
                        await log_fn(db, session_id, f"  ~ Déjà connu: {title[:50]}")
                else:
                    await log_fn(db, session_id, f"  ✗ Pas un skill: {title[:50]}")

                status = "processed" if data else "skipped"
                await db.execute(
                    "UPDATE discovered_urls SET status=?, skill_id=?, processed_at=? WHERE id=?",
                    (status, skill_id or None, datetime.utcnow().isoformat(), url_id),
                )
                await db.commit()
                total_processed += 1

                # Update stats
                await db.execute(
                    "UPDATE agent_sessions SET stats=? WHERE id=?",
                    (json.dumps({"urls_processed": total_processed, "skills_added": total_added}), session_id),
                )
                await db.commit()

                await asyncio.sleep(delay)
