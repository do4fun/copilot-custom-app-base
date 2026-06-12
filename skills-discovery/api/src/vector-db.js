import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { db as mainDb } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// skills_vectors.db vit à la racine de skills-discovery/
export const VECTOR_DB_PATH = join(__dirname, '../../skills_vectors.db')

export const vdb = new Database(VECTOR_DB_PATH)
vdb.pragma('journal_mode = WAL')

// Espace de capacités — 40 dimensions
export const CAPABILITY_DIMS = [
  'code-generation', 'code-review', 'code-refactor', 'code-debug',
  'github', 'git', 'repository', 'version-control',
  'database', 'sql', 'query', 'schema',
  'cli', 'terminal', 'command', 'shell',
  'mcp-server', 'tool-use', 'function-calling', 'agent',
  'search', 'web', 'browser', 'scraping',
  'file-system', 'file-read', 'file-write', 'directory',
  'api', 'rest', 'http', 'webhook',
  'testing', 'deployment', 'ci-cd', 'docker',
  'documentation', 'markdown', 'writing', 'translation',
]

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you',
  'are', 'can', 'use', 'using', 'via', 'les', 'des', 'une', 'pour',
  'avec', 'dans', 'sur', 'par', 'est', 'qui', 'que',
])

const MAX_TFIDF_TERMS = 60

export function initVectorDb() {
  vdb.exec(`
    CREATE TABLE IF NOT EXISTS skill_embeddings (
      skill_id    INTEGER PRIMARY KEY,
      tfidf_vec   TEXT,
      cap_vec     TEXT,
      text_snip   TEXT,
      embedded_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS corpus_vocab (term TEXT PRIMARY KEY, doc_freq INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS corpus_meta  (key TEXT PRIMARY KEY, value TEXT);
  `)
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9@/-]+/)
    .flatMap((t) => t.split('/'))
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

function termCounts(tokens) {
  const counts = new Map()
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1)
  return counts
}

function getDocCount() {
  const row = vdb.prepare("SELECT value FROM corpus_meta WHERE key = 'doc_count'").get()
  return row ? Number(row.value) : 0
}

function setDocCount(n) {
  vdb.prepare("INSERT INTO corpus_meta (key, value) VALUES ('doc_count', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(n))
}

function idf(term, docCount) {
  const row = vdb.prepare('SELECT doc_freq FROM corpus_vocab WHERE term = ?').get(term)
  const df = row ? row.doc_freq : 0
  return Math.log(1 + (docCount + 1) / (df + 1))
}

/** Vecteur TF-IDF sparse {term: score} pour un texte donné. */
function tfidfVector(text) {
  const tokens = tokenize(text)
  if (!tokens.length) return {}
  const counts = termCounts(tokens)
  const docCount = getDocCount()
  const vec = {}
  for (const [term, count] of counts) {
    vec[term] = (count / tokens.length) * idf(term, docCount)
  }
  // garde les termes les plus significatifs (vecteur sparse compact)
  const top = Object.entries(vec)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TFIDF_TERMS)
  return Object.fromEntries(top)
}

/**
 * Vecteur de capacités 40D : occurrences des mots de chaque dimension
 * dans le texte du skill — calculé localement, sans appel LLM.
 */
function capVector(text) {
  const lower = String(text || '').toLowerCase()
  const vec = CAPABILITY_DIMS.map((dim) => {
    const words = dim.split('-')
    let score = 0
    for (const w of words) {
      const matches = lower.match(new RegExp(`\\b${w}`, 'g'))
      if (matches) score += matches.length
    }
    return score / words.length
  })
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
  return norm > 0 ? vec.map((v) => v / norm) : vec
}

