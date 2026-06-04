from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import aiosqlite
import json
from datetime import datetime

from ..database import get_db
from ..models import (
    SkillCreate, SkillOut, SkillUpdate, SkillDetailOut,
    NoteCreate, NoteOut, TagOut, PaginatedSkills
)

router = APIRouter()


async def fetch_tags_for_skill(db: aiosqlite.Connection, skill_id: int) -> List[TagOut]:
    async with db.execute(
        """SELECT t.id, t.name FROM tags t
           JOIN skill_tags st ON st.tag_id = t.id
           WHERE st.skill_id = ?""",
        (skill_id,)
    ) as cursor:
        rows = await cursor.fetchall()
        return [TagOut(id=r["id"], name=r["name"]) for r in rows]


async def get_or_create_tag(db: aiosqlite.Connection, tag_name: str) -> int:
    tag_name = tag_name.strip().lower()
    async with db.execute("SELECT id FROM tags WHERE name = ?", (tag_name,)) as cursor:
        row = await cursor.fetchone()
        if row:
            return row["id"]
    cursor = await db.execute("INSERT INTO tags (name) VALUES (?)", (tag_name,))
    await db.commit()
    return cursor.lastrowid


async def row_to_skill(db: aiosqlite.Connection, row) -> SkillOut:
    tags = await fetch_tags_for_skill(db, row["id"])
    async with db.execute("SELECT 1 FROM favorites WHERE skill_id = ?", (row["id"],)) as fav:
        is_fav = await fav.fetchone() is not None
    return SkillOut(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        category=row["category"],
        source_url=row["source_url"],
        source_name=row["source_name"],
        pricing=row["pricing"] or "free",
        price_details=row["price_details"],
        features=row["features"] or "[]",
        install_instructions=row["install_instructions"],
        version=row["version"],
        last_checked=row["last_checked"],
        is_active=row["is_active"],
        popularity_score=row["popularity_score"] or 0.0,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        tags=tags,
        is_favorite=is_fav,
    )


