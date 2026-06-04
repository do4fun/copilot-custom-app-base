import React, { useState, useEffect, useCallback } from 'react'
import {
  getScrapers, getSessions,
  startSession, pauseSession, resumeSession, stopSession,
  deleteSession, clearCompletedSessions,
} from '../api'

const STATUS_STYLES = {
  pending:   'bg-gray-700 text-gray-300',
  running:   'bg-blue-900 text-blue-300 animate-pulse',
  paused:    'bg-yellow-900 text-yellow-300',
  completed: 'bg-emerald-900 text-emerald-300',
  failed:    'bg-red-900 text-red-300',
  stopped:   'bg-gray-700 text-gray-400',
}

const SOURCE_STYLES = {
  github:       'bg-gray-700 text-gray-200',
  npm:          'bg-red-900 text-red-300',
  vscode:       'bg-blue-900 text-blue-300',
  huggingface:  'bg-yellow-900 text-yellow-300',
  anthropic:    'bg-purple-900 text-purple-300',
  'mcp-official': 'bg-indigo-900 text-indigo-300',
}

function Badge({ label, style }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${style}`}>{label}</span>
}

function ProgressBar({ progress, total, status }) {
  const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0
  const color = status === 'failed' ? 'bg-red-500'
    : status === 'completed' ? 'bg-emerald-500'
    : status === 'paused' ? 'bg-yellow-500'
    : 'bg-indigo-500'
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

function SessionCard({ session, onAction, expanded, onToggle }) {
  const isActive = ['running', 'paused'].includes(session.status)
  const isDone = ['completed', 'failed', 'stopped'].includes(session.status)
  const pct = session.total > 0 ? Math.round((session.progress / session.total) * 100) : 0

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-medium text-white">{session.name}</span>
              <Badge label={session.source} style={SOURCE_STYLES[session.source] || 'bg-gray-700 text-gray-300'} />
              <Badge label={session.status} style={STATUS_STYLES[session.status] || 'bg-gray-700 text-gray-300'} />
              {session.status === 'running' && (
                <span className="flex items-center gap-1 text-xs text-blue-400">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  live
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
              <button onClick={() => onAction('pause', session.id)}
                className="px-3 py-1.5 text-xs bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg transition-colors">
                Pause
              </button>
            )}
            {session.status === 'paused' && (
              <button onClick={() => onAction('resume', session.id)}
                className="px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors">
                Reprendre
              </button>
            )}
            {isActive && (
              <button onClick={() => onAction('stop', session.id)}
                className="px-3 py-1.5 text-xs bg-red-800 hover:bg-red-700 text-white rounded-lg transition-colors">
                Arrêter
              </button>
            )}
            {isDone && (
              <button onClick={() => onAction('delete', session.id)}
                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
                Supprimer
              </button>
            )}
            <button onClick={onToggle}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
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
                const isErr = entry.msg?.toLowerCase().includes('erreur')
                return (
                  <div key={i} className="flex gap-2 font-mono text-xs leading-5">
                    <span className="text-gray-600 flex-shrink-0 w-16">
                      {(entry.time || '').split('T')[1]?.split('.')[0] || ''}
                    </span>
                    <span className={isErr ? 'text-red-400' : isNew ? 'text-emerald-400' : 'text-gray-400'}>
                      {entry.msg}
                    </span>
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

export default function Scraper() {
  const [scrapers, setScrapers] = useState([])
  const [sessions, setSessions] = useState([])
  const [expanded, setExpanded] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [launching, setLaunching] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const hasActive = sessions.some(s => ['running', 'paused'].includes(s.status))
  const hasCompleted = sessions.some(s => ['completed', 'failed', 'stopped'].includes(s.status))

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
      const [sr, se] = await Promise.all([getScrapers(), getSessions()])
      setScrapers(sr.data)
      setSessions(se.data)
      setLastRefresh(new Date())
    } catch {
      setError('Impossible de contacter le backend.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { init() }, [init])

  // Auto-poll every 2s when a session is running
  useEffect(() => {
    if (!hasActive) return
    const t = setInterval(fetchSessions, 2000)
    return () => clearInterval(t)
  }, [hasActive, fetchSessions])

  const handleLaunch = async (scraperId) => {
    setLaunching(scraperId)
    try {
      await startSession(scraperId)
      await fetchSessions()
      // auto-expand the new session logs
      const res = await getSessions()
      const newest = res.data[0]
      if (newest) setExpanded(prev => new Set([...prev, newest.id]))
      setSessions(res.data)
    } catch (e) {
      alert(e?.response?.data?.detail || 'Échec du lancement')
    } finally {
      setLaunching(null)
    }
  }

  const handleAction = async (action, id) => {
    try {
      if (action === 'pause')  await pauseSession(id)
      if (action === 'resume') await resumeSession(id)
      if (action === 'stop')   await stopSession(id)
      if (action === 'delete') await deleteSession(id)
      await fetchSessions()
    } catch (e) {
      alert(e?.response?.data?.detail || `Échec: ${action}`)
    }
  }

  const handleClearAll = async () => {
    try {
      await clearCompletedSessions()
      await fetchSessions()
    } catch {}
  }

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const activeScraperNames = new Set(
    sessions.filter(s => ['running', 'pending', 'paused'].includes(s.status)).map(s => s.name)
  )

  const liveScraper = scrapers.filter(s => s.live)
  const localScraper = scrapers.filter(s => !s.live)

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center gap-4 py-20">
      <p className="text-red-400">{error}</p>
      <button onClick={init} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm">
        Réessayer
      </button>
    </div>
  )

  return (
    <div className="space-y-10 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Scraper — Découverte de Skills</h1>
          <p className="text-gray-400 text-sm mt-1">
            Lance une session pour chercher de nouveaux skills en temps réel sur le web.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {hasActive && (
            <span className="flex items-center gap-1.5 text-xs text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />
              Polling actif
            </span>
          )}
          {lastRefresh && (
            <span className="text-xs text-gray-600">{lastRefresh.toLocaleTimeString()}</span>
          )}
          <button onClick={init}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
            Rafraîchir
          </button>
        </div>
      </div>

      {/* Live web scrapers */}
      <section>
        <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
          Sources web live
          <span className="text-xs text-emerald-400 bg-emerald-900/50 border border-emerald-800 px-2 py-0.5 rounded-full">
            Recherche réelle sur le web
          </span>
        </h2>
        <p className="text-gray-500 text-xs mb-4">
          Ces scrapers contactent GitHub, npm, VS Code Marketplace et Hugging Face pour découvrir de nouveaux skills.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {liveScraper.map(sc => {
            const active = activeScraperNames.has(sc.name)
            const isLaunching = launching === sc.id
            return (
              <div key={sc.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-medium text-sm">{sc.name}</h3>
                    <Badge label={sc.source} style={SOURCE_STYLES[sc.source] || 'bg-gray-700 text-gray-300'} />
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed">{sc.description}</p>
                </div>
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-700">
                  <span className="text-gray-600 text-xs">~{sc.estimated} items</span>
                  <button
                    onClick={() => handleLaunch(sc.id)}
                    disabled={active || isLaunching}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                      active || isLaunching
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {isLaunching ? 'Lancement…' : active ? 'En cours' : 'Lancer'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Local scrapers */}
      {localScraper.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
            Sources locales
            <span className="text-xs text-gray-400 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full">
              Seed data
            </span>
          </h2>
          <p className="text-gray-500 text-xs mb-4">
            Re-synchronise les skills depuis les données locales (utile après une mise à jour de la seed data).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {localScraper.map(sc => {
              const active = activeScraperNames.has(sc.name)
              const isLaunching = launching === sc.id
              return (
                <div key={sc.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-medium text-sm">{sc.name}</h3>
                      <Badge label={sc.source} style={SOURCE_STYLES[sc.source] || 'bg-gray-700 text-gray-300'} />
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed">{sc.description}</p>
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-700">
                    <span className="text-gray-600 text-xs">~{sc.estimated} items</span>
                    <button
                      onClick={() => handleLaunch(sc.id)}
                      disabled={active || isLaunching}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                        active || isLaunching
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-gray-600 hover:bg-gray-500 text-white'
                      }`}
                    >
                      {isLaunching ? 'Lancement…' : active ? 'En cours' : 'Synchroniser'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Sessions */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">
            Historique des sessions
            {sessions.length > 0 && (
              <span className="text-gray-500 font-normal text-sm ml-2">({sessions.length})</span>
            )}
          </h2>
          {hasCompleted && (
            <button onClick={handleClearAll}
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
                onToggle={() => toggleExpand(session.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
