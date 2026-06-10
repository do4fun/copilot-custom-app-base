import { Hono } from 'hono'
import { statSync } from 'fs'
import { db } from '../db.js'

const router = new Hono()

// Excluded FTS5 shadow tables
const FTS_RE = /(_fts|_data|_idx|_content|_docsize|_config)$/

function humanSize(bytes) {
  if (bytes < 1024)          return `${bytes} B`
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getDbPath() {
  try { return db.prepare('PRAGMA database_list').all()[0]?.file || 'in-memory' }
  catch { return 'unknown' }
}

function userTables() {
  return db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map(r => r.name).filter(n => !FTS_RE.test(n))
}

// ─── DB info ────────────────────────────────────────────────────────────────

router.get('/db-info', (c) => {
  const path = getDbPath()
  let size_bytes = 0, size_human = '—'
  try { size_bytes = statSync(path).size; size_human = humanSize(size_bytes) } catch {}

  const { v: sqlite_version } = db.prepare('SELECT sqlite_version() as v').get()

  const tables = userTables().map(name => {
    const { n } = db.prepare(`SELECT COUNT(*) as n FROM "${name}"`).get()
    return { name, count: n }
  })

  return c.json({ path, size_bytes, size_human, sqlite_version, tables })
})

// ─── Table data ──────────────────────────────────────────────────────────────

router.get('/tables/:table', (c) => {
  const table = c.req.param('table').replace(/[^a-zA-Z0-9_]/g, '')
  if (!userTables().includes(table)) return c.json({ error: 'Table inconnue' }, 404)

  const page   = Math.max(1, Number(c.req.query('page') || 1))
  const size   = Math.min(200, Math.max(1, Number(c.req.query('size') || 50)))
  const search = (c.req.query('search') || '').trim()
  const offset = (page - 1) * size

  const colInfo  = db.prepare(`PRAGMA table_info("${table}")`).all()
  const colNames = colInfo.map(col => col.name)
  const textCols = colInfo.filter(col => /TEXT|CHAR|CLOB/i.test(col.type || '')).map(col => col.name)

  let where  = ''
  let params = []
  if (search && textCols.length > 0) {
    where  = 'WHERE ' + textCols.map(col => `"${col}" LIKE ?`).join(' OR ')
    params = textCols.map(() => `%${search}%`)
  }

  const { n: total } = db.prepare(`SELECT COUNT(*) as n FROM "${table}" ${where}`).get(...params)
  const rows = db.prepare(`SELECT * FROM "${table}" ${where} ORDER BY rowid DESC LIMIT ? OFFSET ?`).all(...params, size, offset)

  return c.json({ columns: colNames, rows, total, page, page_size: size, pages: Math.ceil(total / size) })
})

// ─── Purge sessions + scraped skills ─────────────────────────────────────────

router.post('/purge-sessions', (c) => {
  const { changes: skills_deleted } = db.prepare(
    "DELETE FROM skills WHERE source_name IS NOT NULL"
  ).run()
  const { changes: sessions_deleted } = db.prepare(
    "DELETE FROM scraper_sessions"
  ).run()
  db.exec("INSERT INTO skills_fts(skills_fts) VALUES('rebuild')")
  return c.json({ skills_deleted, sessions_deleted })
})

// ─── Process status ───────────────────────────────────────────────────────────

router.get('/status', (c) => {
  return c.json({
    api:        'running',
    pid:        process.pid,
    uptime_s:   Math.floor(process.uptime()),
    memory_mb:  Math.round(process.memoryUsage().rss / 1024 / 1024),
    managed:    !!process.send,   // true only when launched by manager.js
  })
})

// ─── Restart ──────────────────────────────────────────────────────────────────
// target: 'api' | 'frontend' | 'all'
// When running under manager.js, sends an IPC message.
// When running standalone, only 'api' works (exits with restart code 75).

const RESTART_CODE = 75

router.post('/restart', async (c) => {
  if (process.env.VERCEL)
    return c.json({ ok: false, error: 'Restart not available in serverless (Vercel)' }, 501)

  const body   = await c.req.json().catch(() => ({}))
  const target = (body.target || 'api').toLowerCase()

  if (!['api', 'frontend', 'all'].includes(target))
    return c.json({ error: 'target invalide (api | frontend | all)' }, 422)

  if (process.send) {
    // Running under manager.js — delegate restart to parent
    process.send({ action: 'restart', target })
    return c.json({ ok: true, target, managed: true })
  }

  // Standalone mode: can only restart the API itself
  if (target === 'frontend')
    return c.json({ ok: false, error: 'Redémarrage du frontend impossible sans le manager', managed: false }, 503)

  // Schedule exit after response is sent (code 75 = restart signal for manager / shell wrappers)
  c.executionCtx?.waitUntil?.(new Promise(resolve => setTimeout(resolve, 200)))
  setTimeout(() => process.exit(RESTART_CODE), 200)
  return c.json({ ok: true, target, managed: false, warning: 'standalone — redémarre manuellement si nécessaire' })
})

export default router
