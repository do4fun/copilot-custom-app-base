import React, { useState, useEffect, useCallback } from 'react'
import api from '../api'

// ─── API helpers ──────────────────────────────────────────────────────────────
const getAgents      = ()          => api.get('/agents/agents')
const getDefaults    = ()          => api.get('/agents/agents/defaults')
const startAgent     = (body)      => api.post('/agents/agents/start', body)
const pauseAgent     = (id)        => api.post(`/agents/agents/${id}/pause`)
const resumeAgent    = (id)        => api.post(`/agents/agents/${id}/resume`)
const stopAgent      = (id)        => api.post(`/agents/agents/${id}/stop`)
const deleteAgent    = (id)        => api.delete(`/agents/agents/${id}`)
const getQueue       = (p)         => api.get('/agents/queue', { params: p })
const getQueueStats  = ()          => api.get('/agents/queue/stats')
const addUrl         = (body)      => api.post('/agents/queue/add', body)
const skipUrl        = (id)        => api.post(`/agents/queue/${id}/skip`)
const resetUrl       = (id)        => api.post(`/agents/queue/${id}/reset`)
const clearQueue     = (status)    => api.delete('/agents/queue/clear', { params: { status } })

// ─── Small components ─────────────────────────────────────────────────────────
const STATUS_CLS = {
  running:  'bg-blue-900 text-blue-300 animate-pulse',
  paused:   'bg-yellow-900 text-yellow-300',
  stopping: 'bg-orange-900 text-orange-300',
  stopped:  'bg-gray-700 text-gray-400',
  starting: 'bg-indigo-900 text-indigo-300',
  idle:     'bg-gray-700 text-gray-500',
}
const URL_STATUS_CLS = {
  pending:    'text-gray-400',
  processing: 'text-blue-400 animate-pulse',
  processed:  'text-emerald-400',
  failed:     'text-red-400',
  skipped:    'text-gray-600',
}

function Badge({ label, cls }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>
}

