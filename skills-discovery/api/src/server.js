import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import app from './app.js'
import { initDb, seedData } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

initDb()
seedData()

// Serve frontend static files if built
const frontendDist = join(__dirname, '..', '..', 'frontend', 'dist')
if (existsSync(frontendDist)) {
  app.use('/*', serveStatic({ root: frontendDist }))
}

const PORT = Number(process.env.PORT || 8000)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`SkillsHub API (Node.js/Hono) → http://localhost:${PORT}`)
  console.log(`Swagger not available in Hono mode — use http://localhost:${PORT}/api/health`)
})
