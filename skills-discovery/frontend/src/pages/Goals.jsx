import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { decomposeGoal } from '../api'

const ROLE_COLORS = {
  architect: 'bg-purple-900 text-purple-300',
  dev: 'bg-green-900 text-green-300',
  analyst: 'bg-orange-900 text-orange-300',
}

function ExplainDrawer({ goal, tool, stepTitle, onClose }) {
  const [text, setText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const startedRef = useRef(false)

  if (!startedRef.current) {
    startedRef.current = true
    setStreaming(true)
    fetch('/api/goals/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal,
        tool_name: tool.name,
        tool_description: tool.description,
        step_title: stepTitle,
      }),
    })
      .then(async (res) => {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          setText((prev) => prev + decoder.decode(value, { stream: true }))
        }
      })
      .catch((err) => setText((prev) => prev + `\n[Erreur : ${err.message}]`))
      .finally(() => setStreaming(false))
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative w-full max-w-md bg-gray-800 border-l border-gray-700 h-full overflow-y-auto p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-100">{tool.name}</h3>
            <p className="text-xs text-gray-500">Étape : {stepTitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-xl leading-none">
            ✕
          </button>
        </div>
        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
          {text || (streaming ? 'Génération de l’explication…' : '')}
          {streaming && <span className="animate-pulse text-blue-400"> ▌</span>}
        </p>
      </aside>
    </div>
  )
}

export default function Goals() {
  const [goal, setGoal] = useState('')
  const [source, setSource] = useState('sqlite')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [explain, setExplain] = useState(null) // {tool, stepTitle}

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!goal.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await decomposeGoal(goal.trim(), source))
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">Décomposition de but</h1>
        <Link to="/goals/log" className="text-sm text-gray-400 hover:text-gray-200">
          Log de session →
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg border border-gray-700 p-5 space-y-3">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          placeholder="Décrivez votre objectif en langage naturel… (ex. : créer une API de gestion de tâches avec authentification)"
          className="w-full bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 text-sm text-gray-300">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={source === 'sqlite'}
                onChange={() => setSource('sqlite')}
              />
              Recherche FTS5 (SQLite)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={source === 'sqlite-vector'}
                onChange={() => setSource('sqlite-vector')}
              />
              Recherche vectorielle (sémantique)
            </label>
          </div>
          <button
            type="submit"
            disabled={loading || !goal.trim()}
            className="ml-auto bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded disabled:opacity-40"
          >
            {loading ? 'Analyse en cours…' : 'Décomposer'}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`px-2 py-0.5 rounded-full ${
                  result.method === 'claude' ? 'bg-teal-900 text-teal-300' : 'bg-gray-700 text-gray-400'
                }`}
              >
                {result.method === 'claude' ? 'Claude' : 'Fallback rule-based'}
              </span>
              <span className="text-gray-500">{result.runtime_ms} ms</span>
            </div>
            <p className="text-gray-200">{result.summary}</p>
            {result.architecture && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-1">Architecture</h3>
                <p className="text-sm text-gray-300">{result.architecture}</p>
              </div>
            )}
            {result.tech_stack?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.tech_stack.map((t) => (
                  <span key={t} className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {result.analyst_notes && (
              <p className="text-sm text-gray-400 italic border-l-2 border-gray-600 pl-3">
                {result.analyst_notes}
              </p>
            )}
          </div>

          {result.steps?.map((step) => (
            <div key={step.step} className="bg-gray-800 rounded-lg border border-gray-700 p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-blue-600 text-white text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center shrink-0">
                  {step.step}
                </span>
                <h3 className="font-semibold text-gray-100 flex-1">{step.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[step.role] || 'bg-gray-700 text-gray-300'}`}>
                  {step.role}
                </span>
              </div>
              <ul className="space-y-2">
                {(step.tools || []).map((tool, i) => (
                  <li key={i} className="bg-gray-700/50 rounded px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-100 text-sm">{tool.name}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          tool.type === 'user' ? 'bg-orange-900 text-orange-300' : 'bg-green-900 text-green-300'
                        }`}
                      >
                        {tool.type === 'user' ? 'runtime' : 'dev'}
                      </span>
                      {tool.in_db && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900 text-blue-300">en base</span>
                      )}
                      <button
                        onClick={() => setExplain({ tool, stepTitle: step.title })}
                        className="ml-auto text-xs text-teal-400 hover:text-teal-300"
                      >
                        Expliquer →
                      </button>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{tool.description}</p>
                    {tool.install_hint && (
                      <code className="block text-xs text-teal-300 bg-gray-950 rounded px-2 py-1 mt-1.5 overflow-x-auto">
                        {tool.install_hint}
                      </code>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {result.runtime_tools?.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
              <h3 className="font-semibold text-gray-100 mb-3">Outils runtime (production)</h3>
              <ul className="grid sm:grid-cols-2 gap-2">
                {result.runtime_tools.map((t, i) => (
                  <li key={i} className="bg-gray-700/50 rounded px-3 py-2 text-sm">
                    <span className="font-medium text-gray-100">{t.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{t.category}</span>
                    <p className="text-gray-400 text-xs mt-0.5">{t.purpose}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {explain && (
        <ExplainDrawer
          goal={goal}
          tool={explain.tool}
          stepTitle={explain.stepTitle}
          onClose={() => setExplain(null)}
        />
      )}
    </div>
  )
}
