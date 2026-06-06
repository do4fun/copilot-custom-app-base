import { Hono } from 'hono'
import { cors } from 'hono/cors'
import skillsRouter      from './routes/skills.js'
import searchRouter      from './routes/search.js'
import collectionsRouter from './routes/collections.js'
import goalsRouter       from './routes/goals.js'
import comparatorRouter  from './routes/comparator.js'
import scraperRouter     from './routes/scraper.js'

const app = new Hono()

app.use('*', cors({ origin: '*' }))

app.route('/api/skills',      skillsRouter)
app.route('/api/search',      searchRouter)
app.route('/api/collections', collectionsRouter)
app.route('/api/goals',       goalsRouter)
app.route('/api/comparator',  comparatorRouter)
app.route('/api/scraper',     scraperRouter)

app.get('/api/health', (c) => c.json({ status: 'ok', version: '2.0.0', runtime: 'node.js/hono' }))

export default app
