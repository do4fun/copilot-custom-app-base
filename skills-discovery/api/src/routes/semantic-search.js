import { Hono } from 'hono'
import { semanticSearch, syncMissingVectors } from '../vector-db.js'

const router = new Hono()

router.post('/objective', async (c) => {
  const { objective, top_k: topK } = await c.req.json()
  if (!objective?.trim()) return c.json({ error: 'objective requis' }, 400)
  const results = semanticSearch(objective.trim(), Math.min(100, Number(topK) || 10))
  return c.json({ objective, results })
})

router.get('/objective', (c) => {
  const q = (c.req.query('q') || '').trim()
  if (!q) return c.json({ error: 'paramètre q requis' }, 400)
  const topK = Math.min(100, Number(c.req.query('top_k')) || 10)
  return c.json({ objective: q, results: semanticSearch(q, topK) })
})

router.post('/sync', async (c) => {
  const result = await syncMissingVectors()
  return c.json(result)
})

export default router
