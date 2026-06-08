import { Hono } from 'hono'
import { db } from '../db.js'

const router = new Hono()

function withTags(skill) {
  const tags = db.prepare(`
    SELECT t.id, t.name FROM tags t
    JOIN skill_tags st ON st.tag_id=t.id WHERE st.skill_id=?
  `).all(skill.id)
  const isFav = !!db.prepare('SELECT 1 FROM favorites WHERE skill_id=?').get(skill.id)
  const notes = db.prepare('SELECT * FROM user_notes WHERE skill_id=? ORDER BY created_at DESC').all(skill.id)
  return { ...skill, tags, is_favorite: isFav, notes }
}

router.get('/', (c) => {
  const page = Number(c.req.query('page') || 1)
  const size = Math.min(Number(c.req.query('page_size') || 20), 100)
  const offset = (page - 1) * size
  const total = db.prepare('SELECT COUNT(*) as n FROM skills WHERE is_active=1').get().n
  const skills = db.prepare('SELECT * FROM skills WHERE is_active=1 ORDER BY popularity_score DESC LIMIT ? OFFSET ?').all(size, offset)
  return c.json({ skills: skills.map(withTags), total, page, page_size: size })
})

router.get('/:id', (c) => {
  const skill = db.prepare('SELECT * FROM skills WHERE id=?').get(Number(c.req.param('id')))
  if (!skill) return c.json({ error: 'Skill introuvable' }, 404)
  return c.json(withTags(skill))
})

router.post('/', async (c) => {
  const b = await c.req.json()
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO skills (name, description, category, source_url, pricing, features, popularity_score, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))
  `).run(b.name, b.description||'', b.category||'', b.source_url||'', b.pricing||'free', JSON.stringify(b.features||[]), b.popularity_score||0)
  return c.json(withTags(db.prepare('SELECT * FROM skills WHERE id=?').get(lastInsertRowid)), 201)
})

router.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!db.prepare('SELECT id FROM skills WHERE id=?').get(id)) return c.json({ error: 'Not found' }, 404)
  const b = await c.req.json()
  db.prepare(`UPDATE skills SET name=?, description=?, category=?, source_url=?, pricing=?, updated_at=datetime('now') WHERE id=?`)
    .run(b.name, b.description, b.category, b.source_url, b.pricing, id)
  return c.json(withTags(db.prepare('SELECT * FROM skills WHERE id=?').get(id)))
})

router.delete('/:id', (c) => {
  db.prepare('DELETE FROM skills WHERE id=?').run(Number(c.req.param('id')))
  return c.body(null, 204)
})

router.patch('/:id/active', async (c) => {
  const id = Number(c.req.param('id'))
  if (!db.prepare('SELECT id FROM skills WHERE id=?').get(id))
    return c.json({ error: 'Not found' }, 404)
  const { is_active } = await c.req.json()
  db.prepare("UPDATE skills SET is_active=?, updated_at=datetime('now') WHERE id=?")
    .run(is_active ? 1 : 0, id)
  return c.json({ id, is_active: is_active ? 1 : 0 })
})

router.post('/:id/favorite', (c) => {
  const id = Number(c.req.param('id'))
  const existing = db.prepare('SELECT 1 FROM favorites WHERE skill_id=?').get(id)
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE skill_id=?').run(id)
    return c.json({ favorited: false })
  }
  db.prepare('INSERT OR IGNORE INTO favorites (skill_id) VALUES (?)').run(id)
  return c.json({ favorited: true })
})

router.post('/:id/notes', async (c) => {
  const id = Number(c.req.param('id'))
  const { content } = await c.req.json()
  if (!content?.trim()) return c.json({ error: 'content requis' }, 422)
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO user_notes (skill_id, content, created_at) VALUES (?,?,datetime('now'))"
  ).run(id, content.trim())
  return c.json(db.prepare('SELECT * FROM user_notes WHERE id=?').get(lastInsertRowid), 201)
})

router.delete('/:id/notes/:noteId', (c) => {
  db.prepare('DELETE FROM user_notes WHERE id=? AND skill_id=?')
    .run(Number(c.req.param('noteId')), Number(c.req.param('id')))
  return c.body(null, 204)
})

router.get('/:id/combinations', (c) => {
  const rows = db.prepare(`
    SELECT sc.*, s1.name as skill1_name, s2.name as skill2_name
    FROM skill_combinations sc
    JOIN skills s1 ON s1.id=sc.skill_id_1
    JOIN skills s2 ON s2.id=sc.skill_id_2
    WHERE sc.skill_id_1=? OR sc.skill_id_2=?
  `).all(Number(c.req.param('id')), Number(c.req.param('id')))
  return c.json(rows)
})

export default router
