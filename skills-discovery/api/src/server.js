import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { app } from './app.js'
import { initDb } from './db.js'
import { initVectorDb, syncMissingVectors } from './vector-db.js'

initDb()
initVectorDb()

// Vectorise en arrière-plan les skills sans embedding
syncMissingVectors().catch(() => {})

// Sert le frontend buildé si présent (npm run build dans frontend/)
app.use('/*', serveStatic({ root: '../frontend/dist' }))
app.get('*', serveStatic({ path: '../frontend/dist/index.html' }))

const port = Number(process.env.PORT) || 8000

serve({ fetch: app.fetch, port }, () => {
  console.log(`SkillsHub API → http://localhost:${port} (health: /api/health)`)
})
