import { Hono } from 'hono'
import { db } from '../db.js'

const router = new Hono()

function getSkillTags(skillId) {
  return db
    .prepare(
      'SELECT t.name FROM tags t JOIN skill_tags st ON st.tag_id = t.id WHERE st.skill_id = ? ORDER BY t.name'
    )
    .all(skillId)
    .map((r) => r.name)
}

// Liste paginée
router.get('/', (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('page_size')) || 20))
  const total = db.prepare('SELECT COUNT(*) AS n FROM skills').get().n
  const results = db
    .prepare('SELECT * FROM skills ORDER BY popularity_score DESC, name LIMIT ? OFFSET ?')
    .all(pageSize, (page - 1) * pageSize)
  for (const s of results) s.tags = getSkillTags(s.id)
  return c.json({ results, total, page, page_size: pageSize })
})

// Détail avec tags, notes, is_favorite
router.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(id)
  if (!skill) return c.json({ error: 'Skill introuvable' }, 404)
  skill.tags = getSkillTags(id)
  skill.notes = db
    .prepare('SELECT * FROM user_notes WHERE skill_id = ? ORDER BY created_at DESC')
    .all(id)
  skill.is_favorite = db.prepare('SELECT 1 FROM favorites WHERE skill_id = ?').get(id) ? 1 : 0
  return c.json(skill)
})

// Créer
router.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.name) return c.json({ error: 'name requis' }, 400)
  const exists = db.prepare('SELECT id FROM skills WHERE lower(name) = lower(?)').get(body.name)
  if (exists) return c.json({ error: 'Un skill avec ce nom existe déjà' }, 409)

  const features = Array.isArray(body.features) ? JSON.stringify(body.features) : body.features || null
  const info = db
    .prepare(
      `INSERT INTO skills
       (name, description, category, source_url, source_name, pricing, features,
        install_instructions, version, popularity_score, readme)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.name,
      body.description || null,
      body.category || null,
      body.source_url || null,
      body.source_name || null,
      body.pricing || 'free',
      features,
      body.install_instructions || null,
      body.version || null,
      body.popularity_score || 0,
      body.readme || null
    )
  const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(info.lastInsertRowid)
  return c.json(skill, 201)
})

// Modifier
router.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(id)
  if (!skill) return c.json({ error: 'Skill introuvable' }, 404)
  const body = await c.req.json()
  const features = Array.isArray(body.features) ? JSON.stringify(body.features) : body.features

  db.prepare(
    `UPDATE skills SET
       name = ?, description = ?, category = ?, source_url = ?, source_name = ?,
       pricing = ?, features = ?, install_instructions = ?, version = ?,
       popularity_score = ?, readme = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    body.name ?? skill.name,
    body.description ?? skill.description,
    body.category ?? skill.category,
    body.source_url ?? skill.source_url,
    body.source_name ?? skill.source_name,
    body.pricing ?? skill.pricing,
    features ?? skill.features,
    body.install_instructions ?? skill.install_instructions,
    body.version ?? skill.version,
    body.popularity_score ?? skill.popularity_score,
    body.readme ?? skill.readme,
    id
  )
  return c.json(db.prepare('SELECT * FROM skills WHERE id = ?').get(id))
})

// Supprimer
router.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  const info = db.prepare('DELETE FROM skills WHERE id = ?').run(id)
  if (!info.changes) return c.json({ error: 'Skill introuvable' }, 404)
  return c.body(null, 204)
})

// Toggle visibilité globale
router.patch('/:id/active', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const isActive = body.is_active ? 1 : 0
  const info = db
    .prepare("UPDATE skills SET is_active = ?, updated_at = datetime('now') WHERE id = ?")
    .run(isActive, id)
  if (!info.changes) return c.json({ error: 'Skill introuvable' }, 404)
  return c.json({ id, is_active: isActive })
})

// Toggle favori
router.post('/:id/favorite', (c) => {
  const id = Number(c.req.param('id'))
  const skill = db.prepare('SELECT id FROM skills WHERE id = ?').get(id)
  if (!skill) return c.json({ error: 'Skill introuvable' }, 404)

  const fav = db.prepare('SELECT 1 FROM favorites WHERE skill_id = ?').get(id)
  if (fav) {
    db.prepare('DELETE FROM favorites WHERE skill_id = ?').run(id)
    db.prepare('UPDATE skills SET is_favorite = 0 WHERE id = ?').run(id)
    return c.json({ id, is_favorite: 0 })
  }
  db.prepare('INSERT INTO favorites (skill_id) VALUES (?)').run(id)
  db.prepare('UPDATE skills SET is_favorite = 1 WHERE id = ?').run(id)
  return c.json({ id, is_favorite: 1 })
})

// Notes
router.post('/:id/notes', async (c) => {
  const id = Number(c.req.param('id'))
  const skill = db.prepare('SELECT id FROM skills WHERE id = ?').get(id)
  if (!skill) return c.json({ error: 'Skill introuvable' }, 404)
  const { content } = await c.req.json()
  if (!content?.trim()) return c.json({ error: 'content requis' }, 400)
  const info = db.prepare('INSERT INTO user_notes (skill_id, content) VALUES (?, ?)').run(id, content.trim())
  return c.json(db.prepare('SELECT * FROM user_notes WHERE id = ?').get(info.lastInsertRowid), 201)
})

router.delete('/:id/notes/:noteId', (c) => {
  const info = db
    .prepare('DELETE FROM user_notes WHERE id = ? AND skill_id = ?')
    .run(Number(c.req.param('noteId')), Number(c.req.param('id')))
  if (!info.changes) return c.json({ error: 'Note introuvable' }, 404)
  return c.body(null, 204)
})

// Combinaisons compatibles
router.get('/:id/combinations', (c) => {
  const id = Number(c.req.param('id'))
  const combos = db
    .prepare(
      `SELECT sc.*, s1.name AS skill_1_name, s2.name AS skill_2_name
       FROM skill_combinations sc
       LEFT JOIN skills s1 ON s1.id = sc.skill_id_1
       LEFT JOIN skills s2 ON s2.id = sc.skill_id_2
       WHERE sc.skill_id_1 = ? OR sc.skill_id_2 = ?`
    )
    .all(id, id)
  return c.json(combos)
})

export default router
