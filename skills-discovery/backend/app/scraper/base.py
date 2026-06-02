from abc import ABC, abstractmethod
from typing import List, Dict, Any
import aiosqlite


class BaseScraper(ABC):
    """Base class for all skill scrapers."""

    def __init__(self, db: aiosqlite.Connection):
        self.db = db

    @abstractmethod
    async def scrape(self) -> List[Dict[str, Any]]:
        """Scrape and return a list of skill dicts."""
        pass

    async def save_skill(self, skill_data: Dict[str, Any]) -> int:
        """Insert a skill into the database, returning its ID."""
        import json
        from datetime import datetime

        features = skill_data.get("features", [])
        if isinstance(features, list):
            features = json.dumps(features)

        now = datetime.utcnow().isoformat()
        cursor = await self.db.execute(
            """INSERT INTO skills (name, description, category, source_url, source_name,
               pricing, price_details, features, install_instructions, version,
               popularity_score, last_checked, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                skill_data.get("name", ""),
                skill_data.get("description", ""),
                skill_data.get("category", ""),
                skill_data.get("source_url", ""),
                skill_data.get("source_name", ""),
                skill_data.get("pricing", "free"),
                skill_data.get("price_details", ""),
                features,
                skill_data.get("install_instructions", ""),
                skill_data.get("version", ""),
                skill_data.get("popularity_score", 0.0),
                now,
                now,
                now,
            )
        )
        skill_id = cursor.lastrowid

        # Handle tags
        for tag_name in skill_data.get("tags", []):
            tag_name = tag_name.strip().lower()
            if not tag_name:
                continue
            async with self.db.execute(
                "SELECT id FROM tags WHERE name = ?", (tag_name,)
            ) as tag_cursor:
                tag_row = await tag_cursor.fetchone()
            if tag_row:
                tag_id = tag_row["id"]
            else:
                tag_cursor = await self.db.execute(
                    "INSERT INTO tags (name) VALUES (?)", (tag_name,)
                )
                tag_id = tag_cursor.lastrowid

            await self.db.execute(
                "INSERT OR IGNORE INTO skill_tags (skill_id, tag_id) VALUES (?, ?)",
                (skill_id, tag_id)
            )

        await self.db.commit()
        return skill_id

    async def run(self) -> int:
        """Run the scraper and save all results. Returns count of saved skills."""
        skills = await self.scrape()
        count = 0
        for skill_data in skills:
            try:
                await self.save_skill(skill_data)
                count += 1
            except Exception as e:
                print(f"Error saving skill {skill_data.get('name', 'unknown')}: {e}")
        return count
