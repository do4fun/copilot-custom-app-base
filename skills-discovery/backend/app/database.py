import aiosqlite
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "skills.db")

async def get_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")

        await db.executescript("""
            CREATE TABLE IF NOT EXISTS skills (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT,
                source_url TEXT,
                source_name TEXT,
                pricing TEXT DEFAULT 'free',
                price_details TEXT,
                features TEXT DEFAULT '[]',
                install_instructions TEXT,
                version TEXT,
                last_checked TEXT,
                is_active INTEGER DEFAULT 1,
                popularity_score REAL DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            );

            CREATE TABLE IF NOT EXISTS skill_tags (
                skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
                tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (skill_id, tag_id)
            );

            CREATE TABLE IF NOT EXISTS user_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS collections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS collection_skills (
                collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
                skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
                PRIMARY KEY (collection_id, skill_id)
            );

            CREATE TABLE IF NOT EXISTS favorites (
                skill_id INTEGER PRIMARY KEY REFERENCES skills(id) ON DELETE CASCADE,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS skill_combinations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                skill_id_1 INTEGER REFERENCES skills(id),
                skill_id_2 INTEGER REFERENCES skills(id),
                use_case TEXT,
                description TEXT
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
                name, description, features,
                content=skills, content_rowid=id
            );

            CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
                INSERT INTO skills_fts(rowid, name, description, features)
                VALUES (new.id, new.name, new.description, new.features);
            END;

            CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
                INSERT INTO skills_fts(skills_fts, rowid, name, description, features)
                VALUES('delete', old.id, old.name, old.description, old.features);
            END;

            CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
                INSERT INTO skills_fts(skills_fts, rowid, name, description, features)
                VALUES('delete', old.id, old.name, old.description, old.features);
                INSERT INTO skills_fts(rowid, name, description, features)
                VALUES (new.id, new.name, new.description, new.features);
            END;
        """)
        await db.commit()
        return db


async def get_db_connection():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db
