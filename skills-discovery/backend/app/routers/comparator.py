from fastapi import APIRouter, Depends, HTTPException
from typing import List
import aiosqlite
import json

from ..database import get_db
from ..models import ComparatorRequest, SkillOut, TagOut

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


@router.post("")
async def compare_skills(
    req: ComparatorRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    if len(req.skill_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 skill IDs required")
    if len(req.skill_ids) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 skills can be compared")

    skills = []
    for skill_id in req.skill_ids:
        async with db.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)) as cursor:
            row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Skill {skill_id} not found")
        skills.append(await row_to_skill(db, row))

    # Build comparison matrix
    all_features = set()
    for skill in skills:
        try:
            feats = json.loads(skill.features or "[]")
            if isinstance(feats, list):
                all_features.update(feats)
        except (json.JSONDecodeError, TypeError):
            pass

    all_tags = set()
    for skill in skills:
        for tag in skill.tags:
            all_tags.add(tag.name)

    feature_matrix = {}
    for feature in sorted(all_features):
        feature_matrix[feature] = {}
        for skill in skills:
            try:
                feats = json.loads(skill.features or "[]")
                feature_matrix[feature][skill.id] = feature in feats
            except (json.JSONDecodeError, TypeError):
                feature_matrix[feature][skill.id] = False

    tag_matrix = {}
    for tag in sorted(all_tags):
        tag_matrix[tag] = {}
        for skill in skills:
            tag_matrix[tag][skill.id] = any(t.name == tag for t in skill.tags)

    return {
        "skills": [skill.model_dump() for skill in skills],
        "feature_matrix": feature_matrix,
        "tag_matrix": tag_matrix,
        "comparison": {
            "categories": {s.id: s.category for s in skills},
            "pricing": {s.id: s.pricing for s in skills},
            "price_details": {s.id: s.price_details for s in skills},
            "source_urls": {s.id: s.source_url for s in skills},
            "popularity_scores": {s.id: s.popularity_score for s in skills},
        }
    }
