import { useEffect, useState } from 'react'
import { getGoalLogs, clearGoalLogs } from '../api'

export default function GoalsLog() {
  const [logs, setLogs] = useState([])
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    const load = () => getGoalLogs().then(setLogs).catch(() => {})
    load()
    const interval = setInterval(load, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">Log de session Goals</h1>
        <button
          onClick={() => clearGoalLogs().then(() => setLogs([]))}
          disabled={!logs.length}
          className="bg-red-600 hover:bg-red-500 text-white text-sm px-3 py-1.5 rounded disabled:opacity-40"
        >
          Vider le log
        </button>
      </div>

      <p className="text-sm text-gray-500">
        Historique en mémoire des décompositions — liste des skills envoyés au LLM. Perdu au redémarrage de l'API.
      </p>

      {!logs.length && <p className="text-gray-500 text-center py-10">Aucune décomposition enregistrée.</p>}

      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="bg-gray-800 rounded-lg border border-gray-700">
            <button
              onClick={() => setExpanded(expanded === log.id ? null : log.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <span className="text-xs text-gray-500 shrink-0">
                {new Date(log.ts).toLocaleTimeString()}
              </span>
              <span className="text-sm text-gray-200 flex-1 truncate">{log.goal}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  log.method === 'claude' ? 'bg-teal-900 text-teal-300' : 'bg-gray-700 text-gray-400'
                }`}
              >
                {log.method}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 shrink-0">
                {log.source}
              </span>
              <span className="text-xs text-gray-500 shrink-0">{log.skills.length} skills</span>
              <span className="text-gray-500">{expanded === log.id ? '▾' : '▸'}</span>
            </button>
            {expanded === log.id && (
              <div className="px-4 pb-4 border-t border-gray-700 pt-3">
                <p className="text-xs text-gray-500 mb-2">Skills proposés au LLM :</p>
                <div className="flex flex-wrap gap-1.5">
                  {log.skills.map((name) => (
                    <span key={name} className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
