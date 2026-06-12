import { Hono } from 'hono'
import { db } from '../db.js'

const router = new Hono()

function parseFeatures(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

router.post('/', async (c) => {
  const { skill_ids: skillIds } = await c.req.json()
  if (!Array.isArray(skillIds) || skillIds.length < 2 || skillIds.length > 3) {
    return c.json({ error: 'skill_ids doit contenir 2 ou 3 ids' }, 400)
  }

  const getTags = db.prepare(
    'SELECT t.name FROM tags t JOIN skill_tags st ON st.tag_id = t.id WHERE st.skill_id = ?'
  )

  const skills = []
  for (const id of skillIds) {
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(Number(id))
    if (!skill) return c.json({ error: `Skill ${id} introuvable` }, 404)
    skill.tags = getTags.all(skill.id).map((r) => r.name)
    skill.features_list = parseFeatures(skill.features)
    skills.push(skill)
  }

  // feature_matrix : union des features → présence par skill
  const featureMatrix = {}
  for (const skill of skills) {
    for (const f of skill.features_list) {
      if (!featureMatrix[f]) featureMatrix[f] = {}
    }
  }
  for (const f of Object.keys(featureMatrix)) {
    for (const skill of skills) featureMatrix[f][skill.id] = skill.features_list.includes(f)
  }

  // tag_matrix : union des tags → présence par skill
  const tagMatrix = {}
  for (const skill of skills) {
    for (const t of skill.tags) {
      if (!tagMatrix[t]) tagMatrix[t] = {}
    }
  }
  for (const t of Object.keys(tagMatrix)) {
    for (const skill of skills) tagMatrix[t][skill.id] = skill.tags.includes(t)
  }

  return c.json({
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      pricing: s.pricing,
      popularity_score: s.popularity_score,
      source_url: s.source_url,
      tags: s.tags,
      features: s.features_list,
    })),
    feature_matrix: featureMatrix,
    tag_matrix: tagMatrix,
  })
})

export default router
