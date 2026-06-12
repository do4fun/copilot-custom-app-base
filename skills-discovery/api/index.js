// Handler Vercel serverless — exporte l'app Hono
import { handle } from '@hono/node-server/vercel'
import { app } from './src/app.js'
import { initDb } from './src/db.js'
import { initVectorDb } from './src/vector-db.js'

initDb()
initVectorDb()

export default handle(app)
