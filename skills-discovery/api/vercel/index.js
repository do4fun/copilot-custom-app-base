import { handle } from 'hono/vercel'
import app from '../src/app.js'
import { initDb, seedData } from '../src/db.js'
import { initVectorDb } from '../src/vector-db.js'

// Cold-start initialization — Vercel uses /tmp/skills.db and /tmp/skills_vectors.db
initDb()
seedData()
initVectorDb()

export const config = { runtime: 'nodejs' }
export default handle(app)
