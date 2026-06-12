import { useEffect, useState } from 'react'
import {
  getConfigs,
  createConfig,
  deleteConfig,
  getSessions,
  getSession,
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  deleteSession,
  clearAllSessions,
} from '../api'

const CRAWLER_TYPES = [
  { value: 'github-skill-repo', label: 'GitHub — repo de skills (Trees API)', group: 'Skills' },
  { value: 'github-skill-files', label: 'GitHub — recherche skill.md (code search)', group: 'Skills' },
  { value: 'github-agent-repo', label: "GitHub — repo d'agents (Trees API)", group: 'Agents' },
  { value: 'github-agent-files', label: 'GitHub — recherche agents.md (code search)', group: 'Agents' },
  { value: 'github-awesome', label: 'GitHub Awesome List', group: 'Général' },
  { value: 'github-search', label: 'GitHub Search', group: 'Général' },
  { value: 'npm', label: 'npm Registry', group: 'Général' },
  { value: 'web-segment', label: 'Segmentation web IA (LLM)', group: 'Web IA' },
  { value: 'generic', label: 'Page web générique (basique, sans IA)', group: 'Web IA' },
]

const CATEGORIES = ['Claude Code Skill', 'MCP Server', 'AI Coding Tool', 'AI Productivity Tool', 'Software']

const STATUS_COLORS = {
  pending: 'bg-gray-700 text-gray-300',
  running: 'bg-blue-900 text-blue-300',
  paused: 'bg-yellow-900 text-yellow-300',
  completed: 'bg-green-900 text-green-300',
  failed: 'bg-red-900 text-red-300',
  stopped: 'bg-gray-700 text-gray-400',
}

