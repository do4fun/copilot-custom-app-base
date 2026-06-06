import React, { useState, useEffect, useCallback } from 'react'
import {
  getConfigs, createConfig, updateConfig, deleteConfig,
  getSessions, startSession, pauseSession, resumeSession, stopSession,
  deleteSession, clearCompletedSessions,
} from '../api'

// ─── Constants ────────────────────────────────────────────────────────────────

const CRAWLER_TYPES = [
  { value: 'github-awesome', label: 'GitHub Awesome List' },
  { value: 'github-search',  label: 'GitHub Search' },
  { value: 'npm',            label: 'npm Registry' },
  { value: 'generic',        label: 'Page web générique' },
]

const CATEGORIES = ['MCP Server', 'Claude Code Skill', 'AI Coding Tool', 'AI Productivity Tool', 'Software']

const STATUS_STYLES = {
  pending:   'bg-gray-700 text-gray-300',
  running:   'bg-blue-900 text-blue-300 animate-pulse',
  paused:    'bg-yellow-900 text-yellow-300',
  completed: 'bg-emerald-900 text-emerald-300',
  failed:    'bg-red-900 text-red-300',
  stopped:   'bg-gray-700 text-gray-400',
}

const TYPE_LABELS = {
  'github-awesome': { label: 'GH Awesome', color: 'bg-gray-700 text-gray-300' },
  'github-search':  { label: 'GH Search',  color: 'bg-gray-700 text-gray-300' },
  npm:              { label: 'npm',         color: 'bg-red-900 text-red-300' },
  generic:          { label: 'Web',         color: 'bg-blue-900 text-blue-300' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ label, color }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>
}

