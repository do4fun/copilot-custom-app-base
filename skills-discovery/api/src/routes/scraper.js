import { Hono } from 'hono'
import { db, upsertSkill, appendLog, getInventory } from '../db.js'
import { crawlGithubAwesome, crawlGithubSearch } from '../crawlers/github.js'
import { crawlNpm } from '../crawlers/npm.js'
import { crawlGeneric } from '../crawlers/generic.js'

const router = new Hono()

// In-memory session control
const _stopFlags = new Map()
const _pauseFlags = new Map()

function sessionToObj(row) {
  return {
    ...row,
    logs:      JSON.parse(row.logs || '[]'),
    is_active: undefined,
  }
}

// ─── Configs ─────────────────────────────────────────────────────────────────

router.get('/configs', (c) => {
  const rows = db.prepare('SELECT * FROM scraper_configs ORDER BY created_at ASC').all()
  return c.json(rows)
})

router.post('/configs', async (c) => {
  const body = await c.req.json()
  const { name, url, type = 'generic', category = 'AI Coding Tool' } = body
  if (!name?.trim() || !url?.trim()) return c.json({ error: 'name et url requis' }, 422)
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO scraper_configs (name, url, type, category) VALUES (?,?,?,?)'
  ).run(name.trim(), url.trim(), type, category)
  const row = db.prepare('SELECT * FROM scraper_configs WHERE id=?').get(lastInsertRowid)
  return c.json(row, 201)
})

router.put('/configs/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!db.prepare('SELECT id FROM scraper_configs WHERE id=?').get(id))
    return c.json({ error: 'Config introuvable' }, 404)
  const body = await c.req.json()
  db.prepare(`UPDATE scraper_configs SET name=?, url=?, type=?, category=?, is_active=?, updated_at=datetime('now') WHERE id=?`)
    .run(body.name, body.url, body.type || 'generic', body.category || 'AI Coding Tool', body.is_active ? 1 : 0, id)
  return c.json(db.prepare('SELECT * FROM scraper_configs WHERE id=?').get(id))
})

router.delete('/configs/:id', (c) => {
  db.prepare('DELETE FROM scraper_configs WHERE id=?').run(Number(c.req.param('id')))
  return c.body(null, 204)
})

// ─── Sessions ─────────────────────────────────────────────────────────────────

router.get('/sessions', (c) => {
  const rows = db.prepare('SELECT * FROM scraper_sessions ORDER BY created_at DESC LIMIT 100').all()
  return c.json(rows.map(sessionToObj))
})

router.get('/sessions/:id', (c) => {
  const row = db.prepare('SELECT * FROM scraper_sessions WHERE id=?').get(Number(c.req.param('id')))
  if (!row) return c.json({ error: 'Session introuvable' }, 404)
  return c.json(sessionToObj(row))
})

router.post('/sessions', async (c) => {
  const { config_id } = await c.req.json()
  const cfg = db.prepare('SELECT * FROM scraper_configs WHERE id=?').get(Number(config_id))
  if (!cfg) return c.json({ error: `Config inconnue: ${config_id}` }, 400)

  const { lastInsertRowid: sid } = db.prepare(
    "INSERT INTO scraper_sessions (name, source, status, total) VALUES (?,?,'pending',0)"
  ).run(cfg.name, cfg.type)

  _stopFlags.set(sid, false)
  _pauseFlags.set(sid, false)

  // Launch Crawlee in background (non-blocking)
  runSession(sid, cfg).catch(() => {})

  return c.json(sessionToObj(db.prepare('SELECT * FROM scraper_sessions WHERE id=?').get(sid)), 201)
})

router.post('/sessions/:id/pause', (c) => {
  const id = Number(c.req.param('id'))
  const row = db.prepare('SELECT status FROM scraper_sessions WHERE id=?').get(id)
  if (!row) return c.json({ error: 'Session introuvable' }, 404)
  if (row.status !== 'running') return c.json({ error: "Session n'est pas en cours" }, 400)
  _pauseFlags.set(id, true)
  db.prepare("UPDATE scraper_sessions SET status='paused', paused_at=datetime('now') WHERE id=?").run(id)
  return c.json({ status: 'paused' })
})

router.post('/sessions/:id/resume', (c) => {
  const id = Number(c.req.param('id'))
  const row = db.prepare('SELECT status FROM scraper_sessions WHERE id=?').get(id)
  if (!row) return c.json({ error: 'Session introuvable' }, 404)
  if (row.status !== 'paused') return c.json({ error: "Session n'est pas en pause" }, 400)
  _pauseFlags.set(id, false)
  db.prepare("UPDATE scraper_sessions SET status='running', paused_at=NULL WHERE id=?").run(id)
  return c.json({ status: 'running' })
})

