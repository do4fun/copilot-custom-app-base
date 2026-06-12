import { Hono } from 'hono'
import { db } from '../db.js'

const router = new Hono()

// Skills favoris — déclaré avant /:id pour éviter la collision de route
router.get('/favorites/list', (c) => {
  const skills = db
    .prepare(
      `SELECT s.* FROM skills s JOIN favorites f ON f.skill_id = s.id
       ORDER BY f.created_at DESC`
    )
    .all()
  const getTags = db.prepare(
    'SELECT t.name FROM tags t JOIN skill_tags st ON st.tag_id = t.id WHERE st.skill_id = ?'
  )
  for (const s of skills) {
    s.tags = getTags.all(s.id).map((r) => r.name)
    s.is_favorite = 1
  }
  return c.json(skills)
})

router.get('/', (c) => {
  const collections = db
    .prepare(
      `SELECT col.*, COUNT(cs.skill_id) AS skill_count
       FROM collections col
       LEFT JOIN collection_skills cs ON cs.collection_id = col.id
       GROUP BY col.id ORDER BY col.created_at DESC`
    )
    .all()
  return c.json(collections)
})

router.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(id)
  if (!collection) return c.json({ error: 'Collection introuvable' }, 404)
  collection.skills = db
    .prepare(
      `SELECT s.* FROM skills s JOIN collection_skills cs ON cs.skill_id = s.id
       WHERE cs.collection_id = ? ORDER BY s.name`
    )
    .all(id)
  return c.json(collection)
})

router.post('/', async (c) => {
  const { name, description } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'name requis' }, 400)
  const info = db
    .prepare('INSERT INTO collections (name, description) VALUES (?, ?)')
    .run(name.trim(), description || null)
  return c.json(db.prepare('SELECT * FROM collections WHERE id = ?').get(info.lastInsertRowid), 201)
})

router.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const col = db.prepare('SELECT * FROM collections WHERE id = ?').get(id)
  if (!col) return c.json({ error: 'Collection introuvable' }, 404)
  const body = await c.req.json()
  db.prepare('UPDATE collections SET name = ?, description = ? WHERE id = ?').run(
    body.name ?? col.name,
    body.description ?? col.description,
    id
  )
  return c.json(db.prepare('SELECT * FROM collections WHERE id = ?').get(id))
})

router.delete('/:id', (c) => {
  const info = db.prepare('DELETE FROM collections WHERE id = ?').run(Number(c.req.param('id')))
  if (!info.changes) return c.json({ error: 'Collection introuvable' }, 404)
  return c.body(null, 204)
})

router.post('/:id/skills/:skillId', (c) => {
  const id = Number(c.req.param('id'))
  const skillId = Number(c.req.param('skillId'))
  if (!db.prepare('SELECT 1 FROM collections WHERE id = ?').get(id))
    return c.json({ error: 'Collection introuvable' }, 404)
  if (!db.prepare('SELECT 1 FROM skills WHERE id = ?').get(skillId))
    return c.json({ error: 'Skill introuvable' }, 404)
  db.prepare('INSERT OR IGNORE INTO collection_skills (collection_id, skill_id) VALUES (?, ?)').run(id, skillId)
  return c.json({ collection_id: id, skill_id: skillId }, 201)
})

router.delete('/:id/skills/:skillId', (c) => {
  const info = db
    .prepare('DELETE FROM collection_skills WHERE collection_id = ? AND skill_id = ?')
    .run(Number(c.req.param('id')), Number(c.req.param('skillId')))
  if (!info.changes) return c.json({ error: 'Association introuvable' }, 404)
  return c.body(null, 204)
})

export default router
