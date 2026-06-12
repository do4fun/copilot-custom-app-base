import { Hono } from 'hono'
import { db, upsertSkill, appendLog, getInventory } from '../db.js'
import { upsertSkillVector } from '../vector-db.js'
import { crawlGithubAwesome, crawlGithubSearch } from '../crawlers/github.js'
import {
  crawlGithubSkillRepo,
  crawlGithubSkillFiles,
  crawlGithubAgentRepo,
  crawlGithubAgentFiles,
} from '../crawlers/github-skills.js'
import { crawlNpm } from '../crawlers/npm.js'
import { crawlGeneric } from '../crawlers/generic.js'
import { crawlWebSegment } from '../crawlers/web-segment.js'

const router = new Hono()

const _pauseFlags = new Map()
const _stopFlags = new Map()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ─── Configs CRUD ─── */

router.get('/configs', (c) => {
  return c.json(db.prepare('SELECT * FROM scraper_configs ORDER BY created_at DESC').all())
})

router.post('/configs', async (c) => {
  const body = await c.req.json()
  if (!body.name || !body.url) return c.json({ error: 'name et url requis' }, 400)
  const info = db
    .prepare('INSERT INTO scraper_configs (name, url, type, category) VALUES (?, ?, ?, ?)')
    .run(body.name, body.url, body.type || 'generic', body.category || 'AI Coding Tool')
  return c.json(db.prepare('SELECT * FROM scraper_configs WHERE id = ?').get(info.lastInsertRowid), 201)
})

router.put('/configs/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const cfg = db.prepare('SELECT * FROM scraper_configs WHERE id = ?').get(id)
  if (!cfg) return c.json({ error: 'Config introuvable' }, 404)
  const body = await c.req.json()
  db.prepare(
    "UPDATE scraper_configs SET name = ?, url = ?, type = ?, category = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(
    body.name ?? cfg.name,
    body.url ?? cfg.url,
    body.type ?? cfg.type,
    body.category ?? cfg.category,
    body.is_active ?? cfg.is_active,
    id
  )
  return c.json(db.prepare('SELECT * FROM scraper_configs WHERE id = ?').get(id))
})

router.delete('/configs/:id', (c) => {
  const info = db.prepare('DELETE FROM scraper_configs WHERE id = ?').run(Number(c.req.param('id')))
  if (!info.changes) return c.json({ error: 'Config introuvable' }, 404)
  return c.body(null, 204)
})

/* ─── Sessions lifecycle ─── */

router.get('/sessions', (c) => {
  const sessions = db
    .prepare('SELECT id, name, source, status, progress, total, found, failed, started_at, finished_at, created_at FROM scraper_sessions ORDER BY id DESC LIMIT 100')
    .all()
  return c.json(sessions)
})

router.get('/sessions/:id', (c) => {
  const session = db.prepare('SELECT * FROM scraper_sessions WHERE id = ?').get(Number(c.req.param('id')))
  if (!session) return c.json({ error: 'Session introuvable' }, 404)
  try {
    session.logs = JSON.parse(session.logs || '[]')
  } catch {
    session.logs = []
  }
  return c.json(session)
})

router.post('/sessions', async (c) => {
  const { config_id: configId } = await c.req.json()
  const cfg = db.prepare('SELECT * FROM scraper_configs WHERE id = ?').get(Number(configId))
  if (!cfg) return c.json({ error: 'Config introuvable' }, 404)

  const info = db
    .prepare(
      "INSERT INTO scraper_sessions (name, source, status, started_at) VALUES (?, ?, 'running', datetime('now'))"
    )
    .run(cfg.name, cfg.url)
  const sid = Number(info.lastInsertRowid)

  _pauseFlags.set(sid, false)
  _stopFlags.set(sid, false)

  // lancement en arrière-plan — la réponse part immédiatement
  runSession(sid, cfg).catch((err) => {
    appendLog(sid, `Erreur fatale : ${err.message}`, 'ERROR')
    db.prepare("UPDATE scraper_sessions SET status = 'failed', finished_at = datetime('now') WHERE id = ?").run(sid)
  })

  return c.json(db.prepare('SELECT * FROM scraper_sessions WHERE id = ?').get(sid), 201)
})

router.post('/sessions/:id/pause', (c) => {
  const id = Number(c.req.param('id'))
  const session = db.prepare('SELECT * FROM scraper_sessions WHERE id = ?').get(id)
  if (!session) return c.json({ error: 'Session introuvable' }, 404)
  _pauseFlags.set(id, true)
  db.prepare("UPDATE scraper_sessions SET status = 'paused', paused_at = datetime('now') WHERE id = ?").run(id)
  appendLog(id, 'Session mise en pause', 'INFO')
  return c.json({ id, status: 'paused' })
})

router.post('/sessions/:id/resume', (c) => {
  const id = Number(c.req.param('id'))
  const session = db.prepare('SELECT * FROM scraper_sessions WHERE id = ?').get(id)
  if (!session) return c.json({ error: 'Session introuvable' }, 404)
  _pauseFlags.set(id, false)
  db.prepare("UPDATE scraper_sessions SET status = 'running', paused_at = NULL WHERE id = ?").run(id)
  appendLog(id, 'Session reprise', 'INFO')
  return c.json({ id, status: 'running' })
})

