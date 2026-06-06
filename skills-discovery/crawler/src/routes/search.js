import { Hono } from 'hono'
import { db } from '../db.js'

const router = new Hono()

function withTags(skill) {
  const tags = db.prepare('SELECT t.id, t.name FROM tags t JOIN skill_tags st ON st.tag_id=t.id WHERE st.skill_id=?').all(skill.id)
  return { ...skill, tags, is_favorite: !!db.prepare('SELECT 1 FROM favorites WHERE skill_id=?').get(skill.id) }
}

router.get('/search', (c) => {
  const q        = (c.req.query('q') || '').trim()
  const category = c.req.query('category') || ''
  const pricing  = c.req.query('pricing') || ''
  const tagStr   = c.req.query('tags') || ''
  const page     = Number(c.req.query('page') || 1)
  const size     = Math.min(Number(c.req.query('page_size') || 20), 100)

  let skills
  if (q) {
    const term = q.replace(/[^a-zA-Z0-9À-ɏ\s]/g, '') + '*'
    skills = db.prepare(`
      SELECT s.* FROM skills s
      JOIN skills_fts fts ON fts.rowid=s.id
      WHERE fts MATCH ? AND s.is_active=1
      ORDER BY bm25(skills_fts) LIMIT 200
    `).all(term)
  } else {
    skills = db.prepare('SELECT * FROM skills WHERE is_active=1 ORDER BY popularity_score DESC LIMIT 200').all()
  }

  if (category) skills = skills.filter(s => s.category === category)
  if (pricing)  skills = skills.filter(s => s.pricing === pricing)
  if (tagStr) {
    const tags = tagStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    skills = skills.filter(s => {
      const stags = db.prepare('SELECT t.name FROM tags t JOIN skill_tags st ON st.tag_id=t.id WHERE st.skill_id=?').all(s.id).map(r => r.name)
      return tags.some(t => stags.includes(t))
    })
  }

  const total = skills.length
  const slice = skills.slice((page - 1) * size, page * size)
  return c.json({ skills: slice.map(withTags), total, page, page_size: size })
})

router.get('/categories', (c) => {
  const rows = db.prepare("SELECT DISTINCT category FROM skills WHERE is_active=1 AND category!='' ORDER BY category").all()
  return c.json(rows.map(r => r.category))
})

router.get('/tags', (c) => {
  const rows = db.prepare(`
    SELECT t.name, COUNT(st.skill_id) as count FROM tags t
    JOIN skill_tags st ON st.tag_id=t.id
    GROUP BY t.id ORDER BY count DESC LIMIT 100
  `).all()
  return c.json(rows)
})

export default router
