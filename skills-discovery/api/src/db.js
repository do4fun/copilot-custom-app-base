import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH
  ?? (process.env.VERCEL ? '/tmp/skills.db' : join(__dirname, '..', '..', 'skills.db'))

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function initDb() {
  db.exec(`
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
      is_favorite INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS scraper_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source TEXT,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      found INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      logs TEXT DEFAULT '[]',
      started_at TEXT,
      paused_at TEXT,
      finished_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scraper_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT DEFAULT 'generic',
      category TEXT DEFAULT 'AI Coding Tool',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
      name, description, features,
      content=skills, content_rowid=id
    );

  `)
  // Migrations (no-op if column already exists)
  try { db.exec('ALTER TABLE scraper_sessions ADD COLUMN failed INTEGER DEFAULT 0') } catch {}
  try { db.exec('ALTER TABLE skills ADD COLUMN readme TEXT') } catch {}

  // Rebuild FTS5 index from the skills table so every skill is searchable,
  // including those inserted before the triggers existed or via external tools.
  db.exec("INSERT INTO skills_fts(skills_fts) VALUES('rebuild')")
}

const DEFAULT_CONFIGS = [
  { name: 'Awesome MCP Servers',         url: 'https://github.com/punkpeye/awesome-mcp-servers', type: 'github-awesome', category: 'MCP Server' },
  { name: 'GitHub — topic:mcp-server',   url: 'topic:mcp-server stars:>10',                      type: 'github-search',  category: 'MCP Server' },
  { name: 'GitHub — model-context-protocol', url: 'topic:model-context-protocol stars:>5',       type: 'github-search',  category: 'MCP Server' },
  { name: 'npm — @modelcontextprotocol', url: '@modelcontextprotocol',                            type: 'npm',            category: 'MCP Server' },
  { name: 'npm — mcp-server',            url: 'mcp-server keywords:mcp',                         type: 'npm',            category: 'MCP Server' },
  { name: 'GitHub — AI Coding Agents',   url: 'ai coding agent llm stars:>100',                  type: 'github-search',  category: 'AI Coding Tool' },
  { name: 'GitHub — Claude Code tools',  url: 'topic:claude-code stars:>5',                      type: 'github-search',  category: 'Claude Code Skill' },
]

const SEED_SKILLS = [
  { name: 'Claude Code CLI', description: 'Official Anthropic CLI for Claude — agentic coding directly in your terminal.', category: 'AI Coding Tool', pricing: 'freemium', popularity_score: 9.9, source_url: 'https://github.com/anthropics/claude-code', tags: ['claude', 'cli', 'ai-coding', 'anthropic'] },
  { name: 'Claude.ai', description: 'Anthropic\'s flagship AI assistant — chat, analysis, coding, and research.', category: 'AI Productivity Tool', pricing: 'freemium', popularity_score: 9.8, source_url: 'https://claude.ai', tags: ['claude', 'ai', 'assistant', 'anthropic'] },
  { name: 'sequential-thinking MCP', description: 'MCP server enabling dynamic, sequential reasoning chains for complex problems.', category: 'MCP Server', pricing: 'free', popularity_score: 8.5, source_url: 'https://github.com/modelcontextprotocol/servers', tags: ['mcp', 'reasoning', 'thinking'] },
  { name: 'brave-search MCP', description: 'MCP server for real-time web search via the Brave Search API.', category: 'MCP Server', pricing: 'freemium', popularity_score: 8.2, source_url: 'https://github.com/modelcontextprotocol/servers', tags: ['mcp', 'search', 'web', 'brave'] },
  { name: 'filesystem MCP', description: 'MCP server providing secure, sandboxed read/write access to local files.', category: 'MCP Server', pricing: 'free', popularity_score: 8.7, source_url: 'https://github.com/modelcontextprotocol/servers', tags: ['mcp', 'filesystem', 'files'] },
  { name: 'github MCP', description: 'MCP server for GitHub — repos, issues, PRs, and code search.', category: 'MCP Server', pricing: 'free', popularity_score: 8.8, source_url: 'https://github.com/modelcontextprotocol/servers', tags: ['mcp', 'github', 'git'] },
  { name: 'Cursor', description: 'AI-first code editor built on VS Code with deep model integration.', category: 'AI Coding Tool', pricing: 'freemium', popularity_score: 9.3, source_url: 'https://cursor.com', tags: ['editor', 'ai-coding', 'vscode'] },
  { name: 'Aider', description: 'Open-source AI pair programmer for your terminal — works with any LLM.', category: 'AI Coding Tool', pricing: 'free', popularity_score: 8.9, source_url: 'https://github.com/Aider-AI/aider', tags: ['cli', 'ai-coding', 'open-source'] },
]

