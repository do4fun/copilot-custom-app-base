from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
import aiosqlite
import asyncio
import json
from datetime import datetime

from ..database import get_db, get_db_connection
from ..scraper.web_scrapers import WEB_SCRAPERS

router = APIRouter()

# In-memory task registry  {session_id: asyncio.Task}
_running_tasks: dict = {}
_pause_events: dict = {}
_stop_flags: dict = {}

SCRAPERS = [
    {
        "id": "awesome-mcp",
        "name": "Awesome MCP Servers",
        "source": "github",
        "description": "Parse le README de punkpeye/awesome-mcp-servers — la liste communautaire référence de serveurs MCP.",
        "estimated": 80,
        "live": True,
    },
    {
        "id": "npm-mcp",
        "name": "npm — MCP Packages",
        "source": "npm",
        "description": "Cherche les packages @modelcontextprotocol et mcp-server sur le registre npm.",
        "estimated": 50,
        "live": True,
    },
    {
        "id": "github-mcp",
        "name": "GitHub — topic:mcp-server",
        "source": "github",
        "description": "Recherche GitHub par topics mcp-server et model-context-protocol, triés par étoiles.",
        "estimated": 60,
        "live": True,
    },
    {
        "id": "github-ai-tools",
        "name": "GitHub — AI Coding Agents",
        "source": "github",
        "description": "Recherche GitHub pour les outils de coding IA et agents LLM open source avec +100 étoiles.",
        "estimated": 40,
        "live": True,
    },
    {
        "id": "vscode-ai",
        "name": "VS Code Marketplace — AI",
        "source": "vscode",
        "description": "Interroge le marketplace VS Code pour les extensions IA (Claude, Copilot, assistants de code…).",
        "estimated": 30,
        "live": True,
    },
    {
        "id": "huggingface",
        "name": "Hugging Face Spaces",
        "source": "huggingface",
        "description": "Découvre les demos et outils IA hébergés sur Hugging Face Spaces (catégorie coding).",
        "estimated": 30,
        "live": True,
    },
    {
        "id": "claude-skills",
        "name": "Claude Code Skills (local)",
        "source": "anthropic",
        "description": "Re-synchronise les skills intégrés de Claude Code depuis la seed data locale.",
        "estimated": 14,
        "live": False,
    },
    {
        "id": "mcp-servers",
        "name": "MCP Officiels (local)",
        "source": "mcp-official",
        "description": "Re-synchronise les serveurs MCP officiels depuis la seed data locale.",
        "estimated": 12,
        "live": False,
    },
]


async def _append_log(db: aiosqlite.Connection, session_id: int, message: str):
    async with db.execute("SELECT logs FROM scraper_sessions WHERE id = ?", (session_id,)) as cur:
        row = await cur.fetchone()
    logs = json.loads(row["logs"] if row else "[]")
    logs.append({"time": datetime.utcnow().isoformat(), "msg": message})
    await db.execute(
        "UPDATE scraper_sessions SET logs = ? WHERE id = ?",
        (json.dumps(logs[-100:]), session_id),
    )
    await db.commit()


