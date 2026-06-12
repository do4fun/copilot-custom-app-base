#!/usr/bin/env node
/**
 * Process manager SkillsHub — lance et supervise l'API et le frontend.
 *
 * - IPC : l'API peut envoyer process.send({action:'restart', target:'api'|'frontend'|'all'})
 * - Auto-restart : exit code 0 ou 75 → relance après 1 s ; exit code 1 → arrêt définitif
 * - Logs préfixés : [HH:MM:SS] [api] message
 */
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const PROCESSES = {
  api: {
    command: 'node',
    args: ['src/server.js'],
    cwd: join(ROOT, 'api'),
    ipc: true,
  },
  frontend: {
    command: 'npm',
    args: ['run', 'dev'],
    cwd: join(ROOT, 'frontend'),
    ipc: false,
  },
}

const children = {}
let shuttingDown = false

function timestamp() {
  return new Date().toTimeString().slice(0, 8)
}

function log(name, message) {
  for (const line of String(message).split('\n')) {
    if (line.trim()) console.log(`[${timestamp()}] [${name}] ${line}`)
  }
}

function start(name) {
  const def = PROCESSES[name]
  const stdio = def.ipc
    ? ['ignore', 'pipe', 'pipe', 'ipc']
    : ['ignore', 'pipe', 'pipe']

  const child = spawn(def.command, def.args, {
    cwd: def.cwd,
    stdio,
    env: process.env,
    shell: process.platform === 'win32',
  })

  children[name] = child
  log('manager', `${name} démarré (pid ${child.pid})`)

  child.stdout.on('data', (d) => log(name, d.toString()))
  child.stderr.on('data', (d) => log(name, d.toString()))

  if (def.ipc) {
    child.on('message', (msg) => {
      if (msg?.action === 'restart') {
        const target = msg.target || 'api'
        log('manager', `restart demandé via IPC : ${target}`)
        if (target === 'all') {
          restart('api')
          restart('frontend')
        } else {
          restart(target)
        }
      }
    })
  }

  child.on('exit', (code) => {
    if (shuttingDown) return
    log('manager', `${name} terminé (code ${code})`)
    if (code === 1) {
      log('manager', `${name} arrêté définitivement (code 1)`)
      return
    }
    // code 0, 75 ou crash → relance après 1 s
    setTimeout(() => {
      if (!shuttingDown) start(name)
    }, 1000)
  })
}

function restart(name) {
  const child = children[name]
  if (child && !child.killed) {
    child.kill('SIGTERM')
    // le handler 'exit' relancera automatiquement
  } else {
    start(name)
  }
}

process.on('SIGINT', () => {
  shuttingDown = true
  log('manager', 'arrêt en cours…')
  for (const child of Object.values(children)) {
    if (child && !child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(0), 500)
})

start('api')
start('frontend')
