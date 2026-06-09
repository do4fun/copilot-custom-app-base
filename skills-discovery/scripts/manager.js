/**
 * SkillsHub process manager
 *
 * Usage:  node scripts/manager.js
 *
 * Manages two child processes:
 *   - API  : skills-discovery/api  (node src/server.js, IPC enabled)
 *   - Front: skills-discovery/frontend (npm run dev)
 *
 * The API can signal a restart via process.send({ action:'restart', target:'api'|'frontend'|'all' }).
 * Processes that exit with code 0 or the restart code (75) are auto-restarted after 1 s.
 * Processes that exit with code 1 (crash) are NOT auto-restarted (avoids crash loops).
 */

import { spawn } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const NPM       = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const RESTART_CODE = 75   // exit code meaning "please restart me"

let apiProc      = null
let frontProc    = null
let apiRestarting    = false
let frontRestarting  = false

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(tag, msg) {
  const ts = new Date().toTimeString().slice(0, 8)
  console.log(`[${ts}] [${tag}] ${msg}`)
}

// ─── API process ──────────────────────────────────────────────────────────────

function startApi() {
  if (apiRestarting) return
  log('manager', 'Démarrage API …')

  apiProc = spawn('node', ['src/server.js'], {
    cwd:   join(ROOT, 'api'),
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env:   { ...process.env },
  })

  apiProc.on('message', (msg) => {
    if (!msg?.action) return
    log('manager', `IPC reçu: action=${msg.action} target=${msg.target}`)
    handleRestart(msg.target || 'api')
  })

  apiProc.on('exit', (code, signal) => {
    log('manager', `API terminée — code=${code} signal=${signal}`)
    apiProc = null
    if (code === RESTART_CODE || code === 0) {
      log('manager', 'Redémarrage API dans 1 s …')
      setTimeout(startApi, 1000)
    } else if (signal === 'SIGTERM' && apiRestarting) {
      log('manager', 'Redémarrage API (demandé) dans 1 s …')
      setTimeout(() => { apiRestarting = false; startApi() }, 1000)
    } else {
      log('manager', `API arrêtée (code ${code}) — pas de redémarrage automatique`)
    }
  })

  apiProc.on('error', (e) => log('manager', `Erreur API: ${e.message}`))
}

// ─── Frontend process ─────────────────────────────────────────────────────────

function startFrontend() {
  if (frontRestarting) return
  log('manager', 'Démarrage Frontend …')

  frontProc = spawn(NPM, ['run', 'dev'], {
    cwd:   join(ROOT, 'frontend'),
    stdio: 'inherit',
    env:   { ...process.env },
    shell: process.platform === 'win32',
  })

  frontProc.on('exit', (code, signal) => {
    log('manager', `Frontend terminé — code=${code} signal=${signal}`)
    frontProc = null
    if (code === RESTART_CODE || code === 0 || (signal === 'SIGTERM' && frontRestarting)) {
      log('manager', 'Redémarrage Frontend dans 1 s …')
      setTimeout(() => { frontRestarting = false; startFrontend() }, 1000)
    }
  })

  frontProc.on('error', (e) => log('manager', `Erreur Frontend: ${e.message}`))
}

// ─── Restart handler ──────────────────────────────────────────────────────────

function handleRestart(target) {
  if (target === 'api' || target === 'all') {
    if (apiProc) {
      log('manager', 'Arrêt API pour redémarrage …')
      apiRestarting = true
      apiProc.kill('SIGTERM')
    }
  }
  if (target === 'frontend' || target === 'all') {
    if (frontProc) {
      log('manager', 'Arrêt Frontend pour redémarrage …')
      frontRestarting = true
      frontProc.kill('SIGTERM')
    }
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown() {
  log('manager', 'Arrêt demandé — fermeture des processus enfants …')
  if (apiProc)   { apiRestarting   = false; apiProc.kill('SIGTERM') }
  if (frontProc) { frontRestarting = false; frontProc.kill('SIGTERM') }
  setTimeout(() => process.exit(0), 3000)
}

process.on('SIGINT',  shutdown)
process.on('SIGTERM', shutdown)

// ─── Start ────────────────────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════╗')
console.log('║  SkillsHub Manager                       ║')
console.log('║  API      → http://localhost:8000        ║')
console.log('║  Frontend → http://localhost:5173        ║')
console.log('╚══════════════════════════════════════════╝')
console.log()

startApi()
startFrontend()