@router.get("", response_model=PaginatedSkills)
async def list_skills(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute("SELECT COUNT(*) as cnt FROM skills WHERE is_active = 1") as cursor:
        count_row = await cursor.fetchone()
        total = count_row["cnt"] if count_row else 0

    offset = (page - 1) * page_size
    async with db.execute(
        "SELECT * FROM skills WHERE is_active = 1 ORDER BY popularity_score DESC, name ASC LIMIT ? OFFSET ?",
        (page_size, offset)
    ) as cursor:
        rows = await cursor.fetchall()

    skills = [await row_to_skill(db, row) for row in rows]
    return PaginatedSkills(total=total, page=page, page_size=page_size, skills=skills)


@router.get("/{skill_id}", response_model=SkillDetailOut)
async def get_skill(skill_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill = await row_to_skill(db, row)

    # Notes
    async with db.execute(
        "SELECT * FROM user_notes WHERE skill_id = ? ORDER BY created_at DESC",
        (skill_id,)
    ) as cursor:
        note_rows = await cursor.fetchall()
    notes = [NoteOut(id=r["id"], skill_id=r["skill_id"], content=r["content"], created_at=r["created_at"]) for r in note_rows]

    # Combinations
    async with db.execute(
        """SELECT sc.*, s.name as other_skill_name, s.description as other_skill_desc,
                  s.category as other_skill_category, s.pricing as other_skill_pricing
           FROM skill_combinations sc
           JOIN skills s ON (
               CASE WHEN sc.skill_id_1 = ? THEN sc.skill_id_2 ELSE sc.skill_id_1 END = s.id
           )
           WHERE sc.skill_id_1 = ? OR sc.skill_id_2 = ?""",
        (skill_id, skill_id, skill_id)
    ) as cursor:
        combo_rows = await cursor.fetchall()
    combinations = [
        {
            "id": r["id"],
            "use_case": r["use_case"],
            "description": r["description"],
            "other_skill_name": r["other_skill_name"],
            "other_skill_desc": r["other_skill_desc"],
            "other_skill_category": r["other_skill_category"],
            "other_skill_pricing": r["other_skill_pricing"],
        }
        for r in combo_rows
    ]

    return SkillDetailOut(
        **skill.model_dump(),
        notes=notes,
        combinations=combinations,
    )


@router.post("", response_model=SkillOut, status_code=201)
async def create_skill(skill_in: SkillCreate, db: aiosqlite.Connection = Depends(get_db)):
    now = datetime.utcnow().isoformat()
    cursor = await db.execute(
        """INSERT INTO skills (name, description, category, source_url, source_name,
           pricing, price_details, features, install_instructions, version,
           popularity_score, last_checked, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            skill_in.name, skill_in.description, skill_in.category,
            skill_in.source_url, skill_in.source_name, skill_in.pricing,
            skill_in.price_details, skill_in.features, skill_in.install_instructions,
            skill_in.version, skill_in.popularity_score, now, now, now,
        )
    )
    skill_id = cursor.lastrowid
    await db.commit()

    for tag_name in (skill_in.tags or []):
        tag_id = await get_or_create_tag(db, tag_name)
        await db.execute(
            "INSERT OR IGNORE INTO skill_tags (skill_id, tag_id) VALUES (?, ?)",
            (skill_id, tag_id)
        )
    await db.commit()

    async with db.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)) as cur:
        row = await cur.fetchone()
    return await row_to_skill(db, row)


@router.put("/{skill_id}", response_model=SkillOut)
async def update_skill(skill_id: int, skill_in: SkillUpdate, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found")

    updates = {}
    for field in ["name", "description", "category", "source_url", "source_name",
                  "pricing", "price_details", "features", "install_instructions",
                  "version", "popularity_score"]:
        val = getattr(skill_in, field, None)
        if val is not None:
            updates[field] = val

    if updates:
        updates["updated_at"] = datetime.utcnow().isoformat()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await db.execute(
            f"UPDATE skills SET {set_clause} WHERE id = ?",
            list(updates.values()) + [skill_id]
        )

    if skill_in.tags is not None:
        await db.execute("DELETE FROM skill_tags WHERE skill_id = ?", (skill_id,))
        for tag_name in skill_in.tags:
            tag_id = await get_or_create_tag(db, tag_name)
            await db.execute(
                "INSERT OR IGNORE INTO skill_tags (skill_id, tag_id) VALUES (?, ?)",
                (skill_id, tag_id)
            )

    await db.commit()

    async with db.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)) as cur:
        row = await cur.fetchone()
    return await row_to_skill(db, row)


@router.delete("/{skill_id}", status_code=204)
async def delete_skill(skill_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT id FROM skills WHERE id = ?", (skill_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found")
    await db.execute("UPDATE skills SET is_active = 0 WHERE id = ?", (skill_id,))
    await db.commit()


@router.post("/{skill_id}/favorite")
async def toggle_favorite(skill_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT id FROM skills WHERE id = ?", (skill_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found")

    async with db.execute("SELECT 1 FROM favorites WHERE skill_id = ?", (skill_id,)) as cursor:
        fav = await cursor.fetchone()

    if fav:
        await db.execute("DELETE FROM favorites WHERE skill_id = ?", (skill_id,))
        await db.commit()
        return {"favorited": False}
    else:
        await db.execute("INSERT INTO favorites (skill_id) VALUES (?)", (skill_id,))
        await db.commit()
        return {"favorited": True}


@router.post("/{skill_id}/notes", response_model=NoteOut, status_code=201)
async def add_note(skill_id: int, note_in: NoteCreate, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT id FROM skills WHERE id = ?", (skill_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found")

    cursor = await db.execute(
        "INSERT INTO user_notes (skill_id, content) VALUES (?, ?)",
        (skill_id, note_in.content)
    )
    note_id = cursor.lastrowid
    await db.commit()

    async with db.execute("SELECT * FROM user_notes WHERE id = ?", (note_id,)) as cur:
        note_row = await cur.fetchone()

    return NoteOut(
        id=note_row["id"],
        skill_id=note_row["skill_id"],
        content=note_row["content"],
        created_at=note_row["created_at"],
    )


@router.delete("/{skill_id}/notes/{note_id}", status_code=204)
async def delete_note(skill_id: int, note_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute(
        "SELECT id FROM user_notes WHERE id = ? AND skill_id = ?", (note_id, skill_id)
    ) as cursor:
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.execute("DELETE FROM user_notes WHERE id = ?", (note_id,))
    await db.commit()


@router.get("/{skill_id}/combinations")
async def get_combinations(skill_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT id FROM skills WHERE id = ?", (skill_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found")

    async with db.execute(
        """SELECT sc.*, s.name as other_skill_name, s.id as other_skill_id,
                  s.category as other_skill_category
           FROM skill_combinations sc
           JOIN skills s ON (
               CASE WHEN sc.skill_id_1 = ? THEN sc.skill_id_2 ELSE sc.skill_id_1 END = s.id
           )
           WHERE sc.skill_id_1 = ? OR sc.skill_id_2 = ?""",
        (skill_id, skill_id, skill_id)
    ) as cursor:
        rows = await cursor.fetchall()

    return [
        {
            "id": r["id"],
            "use_case": r["use_case"],
            "description": r["description"],
            "other_skill_id": r["other_skill_id"],
            "other_skill_name": r["other_skill_name"],
            "other_skill_category": r["other_skill_category"],
        }
        for r in rows
    ]
