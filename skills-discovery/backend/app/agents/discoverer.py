"""
Agent 2 — URL Discoverer
Searches GitHub, Reddit, HackerNews, Dev.to, and npm for URLs
that might lead to AI skills/tools pages. Results go into discovered_urls.
"""
import asyncio
import json
import httpx
from datetime import datetime
from typing import List, Dict

import aiosqlite

from .url_utils import normalize_url, is_skippable, is_relevant, extract_urls_from_text

HEADERS = {"User-Agent": "SkillsHub-Discoverer/1.0 (+github.com/do4fun/skills-discovery)"}
GH_HEADERS = {**HEADERS, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}

DEFAULT_KEYWORDS = [
    "MCP server model context protocol",
    "Claude Code skill slash command",
    "AI coding assistant tool",
    "LLM agent framework open source",
    "claude anthropic tool plugin",
    "MCP server typescript python",
]

DEFAULT_SOURCES = ["github", "reddit", "hackernews", "devto", "npm"]


# ─── Source-specific discovery ────────────────────────────────────────────────

async def _github(client: httpx.AsyncClient, kw: str) -> List[Dict]:
    results = []
    for endpoint in [
        f"https://api.github.com/search/repositories?q={kw}&sort=stars&per_page=20",
        f"https://api.github.com/search/topics?q={kw}&per_page=20",
    ]:
        try:
            r = await client.get(endpoint, headers=GH_HEADERS, timeout=15)
            if r.status_code == 403:
                return results
            r.raise_for_status()
            for item in r.json().get("items", []):
                url = item.get("html_url") or item.get("related_topics", [None])[0]
                if url:
                    results.append({
                        "url": url,
                        "title": item.get("full_name") or item.get("name", ""),
                        "context": item.get("description", "")[:300],
                        "source": "github",
                    })
        except Exception:
            pass
        await asyncio.sleep(1.2)
    return results


async def _reddit(client: httpx.AsyncClient, kw: str, subreddits: List[str]) -> List[Dict]:
    results = []
    for sub in subreddits:
        try:
            r = await client.get(
                f"https://www.reddit.com/r/{sub}/search.json?q={kw}&sort=new&limit=15&restrict_sr=1&t=month",
                headers={**HEADERS, "Accept": "application/json"},
                timeout=15,
            )
            r.raise_for_status()
            for post in r.json().get("data", {}).get("children", []):
                d = post.get("data", {})
                ext_url = d.get("url", "")
                title = d.get("title", "")
                selftext = d.get("selftext", "")
                # The external link itself
                if ext_url and not ext_url.startswith("https://www.reddit.com"):
                    results.append({"url": ext_url, "title": title, "context": title, "source": "reddit"})
                # URLs embedded in self-post body
                for u in extract_urls_from_text(selftext):
                    results.append({"url": u, "title": title, "context": u, "source": "reddit"})
        except Exception:
            pass
        await asyncio.sleep(1.5)
    return results


async def _hackernews(client: httpx.AsyncClient, kw: str) -> List[Dict]:
    results = []
    try:
        r = await client.get(
            f"https://hn.algolia.com/api/v1/search?query={kw}&tags=story&hitsPerPage=20",
            headers=HEADERS, timeout=15,
        )
        r.raise_for_status()
        for hit in r.json().get("hits", []):
            url = hit.get("url")
            if url:
                results.append({
                    "url": url,
                    "title": hit.get("title", ""),
                    "context": hit.get("title", ""),
                    "source": "hackernews",
                })
            # Also extract links from comments
            for u in extract_urls_from_text(hit.get("story_text") or ""):
                results.append({"url": u, "title": hit.get("title", ""), "context": u, "source": "hackernews"})
    except Exception:
        pass
    await asyncio.sleep(0.5)
    return results


async def _devto(client: httpx.AsyncClient) -> List[Dict]:
    results = []
    tags = ["claudeai", "mcp", "llm", "aitools", "artificialintelligence", "openai", "generativeai"]
    for tag in tags:
        try:
            r = await client.get(
                f"https://dev.to/api/articles?tag={tag}&per_page=15&top=7",
                headers=HEADERS, timeout=15,
            )
            r.raise_for_status()
            for a in r.json():
                url = a.get("url", "")
                if url:
                    results.append({
                        "url": url,
                        "title": a.get("title", ""),
                        "context": a.get("description", "")[:200],
                        "source": "devto",
                    })
        except Exception:
            pass
        await asyncio.sleep(0.5)
    return results


