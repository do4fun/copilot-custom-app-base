import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// skills.db vit à la racine de skills-discovery/, pas dans api/
export const DB_PATH = join(__dirname, '../../skills.db')

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS skills (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT UNIQUE NOT NULL,
  description          TEXT,
  category             TEXT,
  source_url           TEXT,
  source_name          TEXT,
  pricing              TEXT DEFAULT 'free',
  features             TEXT,
  install_instructions TEXT,
  version              TEXT,
  popularity_score     REAL DEFAULT 0,
  is_active            INTEGER DEFAULT 1,
  is_favorite          INTEGER DEFAULT 0,
  readme               TEXT,
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS skill_tags (
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (skill_id, tag_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  name, description, features,
  content='skills', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, description, features)
  VALUES (new.id, new.name, new.description, new.features);
END;
CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, description, features)
  VALUES ('delete', old.id, old.name, old.description, old.features);
  INSERT INTO skills_fts(rowid, name, description, features)
  VALUES (new.id, new.name, new.description, new.features);
END;
CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, description, features)
  VALUES ('delete', old.id, old.name, old.description, old.features);
END;

CREATE TABLE IF NOT EXISTS collections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS collection_skills (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  skill_id      INTEGER NOT NULL REFERENCES skills(id)      ON DELETE CASCADE,
  PRIMARY KEY (collection_id, skill_id)
);
CREATE TABLE IF NOT EXISTS favorites (
  skill_id   INTEGER PRIMARY KEY REFERENCES skills(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id   INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS skill_combinations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id_1  INTEGER REFERENCES skills(id),
  skill_id_2  INTEGER REFERENCES skills(id),
  use_case    TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS scraper_configs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'generic',
  category   TEXT DEFAULT 'AI Coding Tool',
  is_active  INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS scraper_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT,
  source      TEXT,
  status      TEXT DEFAULT 'pending',
  progress    INTEGER DEFAULT 0,
  total       INTEGER DEFAULT 0,
  found       INTEGER DEFAULT 0,
  failed      INTEGER DEFAULT 0,
  logs        TEXT DEFAULT '[]',
  started_at  TEXT,
  paused_at   TEXT,
  finished_at TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
`

const SEED_SKILLS = [
  {
    name: 'Claude Code CLI',
    description: "Agent de coding en ligne de commande d'Anthropic. Comprend la base de code, édite les fichiers, exécute les tests et automatise les workflows de développement.",
    category: 'AI Coding Tool',
    source_url: 'https://docs.anthropic.com/en/docs/claude-code',
    source_name: 'Seed',
    pricing: 'freemium',
    features: ['Édition multi-fichiers', 'Exécution de commandes', 'Compréhension du repo', 'Hooks et skills', 'MCP client'],
    install_instructions: 'npm install -g @anthropic-ai/claude-code',
    popularity_score: 9.9,
    tags: ['claude', 'cli', 'ai-coding', 'anthropic'],
  },
  {
    name: 'Claude.ai',
    description: "Assistant IA conversationnel d'Anthropic. Analyse de documents, rédaction, code, artifacts interactifs et projets persistants.",
    category: 'AI Productivity Tool',
    source_url: 'https://claude.ai',
    source_name: 'Seed',
    pricing: 'freemium',
    features: ['Conversations', 'Artifacts', 'Projets', 'Analyse de fichiers', 'Vision'],
    install_instructions: 'Accès web : https://claude.ai',
    popularity_score: 9.8,
    tags: ['claude', 'ai', 'assistant', 'anthropic'],
  },
  {
    name: 'sequential-thinking MCP',
    description: 'Serveur MCP de raisonnement séquentiel : décompose les problèmes complexes en étapes de réflexion structurées et révisables.',
    category: 'MCP Server',
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    source_name: 'Seed',
    pricing: 'free',
    features: ['Raisonnement par étapes', 'Révision de pensées', 'Branches de réflexion'],
    install_instructions: 'npx -y @modelcontextprotocol/server-sequential-thinking',
    popularity_score: 8.5,
    tags: ['mcp', 'reasoning', 'thinking'],
  },
  {
    name: 'brave-search MCP',
    description: 'Serveur MCP de recherche web via l\'API Brave Search : recherche web, news et locale pour les agents IA.',
    category: 'MCP Server',
    source_url: 'https://github.com/modelcontextprotocol/servers',
    source_name: 'Seed',
    pricing: 'freemium',
    features: ['Recherche web', 'Recherche locale', 'Filtres de fraîcheur'],
    install_instructions: 'npx -y @modelcontextprotocol/server-brave-search (BRAVE_API_KEY requis)',
    popularity_score: 8.2,
    tags: ['mcp', 'search', 'web', 'brave'],
  },
  {
    name: 'filesystem MCP',
    description: 'Serveur MCP filesystem : lecture, écriture et navigation sécurisées dans des répertoires autorisés.',
    category: 'MCP Server',
    source_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    source_name: 'Seed',
    pricing: 'free',
    features: ['Lecture de fichiers', 'Écriture de fichiers', 'Listing de répertoires', 'Recherche'],
    install_instructions: 'npx -y @modelcontextprotocol/server-filesystem /chemin/autorisé',
    popularity_score: 8.7,
    tags: ['mcp', 'filesystem', 'files'],
  },
  {
    name: 'github MCP',
    description: 'Serveur MCP GitHub : gestion des repos, issues, pull requests et recherche de code via l\'API GitHub.',
    category: 'MCP Server',
    source_url: 'https://github.com/modelcontextprotocol/servers',
    source_name: 'Seed',
    pricing: 'free',
    features: ['Issues et PRs', 'Recherche de code', 'Gestion de repos', 'Commits'],
    install_instructions: 'npx -y @modelcontextprotocol/server-github (GITHUB_TOKEN requis)',
    popularity_score: 8.8,
    tags: ['mcp', 'github', 'git'],
  },
  {
    name: 'Cursor',
    description: 'Éditeur de code IA basé sur VS Code : autocomplétion contextuelle, chat intégré et édition multi-fichiers.',
    category: 'AI Coding Tool',
    source_url: 'https://cursor.com',
    source_name: 'Seed',
    pricing: 'freemium',
    features: ['Autocomplétion IA', 'Chat codebase', 'Édition multi-fichiers', 'Compatible extensions VS Code'],
    install_instructions: 'Télécharger depuis https://cursor.com',
    popularity_score: 9.3,
    tags: ['editor', 'ai-coding', 'vscode'],
  },
  {
    name: 'Aider',
    description: 'Assistant de pair-programming IA en terminal, open source. Édite le code dans un repo git local avec commits automatiques.',
    category: 'AI Coding Tool',
    source_url: 'https://github.com/Aider-AI/aider',
    source_name: 'Seed',
    pricing: 'free',
    features: ['Édition git-aware', 'Commits automatiques', 'Multi-modèles', 'Mode voice'],
    install_instructions: 'pip install aider-chat',
    popularity_score: 8.9,
    tags: ['cli', 'ai-coding', 'open-source'],
  },
]

const SEED_CONFIGS = [
  { name: 'Anthropic Skills (repo officiel)', url: 'https://github.com/anthropics/skills', type: 'github-skill-repo', category: 'Claude Code Skill' },
  { name: 'GitHub Code Search — skill.md', url: 'claude', type: 'github-skill-files', category: 'Claude Code Skill' },
  { name: 'GitHub Code Search — SKILL.md agents', url: 'agent', type: 'github-skill-files', category: 'Claude Code Skill' },
  { name: 'Awesome MCP Servers', url: 'https://github.com/punkpeye/awesome-mcp-servers', type: 'github-awesome', category: 'MCP Server' },
  { name: 'Awesome Claude Code', url: 'https://github.com/hesreallyhim/awesome-claude-code', type: 'github-awesome', category: 'Claude Code Skill' },
  { name: 'GitHub topic mcp-server', url: 'topic:mcp-server', type: 'github-search', category: 'MCP Server' },
  { name: 'GitHub topic model-context-protocol', url: 'topic:model-context-protocol', type: 'github-search', category: 'MCP Server' },
  { name: 'npm @modelcontextprotocol', url: '@modelcontextprotocol', type: 'npm', category: 'MCP Server' },
  { name: 'npm mcp-server', url: 'mcp-server', type: 'npm', category: 'MCP Server' },
  { name: 'GitHub AI agents (stars > 100)', url: 'ai agents stars:>100', type: 'github-search', category: 'AI Coding Tool' },
  { name: 'GitHub Code Search — agents.md', url: 'claude', type: 'github-agent-files', category: 'Claude Code Skill' },
  { name: 'Anthropic Quickstarts (agents.md)', url: 'https://github.com/anthropics/anthropic-quickstarts', type: 'github-agent-repo', category: 'Claude Code Skill' },
]

export function initDb() {
  db.exec(SCHEMA)

  const count = db.prepare('SELECT COUNT(*) AS n FROM skills').get().n
  if (count === 0) {
    for (const skill of SEED_SKILLS) upsertSkill(skill)
  }

  const cfgCount = db.prepare('SELECT COUNT(*) AS n FROM scraper_configs').get().n
  if (cfgCount === 0) {
    const ins = db.prepare(
      'INSERT INTO scraper_configs (name, url, type, category) VALUES (?, ?, ?, ?)'
    )
    for (const c of SEED_CONFIGS) ins.run(c.name, c.url, c.type, c.category)
  }
}

/**
 * Insère un skill si son name (normalisé lowercase) n'existe pas encore.
 * Gère les tags. Retourne l'objet inséré ou null si doublon.
 */
export function upsertSkill(item) {
  if (!item?.name) return null
  const name = String(item.name).trim()
  if (!name) return null

  const existing = db
    .prepare('SELECT id FROM skills WHERE lower(name) = lower(?)')
    .get(name)
  if (existing) return null

  const features = Array.isArray(item.features)
    ? JSON.stringify(item.features)
    : item.features || null

  const info = db
    .prepare(
      `INSERT INTO skills
       (name, description, category, source_url, source_name, pricing, features,
        install_instructions, version, popularity_score, is_active, readme)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      item.description || null,
      item.category || null,
      item.source_url || null,
      item.source_name || null,
      item.pricing || 'free',
      features,
      item.install_instructions || null,
      item.version || null,
      item.popularity_score || 0,
      item.is_active === 0 ? 0 : 1,
      item.readme || null
    )

  const skillId = info.lastInsertRowid
  const tags = (item.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean)
  if (tags.length) {
    const insTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)')
    const getTag = db.prepare('SELECT id FROM tags WHERE name = ?')
    const link = db.prepare('INSERT OR IGNORE INTO skill_tags (skill_id, tag_id) VALUES (?, ?)')
    for (const t of tags) {
      insTag.run(t)
      const tag = getTag.get(t)
      if (tag) link.run(skillId, tag.id)
    }
  }

  return db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId)
}

const LOG_LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR']
const MAX_LOGS = 500

/** Ajoute une entrée au JSON logs de la session. */
export function appendLog(sessionId, message, level = 'INFO') {
  const lvl = LOG_LEVELS.includes(level) ? level : 'INFO'
  const row = db.prepare('SELECT logs FROM scraper_sessions WHERE id = ?').get(sessionId)
  if (!row) return
  let logs = []
  try {
    logs = JSON.parse(row.logs || '[]')
  } catch {
    logs = []
  }
  logs.push({ ts: new Date().toISOString(), msg: String(message), level: lvl })
  if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS)
  db.prepare('UPDATE scraper_sessions SET logs = ? WHERE id = ?').run(JSON.stringify(logs), sessionId)
}

/** Inventaire en mémoire pour déduplication rapide avant insertion. */
export function getInventory() {
  const rows = db.prepare('SELECT name, source_url FROM skills').all()
  const names = new Set()
  const urls = new Set()
  for (const r of rows) {
    if (r.name) names.add(r.name.toLowerCase())
    if (r.source_url) urls.add(r.source_url.toLowerCase())
  }
  return { names, urls }
}
