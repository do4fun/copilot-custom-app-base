import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import MarkdownContent from '../components/MarkdownContent'
import { decomposeGoal } from '../api'

const EXAMPLE_GOALS = [
  'Build a REST API with JWT authentication',
  'Research the best databases for my project',
  'Automate my deployment pipeline',
  'Build a React dashboard with real-time data',
]

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'

// ─── Explain drawer ───────────────────────────────────────────────────────────

function ExplainDrawer({ context, onClose }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const abortRef = useRef(null)
  const bodyRef = useRef(null)

  useEffect(() => {
    if (!context) return
    setContent('')
    setLoading(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/goals/explain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(context),
          signal: ctrl.signal,
        })
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        setLoading(false)
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          setContent(prev => prev + decoder.decode(value, { stream: true }))
          if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
        }
      } catch (e) {
        if (e.name !== 'AbortError') { setContent('Erreur de connexion.'); setLoading(false) }
      }
    })()

    return () => ctrl.abort()
  }, [context])

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-gray-900 border-l border-gray-700 z-50 flex flex-col shadow-2xl">
        <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 truncate">{context.step_title}</p>
            <p className="text-sm font-semibold text-white">{context.tool_name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{context.tool_description}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none flex-shrink-0 mt-0.5">×</button>
        </div>
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-4">
          {loading
            ? <span className="text-gray-500 text-sm flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse inline-block" /> Génération…</span>
            : <MarkdownContent content={content} />
          }
        </div>
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Goals() {
  const navigate = useNavigate()
  const [goal,    setGoal]    = useState('')
  const [source,  setSource]  = useState('sqlite')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [result,  setResult]  = useState(null)
  const [drawer,  setDrawer]  = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!goal.trim() || loading) return
    setLoading(true); setError(null); setResult(null); setDrawer(null)
    try {
      const res = await decomposeGoal(goal.trim(), source)
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec. Vérifiez que l\'API est démarrée.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Goal Decomposition</h1>
        <p className="text-gray-500 text-sm">Décrivez votre objectif — obtenez un plan en étapes claires avec les bons outils.</p>
      </div>

      {/* Form */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">

        {/* Source toggle */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Source :</span>
          <div className="flex bg-gray-900 border border-gray-700 rounded-lg p-0.5 gap-0.5">
            {[
              { value: 'sqlite',        label: 'SQLite' },
              { value: 'sqlite-vector', label: 'SQLite-vector' },
            ].map(opt => (
              <button key={opt.value} type="button" onClick={() => setSource(opt.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${source === opt.value ? 'bg-indigo-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={goal}
          onChange={e => setGoal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e) }}
          placeholder="Ex : je veux construire une API REST avec authentification JWT…"
          rows={3}
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 text-sm resize-none"
        />

        <div className="flex items-center gap-3">
          <button onClick={handleSubmit} disabled={!goal.trim() || loading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            {loading
              ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Analyse…</>
              : 'Décomposer'
            }
          </button>
          <span className="text-xs text-gray-600">ou Cmd+Entrée</span>
        </div>

        {/* Examples */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-700">
          {EXAMPLE_GOALS.map(ex => (
            <button key={ex} onClick={() => { setGoal(ex); setResult(null) }}
              className="text-xs text-gray-500 hover:text-indigo-400 transition-colors">
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 text-red-300 text-sm">{error}</div>}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex gap-4 items-start">
              <div className="w-6 h-6 rounded-full bg-gray-800 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-800 rounded w-1/3" />
                <div className="h-3 bg-gray-800 rounded w-3/4" />
                <div className="h-3 bg-gray-800 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results — flat list */}
      {result && !loading && (
        <div className="space-y-1">

          {/* Summary */}
          {result.summary && (
            <p className="text-gray-400 text-sm pb-4 border-b border-gray-800">{result.summary}</p>
          )}

          {/* Steps */}
          {(result.steps || []).map((step, si) => (
            <div key={si} className={`${si > 0 ? 'pt-5' : 'pt-4'}`}>

              {/* Step label */}
              <div className="flex items-center gap-3 mb-3">
                <span className="w-6 h-6 rounded-full bg-indigo-900 border border-indigo-700 flex items-center justify-center text-indigo-300 text-xs font-bold flex-shrink-0">
                  {step.step}
                </span>
                <span className="text-white font-semibold text-sm">{step.title}</span>
              </div>

              {/* Tools — one per line */}
              <div className="ml-9 space-y-1">
                {(step.tools || []).map((tool, ti) => (
                  <div key={ti}
                    className="flex items-baseline gap-2 group py-1.5 px-3 rounded-lg hover:bg-gray-800 transition-colors cursor-default">
                    <span className="text-gray-600 text-xs flex-shrink-0">•</span>
                    {tool.skill?.id
                      ? <button onClick={() => navigate(`/skill/${tool.skill.id}`)} className="text-indigo-400 hover:text-indigo-300 hover:underline text-sm font-medium flex-shrink-0 text-left">{tool.name}</button>
                      : <span className="text-gray-200 text-sm font-medium flex-shrink-0">{tool.name}</span>
                    }
                    <span className="text-gray-600 text-xs flex-shrink-0">—</span>
                    <span className="text-gray-400 text-sm flex-1 min-w-0">{tool.description}</span>
                    <button
                      onClick={() => setDrawer({ goal: result.goal, step_title: step.title, tool_name: tool.name, tool_description: tool.description })}
                      className="flex-shrink-0 text-xs text-gray-600 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all px-2 py-0.5 rounded hover:bg-gray-700 ml-2">
                      Expliquer →
                    </button>
                  </div>
                ))}
              </div>

              {/* Separator */}
              {si < (result.steps.length - 1) && (
                <div className="ml-9 mt-4 border-b border-gray-800" />
              )}
            </div>
          ))}

          {!result.steps?.length && (
            <p className="text-gray-500 text-sm text-center py-8">Aucune étape générée. Essayez un objectif plus précis.</p>
          )}
        </div>
      )}

      {/* Explain drawer */}
      {drawer && <ExplainDrawer context={drawer} onClose={() => setDrawer(null)} />}
    </div>
  )
}