export function seedData() {
  const configCount = db.prepare('SELECT COUNT(*) as n FROM scraper_configs').get()
  if (configCount.n === 0) {
    const ins = db.prepare('INSERT INTO scraper_configs (name, url, type, category) VALUES (?,?,?,?)')
    DEFAULT_CONFIGS.forEach(c => ins.run(c.name, c.url, c.type, c.category))
  }

  const skillCount = db.prepare('SELECT COUNT(*) as n FROM skills').get()
  if (skillCount.n === 0) {
    const insSkill = db.prepare(`
      INSERT INTO skills (name, description, category, pricing, popularity_score, source_url, last_checked, created_at, updated_at)
      VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))
    `)
    const insTag   = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)')
    const insStag  = db.prepare('INSERT OR IGNORE INTO skill_tags (skill_id, tag_id) VALUES (?,?)')
    SEED_SKILLS.forEach(s => {
      const { lastInsertRowid: sid } = insSkill.run(s.name, s.description, s.category, s.pricing, s.popularity_score, s.source_url)
      ;(s.tags || []).forEach(t => {
        insTag.run(t)
        const tag = db.prepare('SELECT id FROM tags WHERE name=?').get(t)
        if (tag) insStag.run(sid, tag.id)
      })
    })
  }
}

export function upsertSkill(item) {
  const name = (item.name || '').trim()
  if (!name) return false
  const existing = db.prepare('SELECT id FROM skills WHERE LOWER(name)=LOWER(?)').get(name)
  if (existing) {
    db.prepare("UPDATE skills SET last_checked=datetime('now') WHERE id=?").run(existing.id)
    return false
  }
  const description = (item.description || '').slice(0, 500)
  const features = Array.isArray(item.features) ? JSON.stringify(item.features) : (item.features || '[]')
  const readme = (item.readme || '').slice(0, 15000)
  const { lastInsertRowid: sid } = db.prepare(`
    INSERT INTO skills (name, description, category, source_url, source_name, pricing, features, version, popularity_score, readme, last_checked, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))
  `).run(
    name,
    description,
    item.category || '',
    item.source_url || '',
    item.source_name || '',
    item.pricing || 'free',
    features,
    item.version || '',
    parseFloat(item.popularity_score) || 0,
    readme,
  )
  db.prepare('INSERT INTO skills_fts(rowid, name, description, features) VALUES (?,?,?,?)').run(sid, name, description, features)
  ;(item.tags || []).forEach(t => {
    const tag = t.toLowerCase().trim()
    if (!tag || tag.length > 40) return
    db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tag)
    const row = db.prepare('SELECT id FROM tags WHERE name=?').get(tag)
    if (row) db.prepare('INSERT OR IGNORE INTO skill_tags (skill_id, tag_id) VALUES (?,?)').run(sid, row.id)
  })
  return true
}

export function getInventory() {
  const urls = new Set(
    db.prepare("SELECT source_url FROM skills WHERE source_url != '' AND source_url IS NOT NULL")
      .all().map(r => r.source_url)
  )
  const names = new Set(
    db.prepare('SELECT LOWER(name) as n FROM skills').all().map(r => r.n)
  )
  return { urls, names }
}

export function appendLog(sessionId, msg) {
  const row = db.prepare('SELECT logs FROM scraper_sessions WHERE id=?').get(sessionId)
  const logs = JSON.parse(row?.logs || '[]')
  logs.push({ time: new Date().toISOString(), msg })
  db.prepare('UPDATE scraper_sessions SET logs=? WHERE id=?').run(JSON.stringify(logs.slice(-200)), sessionId)
}
