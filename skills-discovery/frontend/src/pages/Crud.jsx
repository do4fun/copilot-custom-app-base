import React, { useState, useEffect, useCallback } from 'react'
import { getAdminDbInfo, getAdminTable } from '../api'

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

export default function Crud() {
  const [dbInfo,   setDbInfo]   = useState(null)
  const [table,    setTable]    = useState(null)
  const [data,     setData]     = useState(null)
  const [page,     setPage]     = useState(1)
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  // Load DB info once
  useEffect(() => {
    getAdminDbInfo()
      .then(r => {
        setDbInfo(r.data)
        if (r.data.tables.length > 0) setTable(r.data.tables[0].name)
      })
      .catch(() => setError('Impossible de contacter le backend.'))
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

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-700 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-indigo-400 font-bold tracking-wide text-sm">SkillsHub</span>
          <span className="text-gray-600 text-sm">/</span>
          <span className="text-gray-300 text-sm font-semibold">Admin DB</span>
        </div>
        {dbInfo && (
          <div className="flex items-center gap-4 text-xs text-gray-500 font-mono flex-wrap">
            <span>SQLite {dbInfo.sqlite_version}</span>
            <span className="text-gray-600">·</span>
            <span>{dbInfo.size_human}</span>
            <span className="text-gray-600">·</span>
            <span className="truncate max-w-xs" title={dbInfo.path}>{dbInfo.path}</span>
          </div>
        )}
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
                      {data.columns.map(col => (
                        <td key={col} className={`px-3 py-1.5 align-top border-r border-gray-800 last:border-r-0 font-mono max-w-xs ${cellClass(row[col])}`}>
                          {truncate(row[col])}
                        </td>
                      ))}
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
