import { handle } from 'hono/vercel'
import app from '../src/app.js'
import { initDb, seedData } from '../src/db.js'

// Initialize DB on cold start (Vercel uses /tmp/skills.db)
initDb()
seedData()

export const config = { runtime: 'nodejs' }
export default handle(app)
