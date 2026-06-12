import { Hono } from 'hono'
import { db } from '../db.js'

const router = new Hono()

/** Construit une requête FTS5 préfixe à partir d'une saisie libre. */
function buildFtsQuery(q) {
  const tokens = String(q)
    .split(/\s+/)
    .map((t) => t.replace(/["'*()^]/g, ''))
    .filter(Boolean)
  if (!tokens.length) return null
  return tokens.map((t) => `"${t}" *`).join(' ')
}

router.get('/search', (c) => {
  const q = (c.req.query('q') || '').trim()
  const category = c.req.query('category') || ''
  const pricing = c.req.query('pricing') || ''
  const tagsParam = (c.req.query('tags') || '').trim()
  const page = Math.max(1, Number(c.req.query('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('page_size')) || 20))

  const tags = tagsParam
    ? tagsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    : []

  const conditions = ['s.is_active = 1']
  const params = []

  let from = 'FROM skills s'
  let orderBy = 'ORDER BY s.popularity_score DESC, s.name'

  const ftsQuery = q ? buildFtsQuery(q) : null
  if (ftsQuery) {
    from = 'FROM skills s JOIN skills_fts fts ON s.id = fts.rowid'
    conditions.push('skills_fts MATCH ?')
    params.push(ftsQuery)
    orderBy = 'ORDER BY rank'
  }
  if (category) {
    conditions.push('s.category = ?')
    params.push(category)
  }
  if (pricing) {
    conditions.push('s.pricing = ?')
    params.push(pricing)
  }
  if (tags.length) {
    conditions.push(
      `s.id IN (SELECT st.skill_id FROM skill_tags st JOIN tags t ON st.tag_id = t.id
                WHERE t.name IN (${tags.map(() => '?').join(',')}))`
    )
    params.push(...tags)
  }

  const where = `WHERE ${conditions.join(' AND ')}`
  let total = 0
  let results = []
  try {
    total = db.prepare(`SELECT COUNT(*) AS n ${from} ${where}`).get(...params).n
    results = db
      .prepare(`SELECT s.* ${from} ${where} ${orderBy} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize)
  } catch (err) {
    // requête FTS5 invalide (caractères spéciaux) → résultat vide plutôt que 500
    return c.json({ results: [], total: 0, page, page_size: pageSize, error: String(err.message) })
  }

  const getTags = db.prepare(
    'SELECT t.name FROM tags t JOIN skill_tags st ON st.tag_id = t.id WHERE st.skill_id = ?'
  )
  for (const s of results) s.tags = getTags.all(s.id).map((r) => r.name)

  return c.json({ results, total, page, page_size: pageSize })
})

router.get('/categories', (c) => {
  const rows = db
    .prepare(
      "SELECT DISTINCT category FROM skills WHERE is_active = 1 AND category IS NOT NULL AND category != '' ORDER BY category"
    )
    .all()
  return c.json(rows.map((r) => r.category))
})

router.get('/tags', (c) => {
  const rows = db
    .prepare(
      `SELECT t.name, COUNT(st.skill_id) AS count
       FROM tags t JOIN skill_tags st ON st.tag_id = t.id
       JOIN skills s ON s.id = st.skill_id AND s.is_active = 1
       GROUP BY t.id HAVING count > 0
       ORDER BY count DESC, t.name`
    )
    .all()
  return c.json(rows)
})

export default router
