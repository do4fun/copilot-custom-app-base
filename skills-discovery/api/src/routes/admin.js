import { Hono } from 'hono'
import { statSync } from 'fs'
import { db, DB_PATH } from '../db.js'

const router = new Hono()

const ALLOWED_TABLES = [
  'skills',
  'tags',
  'skill_tags',
  'collections',
  'collection_skills',
  'favorites',
  'user_notes',
  'skill_combinations',
  'scraper_configs',
  'scraper_sessions',
]

router.get('/db-info', (c) => {
  let size = 0
  try {
    size = statSync(DB_PATH).size
  } catch {
    /* base pas encore créée */
  }
  const version = db.prepare('SELECT sqlite_version() AS v').get().v

  const counts = {}
  for (const table of ALLOWED_TABLES) {
    counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
  }

  return c.json({ path: DB_PATH, size_bytes: size, sqlite_version: version, tables: counts })
})

router.get('/tables/:table', (c) => {
  const table = c.req.param('table')
  // ne pas exposer les shadow tables FTS5 (skills_fts_*)
  if (!ALLOWED_TABLES.includes(table)) return c.json({ error: 'Table non autorisée' }, 400)

  const page = Math.max(1, Number(c.req.query('page')) || 1)
  const size = Math.min(200, Math.max(1, Number(c.req.query('size')) || 50))
  const search = (c.req.query('search') || '').trim()

  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name)

  let where = ''
  const params = []
  if (search) {
    const textCols = columns.filter((col) => !['id'].includes(col))
    where = `WHERE ${textCols.map((col) => `CAST(${col} AS TEXT) LIKE ?`).join(' OR ')}`
    params.push(...textCols.map(() => `%${search}%`))
  }

  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get(...params).n
  const rows = db
    .prepare(`SELECT * FROM ${table} ${where} LIMIT ? OFFSET ?`)
    .all(...params, size, (page - 1) * size)

  return c.json({ table, columns, rows, total, page, size })
})

router.post('/purge-sessions', (c) => {
  const skillsDeleted = db
    .prepare("DELETE FROM skills WHERE source_name IS NOT NULL AND source_name NOT IN ('Web', 'Seed')")
    .run().changes
  const sessionsDeleted = db.prepare('DELETE FROM scraper_sessions').run().changes
  return c.json({ skills_deleted: skillsDeleted, sessions_deleted: sessionsDeleted })
})

router.get('/status', (c) => {
  const mem = process.memoryUsage()
  return c.json({
    pid: process.pid,
    uptime_s: Math.round(process.uptime()),
    memory: { rss: mem.rss, heap_used: mem.heapUsed, heap_total: mem.heapTotal },
    managed: !!process.send,
  })
})

router.post('/restart', async (c) => {
  const { target } = await c.req.json()
  if (!['api', 'frontend', 'all'].includes(target)) {
    return c.json({ error: 'target doit être api, frontend ou all' }, 400)
  }

  if (process.send) {
    process.send({ action: 'restart', target })
    return c.json({ restarting: target, managed: true })
  }

  if (target === 'frontend') {
    return c.json({ error: 'Restart frontend indisponible hors process manager' }, 400)
  }

  // hors manager : exit(75) → restart auto par le superviseur (node --watch, pm2...)
  setTimeout(() => process.exit(75), 200)
  return c.json({ restarting: target, managed: false })
})

export default router
