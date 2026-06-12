import { useEffect, useState } from 'react'
import {
  getAdminDbInfo,
  getAdminTable,
  getAdminStatus,
  purgeSessionData,
  restartService,
  setSkillActive,
  syncVectorDb,
} from '../api'

export default function Crud() {
  const [dbInfo, setDbInfo] = useState(null)
  const [status, setStatus] = useState(null)
  const [table, setTable] = useState('skills')
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  const loadMeta = () => {
    getAdminDbInfo().then(setDbInfo).catch(() => {})
    getAdminStatus().then(setStatus).catch(() => {})
  }

  useEffect(loadMeta, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      getAdminTable(table, page, 50, search).then(setData).catch(() => setData(null))
    }, 250)
    return () => clearTimeout(timer)
  }, [table, page, search])

  useEffect(() => {
    setPage(1)
  }, [table, search])

  const reloadTable = () => getAdminTable(table, page, 50, search).then(setData).catch(() => {})

  const flash = (msg) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 3000)
  }

  const handleToggleActive = async (row) => {
    await setSkillActive(row.id, !row.is_active)
    reloadTable()
  }

  const handlePurge = async () => {
    if (!window.confirm('Supprimer tous les skills crawlés (hors Web/Seed) et toutes les sessions ?')) return
    const res = await purgeSessionData()
    flash(`${res.skills_deleted} skills et ${res.sessions_deleted} sessions supprimés`)
    loadMeta()
    reloadTable()
  }

  const handleRestart = async (target) => {
    try {
      await restartService(target)
      flash(`Restart « ${target} » demandé`)
    } catch (err) {
      flash(err.response?.data?.error || err.message)
    }
  }

  const handleSync = async () => {
    const res = await syncVectorDb()
    flash(`${res.synced} skill(s) vectorisé(s)`)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-100">Admin DB</h1>

      {message && (
        <div className="bg-teal-950 border border-teal-800 text-teal-300 rounded-lg px-4 py-2 text-sm">{message}</div>
      )}

      {/* Infos système */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dbInfo && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-sm space-y-1">
            <h2 className="font-semibold text-gray-100 mb-2">Base de données</h2>
            <p className="text-gray-400">
              SQLite <span className="text-gray-200">{dbInfo.sqlite_version}</span> ·{' '}
              <span className="text-gray-200">{(dbInfo.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
            </p>
            <p className="text-gray-500 text-xs break-all">{dbInfo.path}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(dbInfo.tables).map(([t, n]) => (
                <button
                  key={t}
                  onClick={() => setTable(t)}
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    table === t ? 'bg-blue-900 text-blue-300 border-blue-700' : 'bg-gray-700 text-gray-400 border-gray-600'
                  }`}
                >
                  {t} ({n})
                </button>
              ))}
            </div>
          </div>
        )}
        {status && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-sm space-y-1">
            <h2 className="font-semibold text-gray-100 mb-2">API</h2>
            <p className="text-gray-400">
              PID <span className="text-gray-200">{status.pid}</span> · uptime{' '}
              <span className="text-gray-200">{status.uptime_s}s</span> · RAM{' '}
              <span className="text-gray-200">{(status.memory.rss / 1024 / 1024).toFixed(0)} MB</span> ·{' '}
              <span className={status.managed ? 'text-green-400' : 'text-gray-500'}>
                {status.managed ? 'managed' : 'standalone'}
              </span>
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button onClick={() => handleRestart('api')} className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-3 py-1.5 rounded">
                Restart API
              </button>
              <button onClick={() => handleRestart('frontend')} className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-3 py-1.5 rounded">
                Restart Frontend
              </button>
              <button onClick={() => handleRestart('all')} className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-3 py-1.5 rounded">
                Restart All
              </button>
              <button onClick={handleSync} className="bg-teal-800 hover:bg-teal-700 text-teal-100 text-xs px-3 py-1.5 rounded">
                Sync vecteurs
              </button>
              <button onClick={handlePurge} className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1.5 rounded">
                Purge crawl
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Vue table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-gray-100">
            Table <code className="text-blue-300">{table}</code>
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-1.5 text-sm placeholder-gray-500"
          />
          {data && (
            <div className="flex items-center gap-2 ml-auto text-sm text-gray-400">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-2 py-1 rounded bg-gray-700 disabled:opacity-40"
              >
                ←
              </button>
              <span>
                {page} / {totalPages} ({data.total} lignes)
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 rounded bg-gray-700 disabled:opacity-40"
              >
                →
              </button>
            </div>
          )}
        </div>

        {data && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  {data.columns.map((col) => (
                    <th key={col} className="py-2 px-2 font-medium whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                  {table === 'skills' && <th className="py-2 px-2">actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {data.rows.map((row, i) => (
                  <tr key={row.id ?? i} className={table === 'skills' && !row.is_active ? 'opacity-40' : ''}>
                    {data.columns.map((col) => (
                      <td key={col} className="py-1.5 px-2 text-gray-300 max-w-64 truncate" title={String(row[col] ?? '')}>
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                    {table === 'skills' && (
                      <td className="py-1.5 px-2">
                        <button
                          onClick={() => handleToggleActive(row)}
                          className={`text-xs px-2 py-0.5 rounded ${
                            row.is_active ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
                          }`}
                        >
                          {row.is_active ? 'actif' : 'inactif'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.rows.length && <p className="text-sm text-gray-500 py-3">Aucune ligne.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
