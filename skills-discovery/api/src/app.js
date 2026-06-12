import { Hono } from 'hono'
import { cors } from 'hono/cors'
import skillsRouter from './routes/skills.js'
import searchRouter from './routes/search.js'
import collectionsRouter from './routes/collections.js'
import goalsRouter from './routes/goals.js'
import comparatorRouter from './routes/comparator.js'
import scraperRouter from './routes/scraper.js'
import adminRouter from './routes/admin.js'
import semanticRouter from './routes/semantic-search.js'

export const app = new Hono()

app.use('/*', cors())

app.route('/api/skills', skillsRouter)
app.route('/api/search', searchRouter)
app.route('/api/collections', collectionsRouter)
app.route('/api/goals', goalsRouter)
app.route('/api/comparator', comparatorRouter)
app.route('/api/scraper', scraperRouter)
app.route('/api/admin', adminRouter)
app.route('/api/semantic-search', semanticRouter)

app.get('/api/health', (c) => c.json({ status: 'ok', version: '2.0.0', runtime: 'node.js/hono' }))
