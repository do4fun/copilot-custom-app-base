import React, { useState, useEffect, useCallback } from 'react'
import { getAdminDbInfo, getAdminTable, purgeSessionData, setSkillActive, getAdminStatus, restartService } from '../api'
import api from '../api'

const TRUNCATE = 100

function truncate(val) {
  if (val === null || val === undefined) return <span className="text-gray-600 italic">NULL</span>
  const s = typeof val === 'object' ? JSON.stringify(val) : String(val)
  if (s.length > TRUNCATE) return <span title={s}>{s.slice(0, TRUNCATE)}<span className="text-gray-600">…</span></span>
  return s
}

function cellClass(val) {
  if (val === null || val === undefined) return 'text-gray-600'
  if (typeof val === 'number') return 'text-blue-300 text-right font-mono'
  return 'text-gray-200'
}

function ActiveToggle({ skillId, isActive, onToggle }) {
  const [pending, setPending] = useState(false)

  const handleClick = async () => {
    if (pending) return
    setPending(true)
    await onToggle(skillId, isActive)
    setPending(false)
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!isActive}
      onClick={handleClick}
      disabled={pending}
      title={isActive ? 'Actif — cliquer pour désactiver' : 'Inactif — cliquer pour activer'}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
        isActive ? 'bg-indigo-600' : 'bg-gray-600'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
          isActive ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ─── Service control ──────────────────────────────────────────────────────────

function formatUptime(s) {
  if (s < 60)   return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}

function StatusDot({ status }) {
  const cls = {
    running:    'bg-emerald-400',
    restarting: 'bg-amber-400 animate-pulse',
    down:       'bg-red-500 animate-pulse',
    unknown:    'bg-gray-600',
  }[status] || 'bg-gray-600'
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls}`} />
}

function ServiceControl() {
  const [apiStatus,  setApiStatus]  = useState('unknown')   // unknown|running|restarting|down
  const [frontStatus, setFrontStatus] = useState('running') // running|restarting
  const [uptime,    setUptime]      = useState(null)
  const [managed,   setManaged]     = useState(false)
  const [busy,      setBusy]        = useState({ api: false, frontend: false })
  // Poll /admin/status every 5 s to keep uptime fresh
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await getAdminStatus()
        setApiStatus('running')
        setUptime(r.data.uptime_s)
        setManaged(!!r.data.managed)
      } catch {
        setApiStatus(prev => prev === 'restarting' ? prev : 'down')
      }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  const waitForApi = async () => {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000))
      try {
        await api.get('/health')
        return true
      } catch {}
    }
    return false
  }

  const handleRestart = async (target) => {
    const touchesApi   = target !== 'frontend'
    const touchesFront = target !== 'api'

    setBusy(p => ({ api: p.api || touchesApi, frontend: p.frontend || touchesFront }))
    if (touchesApi)   setApiStatus('restarting')
    if (touchesFront) setFrontStatus('restarting')

    try {
      await restartService(target)
    } catch {
      // API may die before sending a response — that's expected
    }

    if (touchesApi) {
      const back = await waitForApi()
      setApiStatus(back ? 'running' : 'down')
      setBusy(p => ({ ...p, api: false }))
      if (touchesFront) setBusy(p => ({ ...p, frontend: false }))
    }
    if (touchesFront && !touchesApi) {
      await new Promise(r => setTimeout(r, 3000))
      setFrontStatus('running')
      setBusy(p => ({ ...p, frontend: false }))
    }
  }

  const btnClass = (disabled) =>
    `px-2.5 py-1 text-xs rounded transition-colors flex-shrink-0 font-medium
     ${disabled
       ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
       : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white cursor-pointer'}`

  return (
    <div className="flex items-center gap-3 border-l border-gray-700 pl-4">
      {/* Status indicators */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <StatusDot status={apiStatus} />
          <span className="hidden sm:inline">API</span>
          {uptime !== null && apiStatus === 'running' &&
            <span className="text-gray-600 font-mono">{formatUptime(uptime)}</span>
          }
          {apiStatus === 'restarting' && <span className="text-amber-400 animate-pulse">…</span>}
        </span>
        <span className="flex items-center gap-1.5">
          <StatusDot status={frontStatus} />
          <span className="hidden sm:inline">Front</span>
          {frontStatus === 'restarting' && <span className="text-amber-400 animate-pulse">…</span>}
        </span>
      </div>

      {/* Restart buttons */}
      <button
        onClick={() => handleRestart('api')}
        disabled={busy.api}
        title={busy.api ? 'Redémarrage en cours…' : 'Redémarrer l\'API'}
        className={btnClass(busy.api)}
      >
        {busy.api ? '⟳ API…' : '↺ API'}
      </button>

      {managed && (
        <button
          onClick={() => handleRestart('frontend')}
          disabled={busy.frontend}
          title={busy.frontend ? 'Redémarrage en cours…' : 'Redémarrer le Frontend'}
          className={btnClass(busy.frontend)}
        >
          {busy.frontend ? '⟳ Front…' : '↺ Front'}
        </button>
      )}

      {managed && (
        <button
          onClick={() => handleRestart('all')}
          disabled={busy.api || busy.frontend}
          title="Redémarrer API + Frontend"
          className={`${btnClass(busy.api || busy.frontend)} ${!(busy.api || busy.frontend) ? 'hover:bg-red-950 hover:text-red-300' : ''}`}
        >
          ↺ Tout
        </button>
      )}
    </div>
  )
}

export default function Crud() {
  const [dbInfo,      setDbInfo]      = useState(null)
  const [table,       setTable]       = useState(null)
  const [data,        setData]        = useState(null)
  const [page,        setPage]        = useState(1)
  const [search,      setSearch]      = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [purgeState,  setPurgeState]  = useState('idle')  // idle | confirm | running | done
  const [purgeResult, setPurgeResult] = useState(null)

  // Load DB info once
  useEffect(() => {
    getAdminDbInfo()
      .then(r => {
        setDbInfo(r.data)
        if (r.data.tables.length > 0) setTable(r.data.tables[0].name)
      })
      .catch(() => setError('Impossible de contacter l'API.'))
  }, [])

  // Load table data when table/page/search changes
  const loadTable = useCallback(() => {
    if (!table) return
    setLoading(true)
    getAdminTable(table, page, 50, search)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [table, page, search])

  useEffect(() => { loadTable() }, [loadTable])

  const handleTableSelect = (name) => {
    setTable(name)
    setPage(1)
    setSearch('')
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    loadTable()
  }

  // Optimistic toggle for skills.is_active
  const handleToggleActive = async (skillId, currentValue) => {
    const newValue = currentValue ? 0 : 1
    setData(prev => ({
      ...prev,
      rows: prev.rows.map(r => r.id === skillId ? { ...r, is_active: newValue } : r),
    }))
    try {
      await setSkillActive(skillId, newValue)
    } catch {
      setData(prev => ({
        ...prev,
        rows: prev.rows.map(r => r.id === skillId ? { ...r, is_active: currentValue } : r),
      }))
    }
  }

  const handlePurge = async () => {
    if (purgeState === 'idle')    { setPurgeState('confirm'); return }
    if (purgeState === 'confirm') {
      setPurgeState('running')
      try {
        const r = await purgeSessionData()
        setPurgeResult(r.data)
        setPurgeState('done')
        // Refresh DB info to update row counts
        getAdminDbInfo().then(r => setDbInfo(r.data)).catch(() => {})
        loadTable()
      } catch {
        setPurgeState('idle')
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-700 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-indigo-400 font-bold tracking-wide text-sm">SkillsHub</span>
          <span className="text-gray-600 text-sm">/</span>
          <span className="text-gray-300 text-sm font-semibold">Admin DB</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap ml-auto">
          {dbInfo && (
            <div className="flex items-center gap-4 text-xs text-gray-500 font-mono">
              <span>SQLite {dbInfo.sqlite_version}</span>
              <span className="text-gray-600">·</span>
              <span>{dbInfo.size_human}</span>
              <span className="text-gray-600">·</span>
              <span className="truncate max-w-xs" title={dbInfo.path}>{dbInfo.path}</span>
            </div>
          )}

          {purgeState === 'done' && purgeResult && (
            <span className="text-xs text-emerald-400 font-mono">
              {purgeResult.sessions_deleted} session(s) · {purgeResult.skills_deleted} skill(s) supprimé(s)
            </span>
          )}

          {purgeState === 'confirm' && (
            <span className="text-xs text-red-400 font-semibold animate-pulse">
              Supprimer toutes les sessions + skills scrapés ?
            </span>
          )}

          <ServiceControl />

          <button
            onClick={handlePurge}
            disabled={purgeState === 'running'}
            onBlur={() => { if (purgeState === 'confirm') setPurgeState('idle') }}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors flex-shrink-0 ${
              purgeState === 'confirm'
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : purgeState === 'running'
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : purgeState === 'done'
                ? 'bg-emerald-800 hover:bg-emerald-700 text-emerald-200'
                : 'bg-gray-700 hover:bg-red-900 text-red-400 hover:text-red-300'
            }`}
          >
            {purgeState === 'confirm'  ? 'Confirmer la suppression'
           : purgeState === 'running'  ? 'Suppression…'
           : purgeState === 'done'     ? 'Purgé'
           : 'Purger sessions & skills'}
          </button>
        </div>
      </header>

      {error && (
        <div className="px-6 py-4 text-red-400 text-sm">{error}</div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar — table list */}
        <aside className="w-52 bg-gray-900 border-r border-gray-700 flex-shrink-0 overflow-y-auto">
          <div className="px-3 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tables</p>
            {dbInfo ? dbInfo.tables.map(t => (
              <button
                key={t.name}
                onClick={() => handleTableSelect(t.name)}
                className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs mb-0.5 transition-colors ${
                  table === t.name
                    ? 'bg-indigo-800 text-indigo-100'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="font-mono truncate">{t.name}</span>
                <span className={`ml-2 flex-shrink-0 text-xs tabular-nums ${table === t.name ? 'text-indigo-300' : 'text-gray-600'}`}>{t.count}</span>
              </button>
            )) : (
              <div className="space-y-1">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-7 bg-gray-800 rounded animate-pulse" />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main — table data */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Toolbar */}
          <div className="bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center gap-3 flex-shrink-0">
            <span className="text-sm font-semibold text-white font-mono">{table}</span>
            {data && <span className="text-xs text-gray-500">{data.total} ligne(s)</span>}

            <form onSubmit={handleSearch} className="flex items-center gap-2 ml-auto">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-48"
              />
              <button type="submit" className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 rounded transition-colors">
                Filtrer
              </button>
              {search && (
                <button type="button" onClick={() => { setSearch(''); setPage(1) }}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-red-400 transition-colors">✕</button>
              )}
            </form>

            {/* Pagination */}
            {data && data.pages > 1 && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded transition-colors">←</button>
                <span className="text-xs text-gray-400 tabular-nums px-1">{page} / {data.pages}</span>
                <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page >= data.pages}
                  className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded transition-colors">→</button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
              </div>
            )}

            {!loading && data && data.rows.length === 0 && (
              <div className="flex items-center justify-center py-20 text-gray-600 text-sm">
                {search ? `Aucun résultat pour « ${search} »` : 'Table vide'}
              </div>
            )}

            {!loading && data && data.rows.length > 0 && (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
                    {data.columns.map(col => (
                      <th key={col} className="px-3 py-2 text-left font-semibold text-gray-400 whitespace-nowrap border-r border-gray-700 last:border-r-0">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i} className={`border-b border-gray-800 hover:bg-gray-800/50 transition-colors ${i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900'}`}>
                      {data.columns.map(col => {
                        const isActiveToggle = table === 'skills' && col === 'is_active'
                        return (
                          <td key={col} className={`px-3 py-1.5 align-middle border-r border-gray-800 last:border-r-0 font-mono max-w-xs ${isActiveToggle ? '' : cellClass(row[col])}`}>
                            {isActiveToggle
                              ? <ActiveToggle skillId={row.id} isActive={row[col]} onToggle={handleToggleActive} />
                              : truncate(row[col])
                            }
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
