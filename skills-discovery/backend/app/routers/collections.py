from fastapi import APIRouter, Depends, HTTPException
from typing import List
import aiosqlite

from ..database import get_db
from ..models import CollectionCreate, CollectionOut, SkillOut, TagOut

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


async def build_collection_out(db: aiosqlite.Connection, row) -> CollectionOut:
    async with db.execute(
        """SELECT s.* FROM skills s
           JOIN collection_skills cs ON cs.skill_id = s.id
           WHERE cs.collection_id = ? AND s.is_active = 1""",
        (row["id"],)
    ) as cursor:
        skill_rows = await cursor.fetchall()
    skills = [await row_to_skill(db, sr) for sr in skill_rows]
    return CollectionOut(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
        skills=skills,
    )


@router.get("", response_model=List[CollectionOut])
async def list_collections(db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT * FROM collections ORDER BY created_at DESC") as cursor:
        rows = await cursor.fetchall()
    return [await build_collection_out(db, row) for row in rows]


@router.get("/{collection_id}", response_model=CollectionOut)
async def get_collection(collection_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT * FROM collections WHERE id = ?", (collection_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Collection not found")
    return await build_collection_out(db, row)


@router.post("", response_model=CollectionOut, status_code=201)
async def create_collection(coll_in: CollectionCreate, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        "INSERT INTO collections (name, description) VALUES (?, ?)",
        (coll_in.name, coll_in.description)
    )
    coll_id = cursor.lastrowid
    await db.commit()
    async with db.execute("SELECT * FROM collections WHERE id = ?", (coll_id,)) as cur:
        row = await cur.fetchone()
    return await build_collection_out(db, row)


@router.put("/{collection_id}", response_model=CollectionOut)
async def update_collection(
    collection_id: int,
    coll_in: CollectionCreate,
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute("SELECT id FROM collections WHERE id = ?", (collection_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Collection not found")
    await db.execute(
        "UPDATE collections SET name = ?, description = ? WHERE id = ?",
        (coll_in.name, coll_in.description, collection_id)
    )
    await db.commit()
    async with db.execute("SELECT * FROM collections WHERE id = ?", (collection_id,)) as cur:
        row = await cur.fetchone()
    return await build_collection_out(db, row)


@router.delete("/{collection_id}", status_code=204)
async def delete_collection(collection_id: int, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute("SELECT id FROM collections WHERE id = ?", (collection_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Collection not found")
    await db.execute("DELETE FROM collections WHERE id = ?", (collection_id,))
    await db.commit()


@router.post("/{collection_id}/skills/{skill_id}", status_code=201)
async def add_skill_to_collection(
    collection_id: int, skill_id: int, db: aiosqlite.Connection = Depends(get_db)
):
    async with db.execute("SELECT id FROM collections WHERE id = ?", (collection_id,)) as cursor:
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Collection not found")
    async with db.execute("SELECT id FROM skills WHERE id = ?", (skill_id,)) as cursor:
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Skill not found")
    await db.execute(
        "INSERT OR IGNORE INTO collection_skills (collection_id, skill_id) VALUES (?, ?)",
        (collection_id, skill_id)
    )
    await db.commit()
    return {"added": True}


@router.delete("/{collection_id}/skills/{skill_id}", status_code=204)
async def remove_skill_from_collection(
    collection_id: int, skill_id: int, db: aiosqlite.Connection = Depends(get_db)
):
    await db.execute(
        "DELETE FROM collection_skills WHERE collection_id = ? AND skill_id = ?",
        (collection_id, skill_id)
    )
    await db.commit()


@router.get("/favorites/list", response_model=List[SkillOut])
async def get_favorites(db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute(
        """SELECT s.* FROM skills s
           JOIN favorites f ON f.skill_id = s.id
           WHERE s.is_active = 1
           ORDER BY f.created_at DESC"""
    ) as cursor:
        rows = await cursor.fetchall()
    return [await row_to_skill(db, row) for row in rows]
