from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import List, Optional
import aiosqlite
import asyncio
import json
from datetime import datetime

from ..database import get_db, get_db_connection

router = APIRouter()

# In-memory registry of running tasks {session_id: asyncio.Task}
_running_tasks: dict = {}
# Pause events per session
_pause_events: dict = {}
# Stop flags per session
_stop_flags: dict = {}

SCRAPERS = [
    {"id": "claude-skills",   "name": "Claude Code Skills",     "source": "anthropic",  "description": "Skills intégrées de Claude Code (/deep-research, /review, etc.)", "estimated": 14},
    {"id": "mcp-servers",     "name": "MCP Servers Officiels",  "source": "mcp-official","description": "Serveurs MCP officiels (filesystem, github, memory…)",             "estimated": 12},
    {"id": "ai-coding-tools", "name": "AI Coding Tools",        "source": "web",         "description": "Outils de coding IA (Cursor, Aider, Windsurf…)",                   "estimated": 16},
    {"id": "ai-productivity", "name": "AI Productivity Tools",  "source": "web",         "description": "Outils de productivité IA (Perplexity, Claude.ai…)",               "estimated": 8},
]


async def _append_log(db: aiosqlite.Connection, session_id: int, message: str):
    async with db.execute("SELECT logs FROM scraper_sessions WHERE id = ?", (session_id,)) as cur:
        row = await cur.fetchone()
    logs = json.loads(row["logs"] if row else "[]")
    logs.append({"time": datetime.utcnow().isoformat(), "msg": message})
    await db.execute(
        "UPDATE scraper_sessions SET logs = ? WHERE id = ?",
        (json.dumps(logs[-50:]), session_id)  # keep last 50 entries
    )
    await db.commit()