function cosineSparse(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  for (const v of Object.values(a)) na += v * v
  for (const v of Object.values(b)) nb += v * v
  if (na === 0 || nb === 0) return 0
  for (const [term, v] of Object.entries(a)) {
    if (b[term]) dot += v * b[term]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function cosineDense(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function skillText(skill, item = {}, tags = []) {
  let features = skill.features || item.features || ''
  if (typeof features === 'string') {
    try {
      const parsed = JSON.parse(features)
      if (Array.isArray(parsed)) features = parsed.join(' ')
    } catch {
      /* texte brut */
    }
  } else if (Array.isArray(features)) {
    features = features.join(' ')
  }
  return [skill.name, skill.description, features, (tags || []).join(' '), skill.category]
    .filter(Boolean)
    .join(' ')
}

/** Vectorise un skill et l'insère dans skill_embeddings. */
export function upsertSkillVector(skill, item = {}, tags = []) {
  if (!skill?.id) return
  const text = skillText(skill, item, tags)
  const tokens = new Set(tokenize(text))

  const existing = vdb.prepare('SELECT skill_id FROM skill_embeddings WHERE skill_id = ?').get(skill.id)
  if (!existing) {
    // met à jour le vocabulaire du corpus (doc_freq par terme unique)
    const upd = vdb.prepare(
      'INSERT INTO corpus_vocab (term, doc_freq) VALUES (?, 1) ON CONFLICT(term) DO UPDATE SET doc_freq = doc_freq + 1'
    )
    const tx = vdb.transaction(() => {
      for (const t of tokens) upd.run(t)
    })
    tx()
    setDocCount(getDocCount() + 1)
  }

  const tfidf = tfidfVector(text)
  const cap = capVector(text)

  vdb
    .prepare(
      `INSERT INTO skill_embeddings (skill_id, tfidf_vec, cap_vec, text_snip, embedded_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(skill_id) DO UPDATE SET
         tfidf_vec = excluded.tfidf_vec,
         cap_vec = excluded.cap_vec,
         text_snip = excluded.text_snip,
         embedded_at = excluded.embedded_at`
    )
    .run(skill.id, JSON.stringify(tfidf), JSON.stringify(cap), text.slice(0, 300))
}

/**
 * Recherche sémantique : score = 0.65 × cosine_tfidf + 0.35 × cosine_cap.
 * Match types : direct (≥ 70 % du max) · building_block (30-70 %) · enhancement (< 30 %).
 */
export function semanticSearch(query, topK = 10) {
  const qTfidf = tfidfVector(query)
  const qCap = capVector(query)

  const activeSkills = mainDb
    .prepare('SELECT id, name, description, category FROM skills WHERE is_active = 1')
    .all()
  const activeById = new Map(activeSkills.map((s) => [s.id, s]))

  const embeddings = vdb.prepare('SELECT skill_id, tfidf_vec, cap_vec FROM skill_embeddings').all()

  const scored = []
  for (const e of embeddings) {
    const skill = activeById.get(e.skill_id)
    if (!skill) continue
    let tfidf = {}
    let cap = []
    try {
      tfidf = JSON.parse(e.tfidf_vec || '{}')
      cap = JSON.parse(e.cap_vec || '[]')
    } catch {
      continue
    }
    const score = 0.65 * cosineSparse(qTfidf, tfidf) + 0.35 * cosineDense(qCap, cap)
    if (score > 0) {
      scored.push({
        skill_id: skill.id,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        score,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, topK)
  const max = top[0]?.score || 0
  for (const r of top) {
    const ratio = max > 0 ? r.score / max : 0
    r.match_type = ratio >= 0.7 ? 'direct' : ratio >= 0.3 ? 'building_block' : 'enhancement'
    r.score = Number(r.score.toFixed(4))
  }
  return top
}

/** Vectorise tous les skills actifs sans embedding (lancé au démarrage). */
export async function syncMissingVectors() {
  // skill_embeddings est dans une autre base : on charge les ids existants en mémoire
  const existing = new Set(vdb.prepare('SELECT skill_id FROM skill_embeddings').all().map((r) => r.skill_id))
  const skills = mainDb.prepare('SELECT * FROM skills WHERE is_active = 1').all()
  const getTags = mainDb.prepare(
    'SELECT t.name FROM tags t JOIN skill_tags st ON st.tag_id = t.id WHERE st.skill_id = ?'
  )

  let synced = 0
  for (const skill of skills) {
    if (existing.has(skill.id)) continue
    const tags = getTags.all(skill.id).map((r) => r.name)
    upsertSkillVector(skill, {}, tags)
    synced++
    if (synced % 100 === 0) await new Promise((r) => setImmediate(r))
  }
  return { synced, total: skills.length }
}
