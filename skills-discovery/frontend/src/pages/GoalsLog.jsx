import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const CATEGORY_COLORS = {
  'Claude Code Skill':    'bg-indigo-900 text-indigo-300',
  'MCP Server':           'bg-purple-900 text-purple-300',
  'AI Coding Tool':       'bg-blue-900 text-blue-300',
  'AI Productivity Tool': 'bg-teal-900 text-teal-300',
  'Software':             'bg-gray-700 text-gray-300',
}

function catColor(cat) {
  return CATEGORY_COLORS[cat] || 'bg-gray-700 text-gray-300'
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 5)  return 'à l\'instant'
  if (diff < 60) return `il y a ${diff}s`
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function GoalsLog() {
  const navigate = useNavigate()
  const [logs,     setLogs]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState(null)
  const intervalRef = useRef(null)

  const fetchLogs = async () => {
    try {
      const res = await api.get('/goals/logs')
      setLogs(res.data)
    } catch {
      // API not ready yet
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    intervalRef.current = setInterval(fetchLogs, 2000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const handleClear = async () => {
    await api.delete('/goals/logs')
    setLogs([])
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Goals — Log de session</h1>
          <p className="text-gray-500 text-sm mt-0.5">Skills proposés au LLM à chaque appel Décomposer · rafraîchi toutes les 2s</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 tabular-nums">{logs.length} appel{logs.length !== 1 ? 's' : ''}</span>
          {logs.length > 0 && (
            <button onClick={handleClear}
              className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 border border-red-800 rounded-lg transition-colors">
              Vider
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!loading && logs.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-sm">Aucun appel enregistré dans cette session.</p>
          <p className="text-gray-600 text-xs mt-1">Clique sur "Décomposer" dans la page Goal Decomposition pour voir les logs apparaître ici.</p>
        </div>
      )}

      {/* Log entries */}
      {logs.map((entry, i) => {
        const isOpen = expanded === entry.id
        const pending = entry.method === null

        // Group skills by category
        const byCategory = {}
        for (const s of entry.skills) {
          if (!byCategory[s.category]) byCategory[s.category] = []
          byCategory[s.category].push(s.name)
        }

        return (
          <div key={entry.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">

            {/* Row header */}
            <button
              onClick={() => setExpanded(isOpen ? null : entry.id)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-750 transition-colors text-left">

              {/* Index */}
              <span className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-xs font-mono flex-shrink-0">
                {logs.length - i}
              </span>

              {/* Goal */}
              <span className="flex-1 text-white text-sm font-medium truncate">{entry.goal}</span>

              {/* Source badge */}
              <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded font-mono ${entry.source === 'sqlite-vector' ? 'bg-violet-900 text-violet-300' : 'bg-gray-700 text-gray-400'}`}>
                {entry.source}
              </span>

              {/* Method badge */}
              <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded font-mono ${
                pending          ? 'bg-yellow-900 text-yellow-400 animate-pulse'
                : entry.method === 'claude' ? 'bg-emerald-900 text-emerald-400'
                : 'bg-orange-900 text-orange-400'
              }`}>
                {pending ? '…' : entry.method}
              </span>

              {/* Skills count */}
              <span className="flex-shrink-0 text-xs text-gray-500 font-mono tabular-nums">{entry.skills.length} skills</span>

              {/* Time */}
              <span className="flex-shrink-0 text-xs text-gray-600 tabular-nums w-24 text-right">{timeAgo(entry.ts)}</span>

              {/* Chevron */}
              <svg className={`w-4 h-4 text-gray-600 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expanded — skills list grouped by category */}
            {isOpen && (
              <div className="border-t border-gray-700 px-5 py-4 space-y-4">
                {Object.entries(byCategory).map(([cat, names]) => (
                  <div key={cat}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{cat} <span className="normal-case font-normal text-gray-600">({names.length})</span></p>
                    <div className="flex flex-wrap gap-2">
                      {entry.skills.filter(s => s.category === cat).map(s => (
                        s.id
                          ? <button key={s.name} onClick={() => navigate(`/skill/${s.id}`)}
                              className={`text-xs px-2.5 py-1 rounded-full transition-opacity hover:opacity-75 ${catColor(cat)}`}>
                              {s.name}
                            </button>
                          : <span key={s.name} className={`text-xs px-2.5 py-1 rounded-full ${catColor(cat)}`}>{s.name}</span>
                      ))}
                    </div>
                  </div>
                ))}

                {entry.skills.length === 0 && (
                  <p className="text-gray-600 text-sm italic">Aucun skill retourné par la source de données.</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
