from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from typing import Optional
import aiosqlite
import asyncio
import json
from datetime import datetime

from ..database import get_db, get_db_connection
from ..agents.discoverer import run_discoverer, DEFAULT_KEYWORDS, DEFAULT_SOURCES
from ..agents.site_scraper import run_site_scraper

router = APIRouter()

# Runtime state  {session_id: {stop, pause_event}}
_agents: dict = {}


async def _log(db: aiosqlite.Connection, session_id: int, msg: str):
    async with db.execute("SELECT logs FROM agent_sessions WHERE id=?", (session_id,)) as cur:
        row = await cur.fetchone()
    logs = json.loads(row["logs"] if row else "[]")
    logs.append({"t": datetime.utcnow().isoformat(), "m": msg})
    await db.execute(
        "UPDATE agent_sessions SET logs=? WHERE id=?",
        (json.dumps(logs[-200:]), session_id),
    )
    await db.commit()


async def _agent_wrapper(session_id: int, agent_type: str, config: dict):
    db = await get_db_connection()
    state = _agents.get(session_id, {})
    try:
        await db.execute(
            "UPDATE agent_sessions SET status='running', started_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), session_id),
        )
        await db.commit()

        if agent_type == "discoverer":
            await run_discoverer(
                session_id, db, config,
                state["stop_flag"], state["pause_event"], _log,
            )
        elif agent_type == "scraper":
            await run_site_scraper(
                session_id, db, config,
                state["stop_flag"], state["pause_event"], _log,
            )
    except Exception as e:
        await _log(db, session_id, f"💥 Erreur fatale: {e}")
    finally:
        await db.execute(
            "UPDATE agent_sessions SET status='stopped', stopped_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), session_id),
        )
        await db.commit()
        _agents.pop(session_id, None)
        await db.close()


def _row(r) -> dict:
    return {
        "id": r["id"],
        "agent_type": r["agent_type"],
        "status": r["status"],
        "config": json.loads(r["config"] or "{}"),
        "stats": json.loads(r["stats"] or "{}"),
        "logs": json.loads(r["logs"] or "[]"),
        "started_at": r["started_at"],
        "paused_at": r["paused_at"],
        "stopped_at": r["stopped_at"],
        "created_at": r["created_at"],
    }


# ─── Agent endpoints ──────────────────────────────────────────────────────────

