import { Hono } from 'hono'
import { db } from '../db.js'

const router = new Hono()

router.post('/', async (c) => {
  const { skill_ids } = await c.req.json()
  if (!Array.isArray(skill_ids) || skill_ids.length < 2) return c.json({ error: '2 skills minimum requis' }, 422)

  const skills = skill_ids.map(id => {
    const s = db.prepare('SELECT * FROM skills WHERE id=?').get(Number(id))
    if (!s) return null
    const tags = db.prepare('SELECT t.name FROM tags t JOIN skill_tags st ON st.tag_id=t.id WHERE st.skill_id=?').all(s.id).map(r => r.name)
    return { ...s, tags, features: JSON.parse(s.features || '[]') }
  }).filter(Boolean)

  if (skills.length < 2) return c.json({ error: 'Skills introuvables' }, 404)

  // Build feature matrix
  const allFeatures = [...new Set(skills.flatMap(s => s.features))]
  const allTags = [...new Set(skills.flatMap(s => s.tags))]

  const feature_matrix = allFeatures.map(f => ({
    feature: f,
    values: skills.map(s => s.features.includes(f)),
  }))
  const tag_matrix = allTags.map(t => ({
    tag: t,
    values: skills.map(s => s.tags.includes(t)),
  }))

  return c.json({ skills, feature_matrix, tag_matrix })
})

export default router