function ProgressBar({ progress, total, status }) {
  const pct   = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0
  const color = status === 'failed' ? 'bg-red-500' : status === 'completed' ? 'bg-emerald-500' : status === 'paused' ? 'bg-yellow-500' : 'bg-indigo-500'
  return (
    <div className="w-full bg-gray-700 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function formatTs(ts) {
  if (!ts) return '—'
  try { return new Date(ts + 'Z').toLocaleTimeString() } catch { return ts }
}

function ConfigForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { name: '', url: '', type: 'github-search', category: 'MCP Server' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const typeInfo = {
    'github-awesome': 'URL d\'un dépôt GitHub avec une liste awesome (ex: github.com/user/awesome-mcp)',
    'github-search':  'Requête de recherche GitHub (ex: topic:mcp-server stars:>10)',
    'npm':            'Recherche npm (ex: @modelcontextprotocol  ou  mcp-server)',
    'generic':        'URL d\'une page web à scraper (ex: https://example.com/tools)',
  }
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Nom</label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            placeholder="Mon scraper MCP" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Type</label>
          <select value={form.type} onChange={e => set('type', e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
            {CRAWLER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">URL / Requête</label>
        <input value={form.url} onChange={e => set('url', e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          placeholder={typeInfo[form.type]} />
        <p className="text-xs text-gray-600 mt-1">{typeInfo[form.type]}</p>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Catégorie par défaut</label>
        <select value={form.category} onChange={e => set('category', e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
          {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(form)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors">
          Sauvegarder
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors">
          Annuler
        </button>
      </div>
    </div>
  )
}

function ConfigCard({ config, onLaunch, onEdit, onDelete, isLaunching, isRunning }) {
  const typeInfo = TYPE_LABELS[config.type] || { label: config.type, color: 'bg-gray-700 text-gray-300' }
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-white font-medium text-sm truncate">{config.name}</span>
            <Badge label={typeInfo.label} color={typeInfo.color} />
          </div>
          <p className="text-gray-500 text-xs truncate">{config.url}</p>
          <p className="text-gray-600 text-xs mt-0.5">{config.category}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit}
            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors" title="Modifier">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={onDelete}
            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title="Supprimer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      <button onClick={() => onLaunch(config.id)} disabled={isRunning || isLaunching}
        className={`w-full py-2 text-sm rounded-lg font-medium transition-colors ${
          isRunning || isLaunching
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        }`}>
        {isLaunching ? 'Lancement…' : isRunning ? 'En cours' : '▶ Lancer'}
      </button>
    </div>
  )
}

function SessionCard({ session, onAction, expanded, onToggle }) {
  const isActive = ['running', 'paused'].includes(session.status)
  const isDone   = ['completed', 'failed', 'stopped'].includes(session.status)
  const pct      = session.total > 0 ? Math.round((session.progress / session.total) * 100) : 0
  const typeInfo = TYPE_LABELS[session.source] || { label: session.source, color: 'bg-gray-700 text-gray-300' }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-medium text-white">{session.name}</span>
              <Badge label={typeInfo.label} color={typeInfo.color} />
              <Badge label={session.status} color={STATUS_STYLES[session.status] || 'bg-gray-700 text-gray-300'} />
              {session.status === 'running' && (
                <span className="flex items-center gap-1 text-xs text-blue-400">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> live
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-2">
              {session.started_at && <span>Démarré: {formatTs(session.started_at)}</span>}
              {session.finished_at && <span>Terminé: {formatTs(session.finished_at)}</span>}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{session.progress}/{session.total} traités ({pct}%)</span>
              <span className="text-emerald-400 font-medium">{session.found} nouveaux</span>
            </div>
            <ProgressBar progress={session.progress} total={session.total} status={session.status} />
          </div>
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            {session.status === 'running' && (
              <button onClick={() => onAction('pause', session.id)} className="px-3 py-1.5 text-xs bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg transition-colors">Pause</button>
            )}
            {session.status === 'paused' && (
              <button onClick={() => onAction('resume', session.id)} className="px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors">Reprendre</button>
            )}
            {isActive && (
              <button onClick={() => onAction('stop', session.id)} className="px-3 py-1.5 text-xs bg-red-800 hover:bg-red-700 text-white rounded-lg transition-colors">Arrêter</button>
            )}
            {isDone && (
              <button onClick={() => onAction('delete', session.id)} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">Supprimer</button>
            )}
            <button onClick={onToggle} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
              {expanded ? 'Masquer logs' : 'Logs'}
            </button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-700 bg-gray-900 p-3">
          {session.logs.length === 0 ? (
            <p className="text-xs text-gray-600 font-mono">Aucun log.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {[...session.logs].reverse().map((entry, i) => {
                const isNew = entry.msg?.startsWith('+')
                const isErr = /erreur|error|fail/i.test(entry.msg || '')
                return (
                  <div key={i} className="flex gap-2 font-mono text-xs leading-5">
                    <span className="text-gray-600 flex-shrink-0 w-16">{(entry.time || '').split('T')[1]?.split('.')[0] || ''}</span>
                    <span className={isErr ? 'text-red-400' : isNew ? 'text-emerald-400' : 'text-gray-400'}>{entry.msg}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Scraper() {
  const [configs, setConfigs]       = useState([])
  const [sessions, setSessions]     = useState([])
  const [expanded, setExpanded]     = useState(new Set())
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [launching, setLaunching]   = useState(null)
  const [showForm, setShowForm]     = useState(false)
  const [editingConfig, setEditing] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const hasActive    = sessions.some(s => ['running', 'paused'].includes(s.status))
  const hasCompleted = sessions.some(s => ['completed', 'failed', 'stopped'].includes(s.status))

  const runningNames = new Set(
    sessions.filter(s => ['running', 'pending', 'paused'].includes(s.status)).map(s => s.name)
  )

  const fetchSessions = useCallback(async () => {
    try {
      const res = await getSessions()
      setSessions(res.data)
      setLastRefresh(new Date())
    } catch {}
  }, [])

  const init = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cr, se] = await Promise.all([getConfigs(), getSessions()])
      setConfigs(cr.data)
      setSessions(se.data)
      setLastRefresh(new Date())
    } catch {
      setError('Impossible de contacter le backend.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { init() }, [init])

  useEffect(() => {
    if (!hasActive) return
    const t = setInterval(fetchSessions, 2000)
    return () => clearInterval(t)
  }, [hasActive, fetchSessions])

  const handleLaunch = async (configId) => {
    setLaunching(configId)
    try {
      await startSession(configId)
      const res = await getSessions()
      setSessions(res.data)
      const newest = res.data[0]
      if (newest) setExpanded(prev => new Set([...prev, newest.id]))
    } catch (e) {
      alert(e?.response?.data?.error || e?.response?.data?.detail || 'Échec du lancement')
    } finally {
      setLaunching(null)
    }
  }

  const handleSaveConfig = async (form) => {
    try {
      if (editingConfig) {
        await updateConfig(editingConfig.id, form)
      } else {
        await createConfig(form)
      }
      const res = await getConfigs()
      setConfigs(res.data)
      setShowForm(false)
      setEditing(null)
    } catch (e) {
      alert(e?.response?.data?.error || 'Erreur lors de la sauvegarde')
    }
  }

  const handleDeleteConfig = async (id) => {
    if (!confirm('Supprimer cette configuration ?')) return
    await deleteConfig(id)
    setConfigs(cs => cs.filter(c => c.id !== id))
  }

  const handleAction = async (action, id) => {
    try {
      if (action === 'pause')  await pauseSession(id)
      if (action === 'resume') await resumeSession(id)
      if (action === 'stop')   await stopSession(id)
      if (action === 'delete') await deleteSession(id)
      await fetchSessions()
    } catch (e) {
      alert(e?.response?.data?.error || e?.response?.data?.detail || `Échec: ${action}`)
    }
  }

  const toggleExpand = (id) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center gap-4 py-20">
      <p className="text-red-400">{error}</p>
      <button onClick={init} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm">Réessayer</button>
    </div>
  )

  return (
    <div className="space-y-10 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Scraper — Découverte de Skills</h1>
          <p className="text-gray-400 text-sm mt-1">Configure des sources et lance des sessions de scraping Crawlee pour découvrir de nouveaux skills.</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {hasActive && (
            <span className="flex items-center gap-1.5 text-xs text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" /> Polling actif
            </span>
          )}
          {lastRefresh && <span className="text-xs text-gray-600">{lastRefresh.toLocaleTimeString()}</span>}
          <button onClick={init} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">Rafraîchir</button>
        </div>
      </div>

      {/* Configurations */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              Configurations
              <span className="text-xs text-gray-500 font-normal">({configs.length})</span>
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">Chaque configuration définit une source à scraper avec Crawlee.</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditing(null) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors">
            <span className="text-lg leading-none">+</span> Ajouter
          </button>
        </div>

        {(showForm && !editingConfig) && (
          <div className="mb-4">
            <ConfigForm onSave={handleSaveConfig} onCancel={() => setShowForm(false)} />
          </div>
        )}

        {configs.length === 0 && !showForm ? (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
            <p className="text-gray-500 text-sm">Aucune configuration. Cliquez sur "+ Ajouter" pour créer une source.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {configs.map(cfg => (
              editingConfig?.id === cfg.id ? (
                <div key={cfg.id} className="sm:col-span-2 lg:col-span-3">
                  <ConfigForm
                    initial={cfg}
                    onSave={handleSaveConfig}
                    onCancel={() => setEditing(null)} />
                </div>
              ) : (
                <ConfigCard
                  key={cfg.id}
                  config={cfg}
                  isLaunching={launching === cfg.id}
                  isRunning={runningNames.has(cfg.name)}
                  onLaunch={handleLaunch}
                  onEdit={() => { setEditing(cfg); setShowForm(false) }}
                  onDelete={() => handleDeleteConfig(cfg.id)} />
              )
            ))}
          </div>
        )}
      </section>

      {/* Sessions */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">
            Historique des sessions
            {sessions.length > 0 && <span className="text-gray-500 font-normal text-sm ml-2">({sessions.length})</span>}
          </h2>
          {hasCompleted && (
            <button onClick={async () => { await clearCompletedSessions(); await fetchSessions() }}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors">
              Vider les sessions terminées
            </button>
          )}
        </div>
        {sessions.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-10 text-center">
            <p className="text-gray-500">Aucune session. Lance un scraper ci-dessus.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                onAction={handleAction}
                expanded={expanded.has(session.id)}
                onToggle={() => toggleExpand(session.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