router.post('/sessions/:id/stop', (c) => {
  const id = Number(c.req.param('id'))
  const row = db.prepare('SELECT status FROM scraper_sessions WHERE id=?').get(id)
  if (!row) return c.json({ error: 'Session introuvable' }, 404)
  if (!['running', 'paused'].includes(row.status)) return c.json({ error: "Session n'est pas active" }, 400)
  _stopFlags.set(id, true)
  _pauseFlags.set(id, false)
  return c.json({ status: 'stopping' })
})

router.delete('/sessions/:id', (c) => {
  db.prepare('DELETE FROM scraper_sessions WHERE id=?').run(Number(c.req.param('id')))
  return c.body(null, 204)
})

router.post('/sessions/clear-all', (c) => {
  db.prepare("DELETE FROM scraper_sessions WHERE status IN ('completed','failed','stopped')").run()
  return c.body(null, 204)
})

// ─── Session runner ───────────────────────────────────────────────────────────

async function waitIfPaused(sid) {
  while (_pauseFlags.get(sid)) {
    await new Promise(r => setTimeout(r, 500))
  }
}

async function runSession(sid, cfg) {
  db.prepare("UPDATE scraper_sessions SET status='running', started_at=datetime('now') WHERE id=?").run(sid)
  appendLog(sid, `Démarrage — type=${cfg.type} url=${cfg.url}`)

  // ── Inventory ────────────────────────────────────────────────────────────────
  const { urls: knownUrls, names: knownNames } = getInventory()
  appendLog(sid, `Inventaire BD: ${knownNames.size} skills déjà enregistrés (${knownUrls.size} URLs connues)`)

  const checkStop = () => !!_stopFlags.get(sid)
  let found    = 0
  let progress = 0
  let failed   = 0
  let total    = 0

  const onSkill = async (item) => {
    await waitIfPaused(sid)

    const normName = (item.name || '').trim().toLowerCase()
    const normUrl  = (item.source_url || '').trim()

    // Fast in-memory check before hitting the DB
    if (knownNames.has(normName) || (normUrl && knownUrls.has(normUrl))) {
      appendLog(sid, `~ ${item.name} (déjà en BD)`)
      progress++
      db.prepare('UPDATE scraper_sessions SET progress=? WHERE id=?').run(progress, sid)
      return
    }

    const added = upsertSkill(item)
    if (added) {
      found++
      knownNames.add(normName)
      if (normUrl) knownUrls.add(normUrl)
    }
    progress++
    appendLog(sid, added ? `+ ${item.name}` : `~ ${item.name} (existant)`)
    db.prepare('UPDATE scraper_sessions SET progress=?, found=? WHERE id=?').run(progress, found, sid)
  }

  const onLog = (msg) => appendLog(sid, msg)

  const onTotal = (n) => {
    total = n
    db.prepare('UPDATE scraper_sessions SET total=? WHERE id=?').run(n, sid)
  }

  const onFail = (msg) => {
    failed++
    appendLog(sid, `✗ ${msg}`)
    db.prepare('UPDATE scraper_sessions SET failed=? WHERE id=?').run(failed, sid)
  }

  try {
    const ctx = { onSkill, onLog, onTotal, onFail, checkStop, knownUrls, knownNames }
    switch (cfg.type) {
      case 'github-awesome': await crawlGithubAwesome(cfg, ctx); break
      case 'github-search':  await crawlGithubSearch(cfg, ctx);  break
      case 'npm':            await crawlNpm(cfg, ctx);            break
      case 'generic':        await crawlGeneric(cfg, ctx);        break
      default: onLog(`Type inconnu: ${cfg.type}`)
    }

    if (_stopFlags.get(sid)) {
      db.prepare("UPDATE scraper_sessions SET status='stopped', finished_at=datetime('now'), found=?, progress=?, failed=? WHERE id=?").run(found, progress, failed, sid)
      appendLog(sid, 'Arrêt demandé')
    } else {
      db.prepare("UPDATE scraper_sessions SET status='completed', finished_at=datetime('now'), found=?, progress=?, failed=? WHERE id=?").run(found, progress, failed, sid)
      appendLog(sid, [
        `Terminé`,
        `${progress - found} déjà en BD`,
        `${found} nouveaux`,
        `${failed} échec(s)`,
        `${total} identifiés pour cette source`,
      ].join(' · '))
    }
  } catch (e) {
    db.prepare("UPDATE scraper_sessions SET status='failed', finished_at=datetime('now'), found=?, progress=?, failed=? WHERE id=?").run(found, progress, failed, sid)
    appendLog(sid, `Erreur fatale: ${e.message}`)
  } finally {
    _stopFlags.delete(sid)
    _pauseFlags.delete(sid)
  }
}

export default router