function AgentCard({ agent, onPause, onResume, onStop, onDelete }) {
  const [showLogs, setShowLogs] = useState(false)
  const isActive = ['running', 'paused', 'starting', 'stopping'].includes(agent.status)
  const stats = agent.stats || {}
  const logs  = agent.logs  || []

  const typeLabel = agent.agent_type === 'discoverer' ? '🔍 Discoverer' : '🕷 Scraper'
  const typeDesc  = agent.agent_type === 'discoverer'
    ? 'Recherche de nouvelles URLs (GitHub, Reddit, HN, Dev.to, npm)'
    : 'Analyse des URLs de la queue → extraction de skills'

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-white">{typeLabel}</span>
              <Badge label={agent.status} cls={STATUS_CLS[agent.status] || 'bg-gray-700 text-gray-400'} />
              {agent.status === 'running' && (
                <span className="flex items-center gap-1 text-xs text-blue-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />live
                </span>
              )}
            </div>
            <p className="text-gray-500 text-xs mb-2">{typeDesc}</p>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              {agent.agent_type === 'discoverer' && stats.urls_discovered !== undefined && (
                <span className="text-indigo-400">🔗 {stats.urls_discovered} URLs découvertes</span>
              )}
              {agent.agent_type === 'scraper' && (
                <>
                  {stats.urls_processed !== undefined && <span>📄 {stats.urls_processed} URLs analysées</span>}
                  {stats.skills_added !== undefined && <span className="text-emerald-400">✅ {stats.skills_added} skills ajoutés</span>}
                </>
              )}
              {agent.started_at && (
                <span>Démarré: {new Date(agent.started_at + 'Z').toLocaleTimeString()}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {agent.status === 'running' && (
              <button onClick={() => onPause(agent.id)}
                className="px-3 py-1.5 text-xs bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg transition-colors">
                Pause
              </button>
            )}
            {agent.status === 'paused' && (
              <button onClick={() => onResume(agent.id)}
                className="px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors">
                Reprendre
              </button>
            )}
            {isActive && (
              <button onClick={() => onStop(agent.id)}
                className="px-3 py-1.5 text-xs bg-red-800 hover:bg-red-700 text-white rounded-lg transition-colors">
                Arrêter
              </button>
            )}
            {!isActive && (
              <button onClick={() => onDelete(agent.id)}
                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
                Supprimer
              </button>
            )}
            <button onClick={() => setShowLogs(v => !v)}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
              {showLogs ? 'Masquer' : 'Logs'}
            </button>
          </div>
        </div>
      </div>
      {showLogs && (
        <div className="border-t border-gray-700 bg-gray-900 p-3 max-h-48 overflow-y-auto">
          {logs.length === 0
            ? <p className="text-xs text-gray-600 font-mono">Aucun log.</p>
            : [...logs].reverse().map((l, i) => (
              <div key={i} className="flex gap-2 font-mono text-xs leading-5">
                <span className="text-gray-600 w-16 flex-shrink-0">{(l.t || '').split('T')[1]?.split('.')[0]}</span>
                <span className={
                  l.m?.includes('✅') ? 'text-emerald-400' :
                  l.m?.includes('✗') || l.m?.includes('💥') ? 'text-red-400' :
                  l.m?.includes('🔍') ? 'text-indigo-300' :
                  'text-gray-400'
                }>{l.m}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ─── Launch wizard ────────────────────────────────────────────────────────────
function LaunchWizard({ agentType, defaults, onLaunch, onCancel }) {
  const isDiscoverer = agentType === 'discoverer'

  const [keywords, setKeywords] = useState((defaults?.keywords || []).join('\n'))
  const [sources, setSources]   = useState(defaults?.sources || [])
  const [subreddits, setSub]    = useState('MachineLearning\nartificial\nLocalLLaMA\nClaudeAI\nprogramming')
  const [delay, setDelay]       = useState(isDiscoverer ? 2 : 3)
  const [roundDelay, setRD]     = useState(60)
  const [minConf, setMC]        = useState(0.35)

  const toggleSource = (s) => setSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const ALL_SOURCES = ['github', 'reddit', 'hackernews', 'devto', 'npm']

  const handleSubmit = () => {
    const config = isDiscoverer
      ? {
          keywords: keywords.split('\n').map(s => s.trim()).filter(Boolean),
          sources,
          subreddits: subreddits.split('\n').map(s => s.trim()).filter(Boolean),
          delay_seconds: delay,
          round_delay_seconds: roundDelay,
        }
      : { delay_seconds: delay, min_confidence: minConf, batch_size: 5 }
    onLaunch({ agent_type: agentType, config })
  }

  return (
    <div className="bg-gray-800 border border-indigo-700 rounded-xl p-5 space-y-4">
      <h3 className="text-white font-semibold">
        {isDiscoverer ? '🔍 Configurer le Discoverer' : '🕷 Configurer le Scraper'}
      </h3>

      {isDiscoverer ? (
        <>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Mots-clés de recherche (un par ligne)</label>
            <textarea
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              rows={6}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 text-xs font-mono resize-none focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-2 block">Sources actives</label>
            <div className="flex flex-wrap gap-2">
              {ALL_SOURCES.map(s => (
                <button key={s} onClick={() => toggleSource(s)}
                  className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                    sources.includes(s)
                      ? 'bg-indigo-700 border-indigo-600 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          {sources.includes('reddit') && (
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Subreddits (un par ligne)</label>
              <textarea
                value={subreddits}
                onChange={e => setSub(e.target.value)}
                rows={4}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 text-xs font-mono resize-none focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Délai entre requêtes (s)</label>
              <input type="number" min={1} max={30} value={delay} onChange={e => setDelay(+e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Délai entre cycles (s)</label>
              <input type="number" min={30} max={3600} value={roundDelay} onChange={e => setRD(+e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Délai entre URLs (s)</label>
            <input type="number" min={1} max={30} value={delay} onChange={e => setDelay(+e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Confiance minimale (0–1)</label>
            <input type="number" min={0} max={1} step={0.05} value={minConf} onChange={e => setMC(+e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div className="col-span-2 p-3 bg-indigo-950 border border-indigo-800 rounded-lg text-xs text-indigo-300">
            Le Scraper consomme automatiquement les URLs ajoutées par le Discoverer.
            Avec <code className="bg-indigo-900 px-1 rounded">ANTHROPIC_API_KEY</code> configurée, Claude analyse chaque page.
            Sans clé, un mode heuristique prend le relais.
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={handleSubmit}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg font-medium transition-colors">
          Lancer l'agent
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors">
          Annuler
        </button>
      </div>
    </div>
  )
}

// ─── Queue panel ──────────────────────────────────────────────────────────────
function QueuePanel() {
  const [stats, setStats]     = useState({})
  const [items, setItems]     = useState([])
  const [filter, setFilter]   = useState('pending')
  const [newUrl, setNewUrl]   = useState('')
  const [adding, setAdding]   = useState(false)

  const load = useCallback(async () => {
    try {
      const [st, it] = await Promise.all([
        getQueueStats(),
        getQueue({ status: filter, limit: 30 }),
      ])
      setStats(st.data)
      setItems(it.data.items || [])
    } catch {}
  }, [filter])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  const handleAdd = async () => {
    if (!newUrl.trim()) return
    setAdding(true)
    try {
      await addUrl({ url: newUrl.trim() })
      setNewUrl('')
      await load()
    } catch (e) {
      alert(e?.response?.data?.detail || 'Erreur')
    }
    setAdding(false)
  }

  const STATUS_FILTERS = ['pending', 'processing', 'processed', 'failed', 'skipped']
  const total = Object.values(stats).reduce((a, b) => a + b, 0)

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">Queue d'URLs</h2>
          <span className="text-gray-500 text-xs">{total} total</span>
        </div>

        {/* Stats pills */}
        <div className="flex flex-wrap gap-2 mb-3">
          {STATUS_FILTERS.map(s => (
            <button key={s}
              onClick={() => setFilter(s)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                filter === s ? 'bg-indigo-700 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}>
              {s} {stats[s] !== undefined ? `(${stats[s]})` : ''}
            </button>
          ))}
          <button
            onClick={() => clearQueue(filter).then(load)}
            className="px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors ml-auto">
            Vider «{filter}»
          </button>
        </div>

        {/* Add URL manually */}
        <div className="flex gap-2">
          <input
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="https://... — ajouter une URL manuellement"
            className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 text-xs focus:outline-none focus:border-indigo-500"
          />
          <button onClick={handleAdd} disabled={adding || !newUrl.trim()}
            className="px-3 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors">
            Ajouter
          </button>
        </div>
      </div>

      {/* URL list */}
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-700">
        {items.length === 0 ? (
          <p className="p-4 text-gray-600 text-sm text-center">Aucune URL dans cet état.</p>
        ) : items.map(item => (
          <div key={item.id} className="p-3 flex items-start gap-3 hover:bg-gray-750">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-xs font-medium ${URL_STATUS_CLS[item.status] || 'text-gray-400'}`}>
                  {item.status}
                </span>
                <span className="text-gray-600 text-xs">{item.source}</span>
                {item.skill_id && (
                  <span className="text-emerald-500 text-xs">→ skill #{item.skill_id}</span>
                )}
              </div>
              {item.title && (
                <p className="text-gray-300 text-xs truncate">{item.title}</p>
              )}
              <p className="text-gray-600 text-xs truncate font-mono">{item.url}</p>
              {item.error_msg && (
                <p className="text-red-500 text-xs">{item.error_msg}</p>
              )}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {item.status === 'pending' && (
                <button onClick={() => skipUrl(item.id).then(load)}
                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-400 rounded transition-colors">
                  Skip
                </button>
              )}
              {['failed', 'skipped'].includes(item.status) && (
                <button onClick={() => resetUrl(item.id).then(load)}
                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-400 rounded transition-colors">
                  Reset
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Agents() {
  const [agents, setAgents]     = useState([])
  const [defaults, setDefaults] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [wizard, setWizard]     = useState(null)  // 'discoverer' | 'scraper' | null

  const hasActive = agents.some(a => ['running', 'paused', 'starting'].includes(a.status))

  const load = useCallback(async () => {
    try {
      const [ar, dr] = await Promise.all([getAgents(), getDefaults()])
      setAgents(ar.data)
      setDefaults(dr.data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!hasActive) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [hasActive, load])

  const handleLaunch = async (body) => {
    try {
      await startAgent(body)
      setWizard(null)
      await load()
    } catch (e) {
      alert(e?.response?.data?.detail || 'Échec du lancement')
    }
  }

  const handleAction = async (action, id) => {
    const fn = { pause: pauseAgent, resume: resumeAgent, stop: stopAgent, delete: deleteAgent }[action]
    if (fn) { await fn(id); await load() }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
    </div>
  )

  const discovererActive = agents.some(a => a.agent_type === 'discoverer' && ['running','paused','starting'].includes(a.status))
  const scraperActive    = agents.some(a => a.agent_type === 'scraper'    && ['running','paused','starting'].includes(a.status))

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents — Discovery automatique</h1>
          <p className="text-gray-400 text-sm mt-1">
            Deux agents complémentaires pour découvrir et extraire des skills partout sur le web.
          </p>
        </div>
        {hasActive && (
          <span className="flex items-center gap-1.5 text-xs text-blue-400 flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />
            Polling actif
          </span>
        )}
      </div>

      {/* Architecture diagram */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-wrap items-center justify-center gap-2 text-sm">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xl">🔍</span>
          <span className="text-indigo-300 font-medium">Discoverer</span>
          <span className="text-gray-500 text-xs text-center">GitHub · Reddit<br/>HN · Dev.to · npm</span>
        </div>
        <div className="flex flex-col items-center gap-1 px-4">
          <span className="text-gray-500 text-xl">→</span>
          <div className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-center">
            <span className="text-yellow-300 text-xs font-medium">Queue URLs</span>
            <br /><span className="text-gray-600 text-xs">0 doublons garantis</span>
          </div>
          <span className="text-gray-500 text-xl">→</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xl">🕷</span>
          <span className="text-emerald-300 font-medium">Scraper</span>
          <span className="text-gray-500 text-xs text-center">Analyse · Claude AI<br/>→ Skills DB</span>
        </div>
        <div className="flex flex-col items-center gap-1 px-4">
          <span className="text-gray-500 text-xl">→</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xl">🗄</span>
          <span className="text-purple-300 font-medium">SkillsHub</span>
          <span className="text-gray-500 text-xs text-center">Liste · Recherche<br/>Collections</span>
        </div>
      </div>

      {/* Launch buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { type: 'discoverer', icon: '🔍', label: 'Discoverer', desc: 'Cherche de nouvelles URLs sur GitHub, Reddit, HackerNews, Dev.to et npm.', active: discovererActive, color: 'indigo' },
          { type: 'scraper',    icon: '🕷', label: 'Scraper',    desc: 'Analyse les URLs de la queue et extrait les skills (Claude ou heuristique).', active: scraperActive, color: 'emerald' },
        ].map(({ type, icon, label, desc, active, color }) => (
          <div key={type} className={`bg-gray-800 border rounded-xl p-4 ${active ? 'border-' + color + '-700' : 'border-gray-700'}`}>
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl">{icon}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold">{label}</span>
                  {active && <Badge label="actif" cls={`bg-${color}-900 text-${color}-300`} />}
                </div>
                <p className="text-gray-400 text-xs mt-1">{desc}</p>
              </div>
            </div>
            <button
              onClick={() => setWizard(wizard === type ? null : type)}
              disabled={active}
              className={`w-full py-2 text-sm rounded-lg font-medium transition-colors ${
                active
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : wizard === type
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : `bg-${color === 'indigo' ? 'indigo' : 'emerald'}-700 hover:bg-${color === 'indigo' ? 'indigo' : 'emerald'}-600 text-white`
              }`}
            >
              {active ? 'Déjà actif' : wizard === type ? 'Annuler' : `Configurer & Lancer`}
            </button>
          </div>
        ))}
      </div>

      {/* Launch wizard */}
      {wizard && !['discoverer', 'scraper'].find(t => t === wizard && agents.some(a => a.agent_type === t && ['running','paused','starting'].includes(a.status))) && (
        <LaunchWizard
          agentType={wizard}
          defaults={defaults}
          onLaunch={handleLaunch}
          onCancel={() => setWizard(null)}
        />
      )}

      {/* Running agents */}
      {agents.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white mb-3">Sessions d'agents</h2>
          <div className="space-y-3">
            {agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onPause={id => handleAction('pause', id)}
                onResume={id => handleAction('resume', id)}
                onStop={id => handleAction('stop', id)}
                onDelete={id => handleAction('delete', id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* URL Queue */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3">Queue d'URLs partagée</h2>
        <QueuePanel />
      </section>
    </div>
  )
}
