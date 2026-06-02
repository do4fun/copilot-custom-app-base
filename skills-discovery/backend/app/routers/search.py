from fastapi import APIRouter, Depends, Query
from typing import Optional, List
import aiosqlite
import json

from ..database import get_db
from ..models import SkillOut, TagOut, PaginatedSkills

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
    fav = await db.execute("SELECT 1 FROM favorites WHERE skill_id = ?", (row["id"],))
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


@router.get("/search", response_model=PaginatedSkills)
async def search_skills(
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    pricing: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: aiosqlite.Connection = Depends(get_db),
):
    conditions = ["s.is_active = 1"]
    params: list = []

    if q and q.strip():
        # Use FTS5 for full-text search
        conditions.append(
            "s.id IN (SELECT rowid FROM skills_fts WHERE skills_fts MATCH ?)"
        )
        params.append(q.strip() + "*")

    if category and category.strip():
        conditions.append("s.category = ?")
        params.append(category.strip())

    if pricing and pricing.strip():
        conditions.append("s.pricing = ?")
        params.append(pricing.strip())

    if tags and tags.strip():
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        for tag in tag_list:
            conditions.append(
                """s.id IN (
                    SELECT st.skill_id FROM skill_tags st
                    JOIN tags t ON t.id = st.tag_id
                    WHERE t.name = ?
                )"""
            )
            params.append(tag)

    where_clause = " AND ".join(conditions)
    base_query = f"""
        SELECT s.* FROM skills s
        WHERE {where_clause}
        ORDER BY s.popularity_score DESC, s.name ASC
    """

    # Count total
    count_query = f"SELECT COUNT(*) as cnt FROM skills s WHERE {where_clause}"
    async with db.execute(count_query, params) as cursor:
        count_row = await cursor.fetchone()
        total = count_row["cnt"] if count_row else 0

    # Paginate
    offset = (page - 1) * page_size
    paged_query = base_query + f" LIMIT ? OFFSET ?"
    async with db.execute(paged_query, params + [page_size, offset]) as cursor:
        rows = await cursor.fetchall()

    skills = [await row_to_skill(db, row) for row in rows]

    return PaginatedSkills(total=total, page=page, page_size=page_size, skills=skills)


@router.get("/categories")
async def get_categories(db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute(
        "SELECT DISTINCT category FROM skills WHERE category IS NOT NULL AND is_active = 1 ORDER BY category"
    ) as cursor:
        rows = await cursor.fetchall()
        return [r["category"] for r in rows]


@router.get("/tags")
async def get_all_tags(db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute(
        """SELECT t.id, t.name, COUNT(st.skill_id) as count
           FROM tags t
           LEFT JOIN skill_tags st ON st.tag_id = t.id
           GROUP BY t.id, t.name
           ORDER BY count DESC, t.name ASC"""
    ) as cursor:
        rows = await cursor.fetchall()
        return [{"id": r["id"], "name": r["name"], "count": r["count"]} for r in rows]
