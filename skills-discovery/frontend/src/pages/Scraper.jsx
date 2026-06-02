import React, { useState, useEffect, useCallback } from 'react'
import {
  getScrapers,
  getSessions,
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  deleteSession,
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
  anthropic:      'bg-purple-900 text-purple-300',
  'mcp-official': 'bg-blue-900 text-blue-300',
  web:            'bg-orange-900 text-orange-300',
}

function ProgressBar({ progress, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0
  return (
    <div className="w-full bg-gray-700 rounded-full h-1.5">
      <div
        className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function SourceBadge({ source }) {
  const cls = SOURCE_STYLES[source] || 'bg-gray-700 text-gray-300'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {source}
    </span>
  )
}

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || 'bg-gray-700 text-gray-300'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {status}
    </span>
  )
}

function formatTs(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts + 'Z').toLocaleString()
  } catch {
    return ts
  }
}

function SessionRow({ session, onAction, expanded, onToggleExpand }) {
  const isActive = session.status === 'running' || session.status === 'paused'
  const isDone = ['completed', 'failed', 'stopped'].includes(session.status)

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      {/* Main row */}
      <div className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Name + badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-white truncate">{session.name}</span>
              <SourceBadge source={session.source} />
              <StatusBadge status={session.status} />
            </div>
            <div className="mt-1 flex items-center gap-4 text-xs text-gray-400">
              <span>Started: {formatTs(session.started_at)}</span>
              {session.finished_at && <span>Finished: {formatTs(session.finished_at)}</span>}
            </div>
          </div>

          {/* Stats + progress */}
          <div className="flex-shrink-0 w-full sm:w-48">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{session.progress}/{session.total} processed</span>
              <span className="text-emerald-400">{session.found} new</span>
            </div>
            <ProgressBar progress={session.progress} total={session.total} />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {session.status === 'running' && (
              <button
                onClick={() => onAction('pause', session.id)}
                className="px-3 py-1.5 text-xs bg-yellow-700 hover:bg-yellow-600 text-white rounded transition-colors"
              >
                Pause
              </button>
            )}
            {session.status === 'paused' && (
              <button
                onClick={() => onAction('resume', session.id)}
                className="px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
              >
                Resume
              </button>
            )}
            {isActive && (
              <button
                onClick={() => onAction('stop', session.id)}
                className="px-3 py-1.5 text-xs bg-red-800 hover:bg-red-700 text-white rounded transition-colors"
              >
                Stop
              </button>
            )}
            {isDone && (
              <button
                onClick={() => onAction('delete', session.id)}
                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              >
                Delete
              </button>
            )}
            <button
              onClick={onToggleExpand}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
              {expanded ? 'Hide logs' : 'Logs'}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded logs */}
      {expanded && (
        <div className="border-t border-gray-700 bg-gray-900 p-3">
          {session.logs.length === 0 ? (
            <p className="text-xs text-gray-500 font-mono">No logs yet.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {session.logs.map((entry, i) => (
                <div key={i} className="flex gap-2 font-mono text-xs">
                  <span className="text-gray-500 flex-shrink-0">
                    {entry.time ? entry.time.replace('T', ' ').split('.')[0] : ''}
                  </span>
                  <span className="text-gray-300">{entry.msg}</span>
                </div>
              ))}
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
  const [expandedSessions, setExpandedSessions] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [launching, setLaunching] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const hasActiveSessions = sessions.some(
    (s) => s.status === 'running' || s.status === 'paused'
  )

  const fetchSessions = useCallback(async () => {
    try {
      const res = await getSessions()
      setSessions(res.data)
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Failed to fetch sessions', err)
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [scrapersRes, sessionsRes] = await Promise.all([getScrapers(), getSessions()])
      setScrapers(scrapersRes.data)
      setSessions(sessionsRes.data)
      setLastRefresh(new Date())
    } catch (err) {
      setError('Failed to load scraper data.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Auto-refresh every 2 seconds when active sessions exist
  useEffect(() => {
    if (!hasActiveSessions) return
    const timer = setInterval(() => {
      fetchSessions()
    }, 2000)
    return () => clearInterval(timer)
  }, [hasActiveSessions, fetchSessions])

  const handleLaunch = async (scraperId) => {
    setLaunching(scraperId)
    try {
      await startSession(scraperId)
      await fetchSessions()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to start session')
    } finally {
      setLaunching(null)
    }
  }

  const handleAction = async (action, sessionId) => {
    try {
      if (action === 'pause') await pauseSession(sessionId)
      else if (action === 'resume') await resumeSession(sessionId)
      else if (action === 'stop') await stopSession(sessionId)
      else if (action === 'delete') await deleteSession(sessionId)
      await fetchSessions()
    } catch (err) {
      alert(err?.response?.data?.detail || `Failed to ${action} session`)
    }
  }

  const toggleExpand = (sessionId) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  // Determine which scrapers are currently running or pending (to disable Launch)
  const activeScraper = new Set(
    sessions
      .filter((s) => s.status === 'running' || s.status === 'pending' || s.status === 'paused')
      .map((s) => s.name)
  )

  const isScraperActive = (scraper) => activeScraper.has(scraper.name)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <p className="text-red-400">{error}</p>
        <button
          onClick={fetchAll}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Scraper</h1>
          <p className="text-gray-400 text-sm mt-1">
            Discover and import new skills from external sources.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasActiveSessions && (
            <span className="flex items-center gap-1.5 text-xs text-blue-400">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Auto-refresh active
            </span>
          )}
          {lastRefresh && (
            <span className="text-xs text-gray-500">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchAll}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Available Scrapers */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Available Scrapers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {scrapers.map((scraper) => {
            const active = isScraperActive(scraper)
            return (
              <div
                key={scraper.id}
                className="bg-gray-800 rounded-lg border border-gray-700 p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white truncate">{scraper.name}</h3>
                    <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                      {scraper.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-700">
                  <div className="flex items-center gap-2">
                    <SourceBadge source={scraper.source} />
                    <span className="text-xs text-gray-500">~{scraper.estimated} items</span>
                  </div>
                  <button
                    onClick={() => handleLaunch(scraper.id)}
                    disabled={active || launching === scraper.id}
                    className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                      active || launching === scraper.id
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {launching === scraper.id ? 'Launching…' : active ? 'Active' : 'Launch'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Sessions */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Sessions{' '}
          {sessions.length > 0 && (
            <span className="text-gray-500 font-normal text-sm">({sessions.length})</span>
          )}
        </h2>

        {sessions.length === 0 ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-10 text-center">
            <p className="text-gray-500">No sessions yet. Launch a scraper above to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onAction={handleAction}
                expanded={expandedSessions.has(session.id)}
                onToggleExpand={() => toggleExpand(session.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