async def _run_scraper(session_id: int, scraper_id: str):
    db = await get_db_connection()
    try:
        await db.execute(
            "UPDATE scraper_sessions SET status='running', started_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), session_id)
        )
        await db.commit()
        await _append_log(db, session_id, f"Session démarrée — scraper: {scraper_id}")

        # Simulate scraping steps with real DB inserts from existing seed data
        from ..scraper.seed_data import SEED_SKILLS
        from ..scraper.claude_skills import ClaudeSkillsScraper
        from ..scraper.mcp_servers import MCPServersScraper

        if scraper_id == "claude-skills":
            scraper = ClaudeSkillsScraper(db)
            items = await scraper.scrape()
        elif scraper_id == "mcp-servers":
            scraper = MCPServersScraper(db)
            items = await scraper.scrape()
        else:
            # Filter SEED_SKILLS by category
            cat_map = {
                "ai-coding-tools": "AI Coding Tool",
                "ai-productivity": "AI Productivity Tool",
            }
            cat = cat_map.get(scraper_id, "")
            items = [s for s in SEED_SKILLS if s.get("category") == cat]

        total = len(items)
        await db.execute(
            "UPDATE scraper_sessions SET total=? WHERE id=?", (total, session_id)
        )
        await db.commit()
        await _append_log(db, session_id, f"{total} items à traiter")

        found = 0
        for i, item in enumerate(items):
            # Check stop flag
            if _stop_flags.get(session_id):
                await db.execute(
                    "UPDATE scraper_sessions SET status='stopped', finished_at=?, progress=? WHERE id=?",
                    (datetime.utcnow().isoformat(), i, session_id)
                )
                await db.commit()
                await _append_log(db, session_id, "Session arrêtée par l'utilisateur")
                return

            # Check pause event
            evt = _pause_events.get(session_id)
            if evt and not evt.is_set():
                await db.execute(
                    "UPDATE scraper_sessions SET status='paused', paused_at=? WHERE id=?",
                    (datetime.utcnow().isoformat(), session_id)
                )
                await db.commit()
                await _append_log(db, session_id, "Session mise en pause")
                await asyncio.get_event_loop().run_in_executor(None, evt.wait)
                await db.execute(
                    "UPDATE scraper_sessions SET status='running', paused_at=NULL WHERE id=?",
                    (session_id,)
                )
                await db.commit()
                await _append_log(db, session_id, "Session reprise")

            # Check if skill already exists
            name = item.get("name", "")
            async with db.execute(
                "SELECT id FROM skills WHERE LOWER(name) = LOWER(?)", (name,)
            ) as cur:
                exists = await cur.fetchone()

            if not exists:
                item_copy = dict(item)
                tags = item_copy.pop("tags", [])
                import json as _json
                features = item_copy.get("features", "[]")
                if isinstance(features, list):
                    features = _json.dumps(features)
                now = datetime.utcnow().isoformat()
                cursor = await db.execute(
                    """INSERT INTO skills (name, description, category, source_url, source_name,
                       pricing, price_details, features, install_instructions, version,
                       popularity_score, last_checked, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        name, item_copy.get("description",""), item_copy.get("category",""),
                        item_copy.get("source_url",""), item_copy.get("source_name",""),
                        item_copy.get("pricing","free"), item_copy.get("price_details",""),
                        features, item_copy.get("install_instructions",""),
                        item_copy.get("version",""), item_copy.get("popularity_score", 0.0),
                        now, now, now,
                    )
                )
                skill_id = cursor.lastrowid
                for tag_name in tags:
                    tag_name = tag_name.strip().lower()
                    if not tag_name:
                        continue
                    async with db.execute("SELECT id FROM tags WHERE name=?", (tag_name,)) as tc:
                        tr = await tc.fetchone()
                    if tr:
                        tid = tr["id"]
                    else:
                        tc2 = await db.execute("INSERT INTO tags (name) VALUES (?)", (tag_name,))
                        tid = tc2.lastrowid
                    await db.execute(
                        "INSERT OR IGNORE INTO skill_tags (skill_id, tag_id) VALUES (?,?)",
                        (skill_id, tid)
                    )
                await db.commit()
                found += 1
                await _append_log(db, session_id, f"+ Ajouté: {name}")
            else:
                # Update last_checked
                await db.execute(
                    "UPDATE skills SET last_checked=? WHERE LOWER(name)=LOWER(?)",
                    (datetime.utcnow().isoformat(), name)
                )
                await db.commit()
                await _append_log(db, session_id, f"~ Existant: {name}")

            await db.execute(
                "UPDATE scraper_sessions SET progress=?, found=? WHERE id=?",
                (i + 1, found, session_id)
            )
            await db.commit()
            await asyncio.sleep(0.3)  # simulate network delay

        await db.execute(
            "UPDATE scraper_sessions SET status='completed', finished_at=?, progress=?, found=? WHERE id=?",
            (datetime.utcnow().isoformat(), total, found, session_id)
        )
        await db.commit()
        await _append_log(db, session_id, f"Terminé — {found} nouveaux skills ajoutés")

    except Exception as e:
        try:
            await db.execute(
                "UPDATE scraper_sessions SET status='failed', finished_at=? WHERE id=?",
                (datetime.utcnow().isoformat(), session_id)
            )
            await db.commit()
            await _append_log(db, session_id, f"Erreur: {str(e)}")
        except Exception:
            pass
    finally:
        _running_tasks.pop(session_id, None)
        _pause_events.pop(session_id, None)
        _stop_flags.pop(session_id, None)
        await db.close()


def _session_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "source": row["source"],
        "status": row["status"],
        "progress": row["progress"],
        "total": row["total"],
        "found": row["found"],
        "logs": json.loads(row["logs"] or "[]"),
        "started_at": row["started_at"],
        "paused_at": row["paused_at"],
        "finished_at": row["finished_at"],
        "created_at": row["created_at"],
    }


@router.get("/scrapers")
async def list_scrapers():
    return SCRAPERS


@router.get("/sessions")
async def list_sessions(db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute(
        "SELECT * FROM scraper_sessions ORDER BY created_at DESC LIMIT 50"
    ) as cur:
        rows = await cur.fetchall()
    return [_session_to_dict(r) for r in rows]


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute(
        "SELECT * FROM scraper_sessions WHERE id = ?", (session_id,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_to_dict(row)


@router.post("/sessions", status_code=201)
async def start_session(
    body: dict,
    background_tasks: BackgroundTasks,
    db: aiosqlite.Connection = Depends(get_db),
):
    scraper_id = body.get("scraper_id", "")
    scraper = next((s for s in SCRAPERS if s["id"] == scraper_id), None)
    if not scraper:
        raise HTTPException(status_code=400, detail=f"Unknown scraper: {scraper_id}")

    cursor = await db.execute(
        "INSERT INTO scraper_sessions (name, source, status, total) VALUES (?, ?, 'pending', ?)",
        (scraper["name"], scraper["source"], scraper["estimated"])
    )
    session_id = cursor.lastrowid
    await db.commit()

    evt = asyncio.Event()
    evt.set()  # not paused initially
    _pause_events[session_id] = evt
    _stop_flags[session_id] = False

    background_tasks.add_task(_run_scraper, session_id, scraper_id)

    async with db.execute("SELECT * FROM scraper_sessions WHERE id=?", (session_id,)) as cur:
        row = await cur.fetchone()
    return _session_to_dict(row)


@router.post("/sessions/{session_id}/pause")
async def pause_session(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT status FROM scraper_sessions WHERE id=?", (session_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if row["status"] != "running":
        raise HTTPException(status_code=400, detail="Session is not running")
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
        raise HTTPException(status_code=400, detail="Session is not paused")
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
        raise HTTPException(status_code=400, detail="Session is not active")
    _stop_flags[session_id] = True
    evt = _pause_events.get(session_id)
    if evt:
        evt.set()  # unblock pause so it can check the stop flag
    return {"status": "stopping"}


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    await db.execute("DELETE FROM scraper_sessions WHERE id=?", (session_id,))
    await db.commit()