async def _upsert_skill(db: aiosqlite.Connection, item: dict) -> bool:
    """Insert skill if it doesn't exist. Returns True if newly inserted."""
    name = (item.get("name") or "").strip()
    if not name:
        return False

    async with db.execute(
        "SELECT id FROM skills WHERE LOWER(name) = LOWER(?)", (name,)
    ) as cur:
        exists = await cur.fetchone()

    if exists:
        await db.execute(
            "UPDATE skills SET last_checked = ? WHERE id = ?",
            (datetime.utcnow().isoformat(), exists["id"]),
        )
        await db.commit()
        return False

    features = item.get("features", "[]")
    if isinstance(features, list):
        features = json.dumps(features)

    now = datetime.utcnow().isoformat()
    cursor = await db.execute(
        """INSERT INTO skills
           (name, description, category, source_url, source_name,
            pricing, price_details, features, install_instructions,
            version, popularity_score, last_checked, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            name,
            (item.get("description") or "")[:500],
            item.get("category", ""),
            item.get("source_url", ""),
            item.get("source_name", ""),
            item.get("pricing", "free"),
            item.get("price_details", ""),
            features,
            item.get("install_instructions", ""),
            item.get("version", ""),
            float(item.get("popularity_score", 0)),
            now, now, now,
        ),
    )
    skill_id = cursor.lastrowid

    for tag_name in (item.get("tags") or []):
        tag_name = str(tag_name).strip().lower()
        if not tag_name or len(tag_name) > 40:
            continue
        async with db.execute("SELECT id FROM tags WHERE name = ?", (tag_name,)) as tc:
            tr = await tc.fetchone()
        if tr:
            tid = tr["id"]
        else:
            tc2 = await db.execute("INSERT INTO tags (name) VALUES (?)", (tag_name,))
            tid = tc2.lastrowid
        await db.execute(
            "INSERT OR IGNORE INTO skill_tags (skill_id, tag_id) VALUES (?,?)",
            (skill_id, tid),
        )
    await db.commit()
    return True


async def _run_session(session_id: int, scraper_id: str):
    db = await get_db_connection()
    try:
        await db.execute(
            "UPDATE scraper_sessions SET status='running', started_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), session_id),
        )
        await db.commit()
        await _append_log(db, session_id, f"Démarrage — source: {scraper_id}")

        # ── Fetch items ───────────────────────────────────────────────────────
        items = []

        if scraper_id in WEB_SCRAPERS:
            await _append_log(db, session_id, "Connexion au web en cours…")
            try:
                scraper_fn = WEB_SCRAPERS[scraper_id]
                items = await scraper_fn()
                await _append_log(db, session_id, f"Web: {len(items)} entrées récupérées")
            except Exception as e:
                await _append_log(db, session_id, f"Erreur réseau: {e} — passage en mode local")

        # Fallback to local seed data
        if not items:
            from ..scraper.seed_data import SEED_SKILLS
            from ..scraper.claude_skills import ClaudeSkillsScraper
            from ..scraper.mcp_servers import MCPServersScraper

            if scraper_id == "claude-skills":
                items = await ClaudeSkillsScraper(db).scrape()
            elif scraper_id == "mcp-servers":
                items = await MCPServersScraper(db).scrape()
            else:
                cat_map = {
                    "github-ai-tools": "AI Coding Tool",
                    "vscode-ai": "AI Coding Tool",
                    "huggingface": "AI Productivity Tool",
                }
                cat = cat_map.get(scraper_id, "")
                items = [s for s in SEED_SKILLS if s.get("category") == cat]
            await _append_log(db, session_id, f"Seed locale: {len(items)} entrées")

        total = len(items)
        await db.execute(
            "UPDATE scraper_sessions SET total=? WHERE id=?", (total, session_id)
        )
        await db.commit()

        # ── Process items ─────────────────────────────────────────────────────
        found = 0
        for i, item in enumerate(items):

            if _stop_flags.get(session_id):
                await db.execute(
                    "UPDATE scraper_sessions SET status='stopped', finished_at=?, progress=? WHERE id=?",
                    (datetime.utcnow().isoformat(), i, session_id),
                )
                await db.commit()
                await _append_log(db, session_id, "Arrêt demandé par l'utilisateur")
                return

            evt = _pause_events.get(session_id)
            if evt and not evt.is_set():
                await db.execute(
                    "UPDATE scraper_sessions SET status='paused', paused_at=? WHERE id=?",
                    (datetime.utcnow().isoformat(), session_id),
                )
                await db.commit()
                await _append_log(db, session_id, "En pause…")
                await asyncio.get_event_loop().run_in_executor(None, evt.wait)
                await db.execute(
                    "UPDATE scraper_sessions SET status='running', paused_at=NULL WHERE id=?",
                    (session_id,),
                )
                await db.commit()
                await _append_log(db, session_id, "Reprise")

            name = (item.get("name") or "").strip()
            added = await _upsert_skill(db, item)
            if added:
                found += 1
                await _append_log(db, session_id, f"+ {name}")
            else:
                await _append_log(db, session_id, f"~ {name} (existant)")

            await db.execute(
                "UPDATE scraper_sessions SET progress=?, found=? WHERE id=?",
                (i + 1, found, session_id),
            )
            await db.commit()
            await asyncio.sleep(0.05)  # avoid hammering the DB

        await db.execute(
            "UPDATE scraper_sessions SET status='completed', finished_at=?, progress=?, found=? WHERE id=?",
            (datetime.utcnow().isoformat(), total, found, session_id),
        )
        await db.commit()
        await _append_log(db, session_id, f"Terminé — {found} nouveaux skills ajoutés sur {total}")

    except Exception as e:
        try:
            await db.execute(
                "UPDATE scraper_sessions SET status='failed', finished_at=? WHERE id=?",
                (datetime.utcnow().isoformat(), session_id),
            )
            await db.commit()
            await _append_log(db, session_id, f"Erreur fatale: {e}")
        except Exception:
            pass
    finally:
        _running_tasks.pop(session_id, None)
        _pause_events.pop(session_id, None)
        _stop_flags.pop(session_id, None)
        await db.close()


def _row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "source": row["source"],
        "status": row["status"],
        "progress": row["progress"] or 0,
        "total": row["total"] or 0,
        "found": row["found"] or 0,
        "logs": json.loads(row["logs"] or "[]"),
        "started_at": row["started_at"],
        "paused_at": row["paused_at"],
        "finished_at": row["finished_at"],
        "created_at": row["created_at"],
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/scrapers")
async def list_scrapers():
    return SCRAPERS


@router.get("/sessions")
async def list_sessions(db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute(
        "SELECT * FROM scraper_sessions ORDER BY created_at DESC LIMIT 100"
    ) as cur:
        rows = await cur.fetchall()
    return [_row_to_dict(r) for r in rows]


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute(
        "SELECT * FROM scraper_sessions WHERE id = ?", (session_id,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return _row_to_dict(row)


@router.post("/sessions", status_code=201)
async def start_session(
    body: dict,
    background_tasks: BackgroundTasks,
    db: aiosqlite.Connection = Depends(get_db),
):
    scraper_id = body.get("scraper_id", "")
    scraper_cfg = next((s for s in SCRAPERS if s["id"] == scraper_id), None)
    if not scraper_cfg:
        raise HTTPException(status_code=400, detail=f"Scraper inconnu: {scraper_id}")

    cursor = await db.execute(
        "INSERT INTO scraper_sessions (name, source, status, total) VALUES (?, ?, 'pending', ?)",
        (scraper_cfg["name"], scraper_cfg["source"], scraper_cfg["estimated"]),
    )
    session_id = cursor.lastrowid
    await db.commit()

    evt = asyncio.Event()
    evt.set()
    _pause_events[session_id] = evt
    _stop_flags[session_id] = False

    background_tasks.add_task(_run_session, session_id, scraper_id)

    async with db.execute("SELECT * FROM scraper_sessions WHERE id=?", (session_id,)) as cur:
        row = await cur.fetchone()
    return _row_to_dict(row)


@router.post("/sessions/{session_id}/pause")
async def pause_session(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT status FROM scraper_sessions WHERE id=?", (session_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if row["status"] != "running":
        raise HTTPException(status_code=400, detail="Session n'est pas en cours")
    evt = _pause_events.get(session_id)
    if evt:
        evt.clear()
    return {"status": "pausing"}


@router.post("/sessions/{session_id}/resume")
async def resume_session(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT status FROM scraper_sessions WHERE id=?", (session_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if row["status"] != "paused":
        raise HTTPException(status_code=400, detail="Session n'est pas en pause")
    evt = _pause_events.get(session_id)
    if evt:
        evt.set()
    return {"status": "resuming"}


@router.post("/sessions/{session_id}/stop")
async def stop_session(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT status FROM scraper_sessions WHERE id=?", (session_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if row["status"] not in ("running", "paused"):
        raise HTTPException(status_code=400, detail="Session n'est pas active")
    _stop_flags[session_id] = True
    evt = _pause_events.get(session_id)
    if evt:
        evt.set()
    return {"status": "stopping"}


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    await db.execute("DELETE FROM scraper_sessions WHERE id=?", (session_id,))
    await db.commit()


@router.post("/sessions/clear-all", status_code=204)
async def clear_completed_sessions(db: aiosqlite.Connection = Depends(get_db)):
    await db.execute(
        "DELETE FROM scraper_sessions WHERE status IN ('completed','failed','stopped')"
    )
    await db.commit()