router.post('/sessions/:id/stop', (c) => {
  const id = Number(c.req.param('id'))
  const session = db.prepare('SELECT * FROM scraper_sessions WHERE id = ?').get(id)
  if (!session) return c.json({ error: 'Session introuvable' }, 404)
  _stopFlags.set(id, true)
  _pauseFlags.set(id, false)
  appendLog(id, 'Arrêt demandé', 'WARN')
  return c.json({ id, status: 'stopping' })
})

router.delete('/sessions/:id', (c) => {
  const id = Number(c.req.param('id'))
  _stopFlags.set(id, true)
  const info = db.prepare('DELETE FROM scraper_sessions WHERE id = ?').run(id)
  if (!info.changes) return c.json({ error: 'Session introuvable' }, 404)
  return c.body(null, 204)
})

router.post('/sessions/clear-all', (c) => {
  const info = db
    .prepare("DELETE FROM scraper_sessions WHERE status IN ('completed', 'failed', 'stopped')")
    .run()
  return c.json({ deleted: info.changes })
})

/* ─── Runner ─── */

async function runSession(sid, cfg) {
  appendLog(sid, `Démarrage du crawl « ${cfg.name} » (type: ${cfg.type})`, 'INFO')

  const inventory = getInventory()
  let progress = 0
  let found = 0
  let failed = 0

  const updateCounters = () =>
    db.prepare('UPDATE scraper_sessions SET progress = ?, found = ?, failed = ? WHERE id = ?').run(progress, found, failed, sid)

  const ctx = {
    category: cfg.category,

    onSkill: async (item) => {
      progress++
      const nameKey = (item.name || '').toLowerCase()
      const urlKey = (item.source_url || '').toLowerCase()
      if ((nameKey && inventory.names.has(nameKey)) || (urlKey && inventory.urls.has(urlKey))) {
        appendLog(sid, `Doublon ignoré : ${item.name}`, 'DEBUG')
        updateCounters()
        return
      }
      const added = upsertSkill({
        category: cfg.category,
        source_name: cfg.name,
        ...item,
      })
      if (added) {
        found++
        if (nameKey) inventory.names.add(nameKey)
        if (urlKey) inventory.urls.add(urlKey)
        appendLog(sid, `✓ ${added.name}`, 'INFO')
        // vectorisation fire-and-forget
        Promise.resolve()
          .then(() => upsertSkillVector(added, item, item.tags || []))
          .catch(() => {})
      } else {
        appendLog(sid, `Doublon en base : ${item.name}`, 'DEBUG')
      }
      updateCounters()
    },

    onLog: (msg, level = 'INFO') => appendLog(sid, msg, level),

    onTotal: (n) => db.prepare('UPDATE scraper_sessions SET total = ? WHERE id = ?').run(n, sid),

    onFail: (msg) => {
      failed++
      progress++
      appendLog(sid, `✗ ${msg}`, 'WARN')
      updateCounters()
    },

    onSkip: () => {
      progress++
      updateCounters()
    },

    checkStop: () => !!_stopFlags.get(sid),

    waitWhilePaused: async () => {
      while (_pauseFlags.get(sid) && !_stopFlags.get(sid)) await sleep(500)
    },
  }

  try {
    switch (cfg.type) {
      case 'github-awesome':     await crawlGithubAwesome(cfg, ctx); break
      case 'github-search':      await crawlGithubSearch(cfg, ctx); break
      case 'github-skill-files': await crawlGithubSkillFiles(cfg, ctx); break
      case 'github-skill-repo':  await crawlGithubSkillRepo(cfg, ctx); break
      case 'github-agent-files': await crawlGithubAgentFiles(cfg, ctx); break
      case 'github-agent-repo':  await crawlGithubAgentRepo(cfg, ctx); break
      case 'npm':                await crawlNpm(cfg, ctx); break
      case 'generic':            await crawlGeneric(cfg, ctx); break
      case 'web-segment':        await crawlWebSegment(cfg, ctx); break
      default:
        throw new Error(`Type de crawler inconnu : ${cfg.type}`)
    }

    const finalStatus = _stopFlags.get(sid) ? 'stopped' : 'completed'
    appendLog(sid, `Crawl terminé — ${found} skill(s) ajouté(s), ${failed} échec(s)`, 'INFO')
    db.prepare("UPDATE scraper_sessions SET status = ?, finished_at = datetime('now') WHERE id = ?").run(finalStatus, sid)
  } catch (err) {
    appendLog(sid, `Erreur : ${err.message}`, 'ERROR')
    db.prepare("UPDATE scraper_sessions SET status = 'failed', finished_at = datetime('now') WHERE id = ?").run(sid)
  } finally {
    _pauseFlags.delete(sid)
    _stopFlags.delete(sid)
  }
}

export default router