@router.get("/agents")
async def list_agents(db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT * FROM agent_sessions ORDER BY created_at DESC LIMIT 20") as cur:
        rows = await cur.fetchall()
    return [_row(r) for r in rows]


@router.get("/agents/defaults")
async def get_defaults():
    return {"keywords": DEFAULT_KEYWORDS, "sources": DEFAULT_SOURCES}


@router.post("/agents/start", status_code=201)
async def start_agent(body: dict, bg: BackgroundTasks, db: aiosqlite.Connection = Depends(get_db)):
    agent_type = body.get("agent_type")
    if agent_type not in ("discoverer", "scraper"):
        raise HTTPException(status_code=400, detail="agent_type must be 'discoverer' or 'scraper'")

    config = body.get("config", {})

    cursor = await db.execute(
        "INSERT INTO agent_sessions (agent_type, status, config) VALUES (?,?,?)",
        (agent_type, "starting", json.dumps(config)),
    )
    session_id = cursor.lastrowid
    await db.commit()

    pause_event = asyncio.Event()
    pause_event.set()
    state = {"stop_flag": {"stop": False}, "pause_event": pause_event}
    _agents[session_id] = state

    bg.add_task(_agent_wrapper, session_id, agent_type, config)

    async with db.execute("SELECT * FROM agent_sessions WHERE id=?", (session_id,)) as cur:
        return _row(await cur.fetchone())


@router.post("/agents/{session_id}/pause")
async def pause_agent(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    state = _agents.get(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Agent not running")
    state["pause_event"].clear()
    await db.execute(
        "UPDATE agent_sessions SET status='paused', paused_at=? WHERE id=?",
        (datetime.utcnow().isoformat(), session_id),
    )
    await db.commit()
    return {"status": "paused"}


@router.post("/agents/{session_id}/resume")
async def resume_agent(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    state = _agents.get(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Agent not running")
    state["pause_event"].set()
    await db.execute(
        "UPDATE agent_sessions SET status='running', paused_at=NULL WHERE id=?",
        (session_id,),
    )
    await db.commit()
    return {"status": "running"}


@router.post("/agents/{session_id}/stop")
async def stop_agent(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    state = _agents.get(session_id)
    if state:
        state["stop_flag"]["stop"] = True
        state["pause_event"].set()
    await db.execute(
        "UPDATE agent_sessions SET status='stopping' WHERE id=?", (session_id,)
    )
    await db.commit()
    return {"status": "stopping"}


@router.delete("/agents/{session_id}", status_code=204)
async def delete_agent_session(session_id: int, db: aiosqlite.Connection = Depends(get_db)):
    state = _agents.get(session_id)
    if state:
        state["stop_flag"]["stop"] = True
        state["pause_event"].set()
    await db.execute("DELETE FROM agent_sessions WHERE id=?", (session_id,))
    await db.commit()


# ─── URL Queue endpoints ──────────────────────────────────────────────────────

@router.get("/queue")
async def get_queue(
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: aiosqlite.Connection = Depends(get_db),
):
    where = "WHERE status=?" if status else ""
    params = [status] if status else []

    async with db.execute(
        f"SELECT COUNT(*) as cnt FROM discovered_urls {where}", params
    ) as cur:
        total = (await cur.fetchone())["cnt"]

    async with db.execute(
        f"SELECT * FROM discovered_urls {where} ORDER BY discovered_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ) as cur:
        rows = await cur.fetchall()

    return {
        "total": total,
        "items": [dict(r) for r in rows],
    }


@router.get("/queue/stats")
async def queue_stats(db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute(
        "SELECT status, COUNT(*) as cnt FROM discovered_urls GROUP BY status"
    ) as cur:
        rows = await cur.fetchall()
    return {r["status"]: r["cnt"] for r in rows}


@router.post("/queue/add", status_code=201)
async def add_url_to_queue(body: dict, db: aiosqlite.Connection = Depends(get_db)):
    from ..agents.url_utils import normalize_url, is_skippable
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    if is_skippable(url):
        raise HTTPException(status_code=400, detail="URL filtered (social/binary/known bad)")

    norm = normalize_url(url)
    try:
        await db.execute(
            "INSERT OR IGNORE INTO discovered_urls (url, url_normalized, title, context, source) VALUES (?,?,?,?,?)",
            (url, norm, body.get("title", ""), body.get("context", ""), "manual"),
        )
        await db.commit()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"queued": url}


@router.post("/queue/{url_id}/skip")
async def skip_url(url_id: int, db: aiosqlite.Connection = Depends(get_db)):
    await db.execute(
        "UPDATE discovered_urls SET status='skipped', processed_at=? WHERE id=?",
        (datetime.utcnow().isoformat(), url_id),
    )
    await db.commit()
    return {"skipped": url_id}


@router.post("/queue/{url_id}/reset")
async def reset_url(url_id: int, db: aiosqlite.Connection = Depends(get_db)):
    await db.execute(
        "UPDATE discovered_urls SET status='pending', processed_at=NULL, error_msg=NULL WHERE id=?",
        (url_id,),
    )
    await db.commit()
    return {"reset": url_id}


@router.delete("/queue/clear", status_code=204)
async def clear_queue(
    status: str = Query(..., description="Status to clear: skipped, failed, processed"),
    db: aiosqlite.Connection = Depends(get_db),
):
    await db.execute("DELETE FROM discovered_urls WHERE status=?", (status,))
    await db.commit()