async def _npm(client: httpx.AsyncClient) -> List[Dict]:
    results = []
    searches = ["mcp-server", "modelcontextprotocol", "claude-sdk", "llm-tool"]
    for term in searches:
        try:
            r = await client.get(
                f"https://registry.npmjs.org/-/v1/search?text={term}&size=30",
                headers=HEADERS, timeout=15,
            )
            r.raise_for_status()
            for obj in r.json().get("objects", []):
                pkg = obj.get("package", {})
                links = pkg.get("links", {})
                for link_url in [links.get("homepage"), links.get("repository"), links.get("npm")]:
                    if link_url:
                        results.append({
                            "url": link_url,
                            "title": pkg.get("name", ""),
                            "context": pkg.get("description", "")[:200],
                            "source": "npm",
                        })
        except Exception:
            pass
        await asyncio.sleep(0.5)
    return results


# ─── Queue insertion ──────────────────────────────────────────────────────────

async def _enqueue(db: aiosqlite.Connection, items: List[Dict]) -> int:
    added = 0
    for item in items:
        url = item.get("url", "").strip()
        if not url or is_skippable(url):
            continue
        if not is_relevant(url, item.get("title", ""), item.get("context", "")):
            continue
        norm = normalize_url(url)
        try:
            await db.execute(
                """INSERT OR IGNORE INTO discovered_urls
                   (url, url_normalized, title, context, source, status, discovered_at)
                   VALUES (?, ?, ?, ?, ?, 'pending', ?)""",
                (url, norm, item.get("title", "")[:200], item.get("context", "")[:300],
                 item.get("source", ""), datetime.utcnow().isoformat()),
            )
            if db.total_changes > 0:
                added += 1
        except Exception:
            pass
    await db.commit()
    return added


# ─── Main discoverer loop ─────────────────────────────────────────────────────

async def run_discoverer(
    session_id: int,
    db: aiosqlite.Connection,
    config: dict,
    stop_flag: dict,
    pause_event: asyncio.Event,
    log_fn,
):
    keywords = config.get("keywords", DEFAULT_KEYWORDS)
    sources = config.get("sources", DEFAULT_SOURCES)
    delay = float(config.get("delay_seconds", 2.0))
    subreddits = config.get("subreddits", ["MachineLearning", "artificial", "LocalLLaMA", "ClaudeAI", "programming", "devops"])

    total_discovered = 0

    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        while not stop_flag.get("stop"):
            # Pause check
            if not pause_event.is_set():
                await log_fn(db, session_id, "⏸ En pause…")
                await asyncio.get_event_loop().run_in_executor(None, pause_event.wait)
                await log_fn(db, session_id, "▶ Reprise")

            round_total = 0
            for kw in keywords:
                if stop_flag.get("stop"):
                    break

                await log_fn(db, session_id, f"🔍 Recherche: «{kw}»")
                items: List[Dict] = []

                if "github" in sources:
                    items += await _github(client, kw)
                if "reddit" in sources:
                    items += await _reddit(client, kw, subreddits)
                if "hackernews" in sources:
                    items += await _hackernews(client, kw)

                added = await _enqueue(db, items)
                round_total += added
                if added:
                    await log_fn(db, session_id, f"  → {len(items)} trouvés, {added} ajoutés à la queue")

                await asyncio.sleep(delay)

            # Run dev.to and npm once per full round
            if "devto" in sources and not stop_flag.get("stop"):
                items = await _devto(client)
                added = await _enqueue(db, items)
                round_total += added

            if "npm" in sources and not stop_flag.get("stop"):
                items = await _npm(client)
                added = await _enqueue(db, items)
                round_total += added

            total_discovered += round_total
            await log_fn(db, session_id, f"🔄 Cycle terminé — {round_total} nouvelles URLs ({total_discovered} total)")

            # Update stats
            await db.execute(
                "UPDATE agent_sessions SET stats=? WHERE id=?",
                (json.dumps({"urls_discovered": total_discovered}), session_id),
            )
            await db.commit()

            # Wait before next round
            await asyncio.sleep(float(config.get("round_delay_seconds", 60.0)))
