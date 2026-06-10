import { handle } from 'hono/vercel'
import app from './src/app.js'
import { initDb, seedData } from './src/db.js'
import { initVectorDb } from './src/vector-db.js'

initDb()
seedData()
initVectorDb()

export const config = { runtime: 'nodejs' }
export default handle(app)