const LOG_LEVELS = ['ALL', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR']

export default function Scraper() {
  const [configs, setConfigs] = useState([])
  const [sessions, setSessions] = useState([])
  const [form, setForm] = useState({ name: '', url: '', type: 'web-segment', category: 'AI Coding Tool' })
  const [detail, setDetail] = useState(null)
  const [logFilter, setLogFilter] = useState('ALL')

  const loadConfigs = () => getConfigs().then(setConfigs).catch(() => {})
  const loadSessions = () => getSessions().then(setSessions).catch(() => {})

  useEffect(() => {
    loadConfigs()
    loadSessions()
  }, [])

  // polling 2 s tant qu'une session tourne, et refresh du détail ouvert
  const hasActive = sessions.some((s) => ['running', 'paused', 'pending'].includes(s.status))
  useEffect(() => {
    if (!hasActive && !detail) return
    const interval = setInterval(() => {
      loadSessions()
      if (detail) getSession(detail.id).then(setDetail).catch(() => {})
    }, 2000)
    return () => clearInterval(interval)
  }, [hasActive, detail?.id])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.url.trim()) return
    await createConfig(form)
    setForm({ name: '', url: '', type: 'web-segment', category: 'AI Coding Tool' })
    loadConfigs()
  }

  const handleStart = async (configId) => {
    await startSession(configId)
    loadSessions()
  }

  const groups = [...new Set(CRAWLER_TYPES.map((t) => t.group))]
  const filteredLogs = (detail?.logs || []).filter((l) => logFilter === 'ALL' || l.level === logFilter)

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-gray-100">Scraper</h1>

      {/* Nouvelle config */}
      <form onSubmit={handleCreate} className="bg-gray-800 rounded-lg border border-gray-700 p-5 space-y-3">
        <h2 className="font-semibold text-gray-100">Nouvelle config de crawl</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nom"
            className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm placeholder-gray-500"
          />
          <input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="URL ou requête"
            className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm placeholder-gray-500"
          />
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm"
          >
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {CRAWLER_TYPES.filter((t) => t.group === g).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {form.type === 'web-segment' && (
          <div className="flex items-start gap-2 bg-teal-950 border border-teal-800 rounded-lg px-3 py-2 text-xs text-teal-300">
            <span>✦</span>
            <span>
              Segmentation IA — chaque section analysée par Claude Haiku. Requiert <code>ANTHROPIC_API_KEY</code>.
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={!form.name.trim() || !form.url.trim()}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded disabled:opacity-40"
        >
          Créer la config
        </button>
      </form>

      {/* Configs */}
      <section className="space-y-2">
        <h2 className="font-semibold text-gray-100">Configs ({configs.length})</h2>
        <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700">
          {configs.map((cfg) => (
            <div key={cfg.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-48">
                <p className="text-sm text-gray-200">{cfg.name}</p>
                <p className="text-xs text-gray-500 truncate">{cfg.url}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{cfg.type}</span>
              <span className="text-xs text-gray-500">{cfg.category}</span>
              <button
                onClick={() => handleStart(cfg.id)}
                className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded"
              >
                ▶ Lancer
              </button>
              <button
                onClick={() => deleteConfig(cfg.id).then(loadConfigs)}
                className="text-gray-500 hover:text-red-400 text-sm"
              >
                ✕
              </button>
            </div>
          ))}
          {!configs.length && <p className="text-sm text-gray-500 px-4 py-3">Aucune config.</p>}
        </div>
      </section>

      {/* Sessions */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-100">Sessions ({sessions.length})</h2>
          <button
            onClick={() => clearAllSessions().then(loadSessions)}
            className="text-xs text-gray-400 hover:text-gray-200 border border-gray-600 rounded px-2 py-1"
          >
            Vider les sessions terminées
          </button>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700">
          {sessions.map((s) => {
            const pct = s.total > 0 ? Math.min(100, Math.round((s.progress / s.total) * 100)) : 0
            return (
              <div key={s.id} className="px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => getSession(s.id).then(setDetail)}
                    className="text-sm text-gray-200 hover:text-blue-400 flex-1 text-left min-w-40"
                  >
                    #{s.id} — {s.name}
                  </button>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status] || ''}`}>
                    {s.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    {s.found} trouvés · {s.failed} échecs
                  </span>
                  {s.status === 'running' && (
                    <button onClick={() => pauseSession(s.id).then(loadSessions)} className="text-xs text-yellow-400 hover:text-yellow-300">
                      ⏸ Pause
                    </button>
                  )}
                  {s.status === 'paused' && (
                    <button onClick={() => resumeSession(s.id).then(loadSessions)} className="text-xs text-green-400 hover:text-green-300">
                      ▶ Reprendre
                    </button>
                  )}
                  {['running', 'paused'].includes(s.status) && (
                    <button onClick={() => stopSession(s.id).then(loadSessions)} className="text-xs text-red-400 hover:text-red-300">
                      ■ Stop
                    </button>
                  )}
                  {['completed', 'failed', 'stopped'].includes(s.status) && (
                    <button onClick={() => deleteSession(s.id).then(loadSessions)} className="text-xs text-gray-500 hover:text-red-400">
                      ✕
                    </button>
                  )}
                </div>
                {s.total > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">
                      {s.progress}/{s.total} ({pct}%)
                    </span>
                  </div>
                )}
              </div>
            )
          })}
          {!sessions.length && <p className="text-sm text-gray-500 px-4 py-3">Aucune session.</p>}
        </div>
      </section>

      {/* Détail session + logs */}
      {detail && (
        <section className="bg-gray-800 rounded-lg border border-gray-700 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">
              Session #{detail.id} — {detail.name}
            </h3>
            <div className="flex items-center gap-3">
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-2 py-1 text-xs"
              >
                {LOG_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <button onClick={() => setDetail(null)} className="text-gray-500 hover:text-gray-300">
                Fermer ✕
              </button>
            </div>
          </div>
          <div className="bg-gray-950 border border-gray-700 rounded-lg p-3 max-h-80 overflow-y-auto font-mono text-xs space-y-0.5">
            {filteredLogs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-600 shrink-0">{new Date(log.ts).toLocaleTimeString()}</span>
                <span
                  className={`shrink-0 ${
                    log.level === 'ERROR'
                      ? 'text-red-400'
                      : log.level === 'WARN'
                        ? 'text-yellow-400'
                        : log.level === 'DEBUG' || log.level === 'TRACE'
                          ? 'text-gray-600'
                          : 'text-blue-400'
                  }`}
                >
                  [{log.level}]
                </span>
                <span className="text-gray-300 break-all">{log.msg}</span>
              </div>
            ))}
            {!filteredLogs.length && <p className="text-gray-600">Aucun log pour ce niveau.</p>}
          </div>
        </section>
      )}
    </div>
  )
}
