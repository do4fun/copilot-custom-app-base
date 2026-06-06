import { Hono } from 'hono'
import { db } from '../db.js'

const router = new Hono()

function collectionWithSkills(col) {
  const skills = db.prepare(`
    SELECT s.* FROM skills s
    JOIN collection_skills cs ON cs.skill_id=s.id
    WHERE cs.collection_id=?
  `).all(col.id)
  return { ...col, skills }
}

router.get('/', (c) => {
  return c.json(db.prepare('SELECT * FROM collections ORDER BY created_at DESC').all())
})

router.get('/favorites/list', (c) => {
  const skills = db.prepare(`
    SELECT s.* FROM skills s JOIN favorites f ON f.skill_id=s.id ORDER BY f.created_at DESC
  `).all()
  return c.json(skills)
})

router.get('/:id', (c) => {
  const col = db.prepare('SELECT * FROM collections WHERE id=?').get(Number(c.req.param('id')))
  if (!col) return c.json({ error: 'Collection introuvable' }, 404)
  return c.json(collectionWithSkills(col))
})

router.post('/', async (c) => {
  const { name, description = '' } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'name requis' }, 422)
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO collections (name, description, created_at) VALUES (?,?,datetime('now'))"
  ).run(name.trim(), description)
  return c.json(collectionWithSkills(db.prepare('SELECT * FROM collections WHERE id=?').get(lastInsertRowid)), 201)
})

router.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const { name, description } = await c.req.json()
  db.prepare('UPDATE collections SET name=?, description=? WHERE id=?').run(name, description, id)
  const col = db.prepare('SELECT * FROM collections WHERE id=?').get(id)
  if (!col) return c.json({ error: 'Not found' }, 404)
  return c.json(collectionWithSkills(col))
})

router.delete('/:id', (c) => {
  db.prepare('DELETE FROM collections WHERE id=?').run(Number(c.req.param('id')))
  return c.body(null, 204)
})

router.post('/:id/skills/:skillId', (c) => {
  db.prepare('INSERT OR IGNORE INTO collection_skills (collection_id, skill_id) VALUES (?,?)')
    .run(Number(c.req.param('id')), Number(c.req.param('skillId')))
  return c.json({ ok: true })
})

router.delete('/:id/skills/:skillId', (c) => {
  db.prepare('DELETE FROM collection_skills WHERE collection_id=? AND skill_id=?')
    .run(Number(c.req.param('id')), Number(c.req.param('skillId')))
  return c.body(null, 204)
})

export default router
