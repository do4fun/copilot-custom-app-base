import { Hono } from 'hono'
import { db } from '../db.js'
import { semanticSearch, syncMissingVectors } from '../vector-db.js'

const router = new Hono()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function withTags(skill) {
  const tags = db.prepare(
    'SELECT t.name FROM tags t JOIN skill_tags st ON st.tag_id=t.id WHERE st.skill_id=?'
  ).all(skill.id).map(r => r.name)
  return { ...skill, tags }
}

// Relative thresholds — expressed as a fraction of the top score in the result set.
// This makes classification meaningful regardless of absolute score magnitudes.
// > 70% of max → already does this directly
// 30–70% of max → key building block
// < 30% of max → supplementary enhancement
function assignMatchTypes(results) {
  if (!results.length) return results
  const maxScore = results[0].score   // results are sorted desc
  if (maxScore === 0) return results.map(r => ({ ...r, match_type: 'enhancement' }))
  return results.map(r => {
    const ratio = r.score / maxScore
    const match_type = ratio >= 0.70 ? 'direct' : ratio >= 0.30 ? 'building_block' : 'enhancement'
    return { ...r, match_type }
  })
}

async function runSearch(objective, topK) {
  const hits = semanticSearch(objective, topK)
  if (!hits.length) return []

  const raw = hits
    .map(h => {
      const skill = db.prepare('SELECT * FROM skills WHERE id=? AND is_active=1').get(h.skill_id)
      if (!skill) return null
      return {
        skill:       withTags(skill),
        score:       Math.round(h.score * 1000) / 1000,
        tfidf_score: Math.round(h.tfidf_score * 1000) / 1000,
        cap_score:   Math.round(h.cap_score * 1000) / 1000,
        match_type:  'enhancement',   // placeholder, overwritten below
      }
    })
    .filter(Boolean)

  return assignMatchTypes(raw)
}

function groupResults(results) {
  return {
    direct_matches:  results.filter(r => r.match_type === 'direct'),
    building_blocks: results.filter(r => r.match_type === 'building_block'),
    enhancements:    results.filter(r => r.match_type === 'enhancement'),
  }
}

// ─── POST /api/semantic-search/objective ─────────────────────────────────────

router.post('/objective', async (c) => {
  const body      = await c.req.json().catch(() => ({}))
  const objective = (body.objective || '').trim()
  const topK      = Math.min(Number(body.top_k ?? 10), 30)

  if (!objective) return c.json({ error: 'objective requis' }, 422)

  try {
    const results = await runSearch(objective, topK)
    return c.json({ objective, results, ...groupResults(results), method: 'vector-local' })
  } catch (e) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── GET /api/semantic-search/objective?q=...&top_k=10 ───────────────────────

router.get('/objective', async (c) => {
  const objective = (c.req.query('q') || '').trim()
  const topK      = Math.min(Number(c.req.query('top_k') ?? 10), 30)

  if (!objective) return c.json({ error: 'q requis' }, 422)

  try {
    const results = await runSearch(objective, topK)
    return c.json({ objective, results, ...groupResults(results), method: 'vector-local' })
  } catch (e) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── POST /api/semantic-search/sync ──────────────────────────────────────────
// Embed skills that have no vector yet (call once after seed / import)

router.post('/sync', async (c) => {
  try {
    const count = await syncMissingVectors(db)
    return c.json({ synced: count, message: `${count} skill(s) vectorisé(s)` })
  } catch (e) {
    return c.json({ error: e.message }, 500)
  }
})

export default router
