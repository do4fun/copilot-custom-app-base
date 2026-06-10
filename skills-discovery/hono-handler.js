import { handle } from 'hono/vercel'
import app from './api/src/app.js'
import { initDb, seedData } from './api/src/db.js'
import { initVectorDb } from './api/src/vector-db.js'

initDb()
seedData()
initVectorDb()

export const config = { runtime: 'nodejs' }
export default handle(app)
