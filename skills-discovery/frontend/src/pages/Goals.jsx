import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import SkillCard from '../components/SkillCard'
import MarkdownContent from '../components/MarkdownContent'
import { decomposeGoal } from '../api'

// ─── Constants ────────────────────────────────────────────────────────────────

const EXAMPLE_GOALS = [
  'I want to build a REST API with JWT authentication',
  'I need to research the best databases for my project',
  'I want to automate my deployment pipeline',
  'I need to build a React dashboard with real-time data',
]

const COMPLEXITY = {
  trivial:  { label: 'Trivial',  color: 'bg-gray-700 text-gray-300' },
  simple:   { label: 'Simple',   color: 'bg-blue-900 text-blue-300' },
  moderate: { label: 'Modéré',   color: 'bg-amber-900 text-amber-300' },
  complex:  { label: 'Complexe', color: 'bg-red-900 text-red-300' },
}

const TOOL_TYPE = {
  skill:       { label: 'Skill',       color: 'bg-indigo-900 text-indigo-300' },
  agent:       { label: 'Agent',       color: 'bg-emerald-900 text-emerald-300' },
  workflow:    { label: 'Workflow',    color: 'bg-amber-900 text-amber-300' },
  task:        { label: 'Task',        color: 'bg-blue-900 text-blue-300' },
  llm_feature: { label: 'LLM Feature', color: 'bg-violet-900 text-violet-300' },
}

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ label, color, small }) {
  return (
    <span className={`px-2 py-0.5 rounded font-medium flex-shrink-0 ${small ? 'text-xs' : 'text-xs'} ${color}`}>
      {label}
    </span>
  )
}

function SkeletonTree() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          <div className="h-4 bg-gray-700 rounded w-1/3" />
          <div className="space-y-2 pl-4">
            {[1, 2].map(j => (
              <div key={j} className="bg-gray-700 rounded-lg p-3 space-y-2">
                <div className="h-3 bg-gray-600 rounded w-1/4" />
                <div className="h-3 bg-gray-600 rounded w-3/4" />
                <div className="h-3 bg-gray-600 rounded w-2/3" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ToolSection({ tool, goal, stepTitle, onExplain }) {
  const [open, setOpen] = useState(true)
  const typeInfo = TOOL_TYPE[tool.type] || { label: tool.type, color: 'bg-gray-700 text-gray-300' }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      {/* Tool header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/60 transition-colors text-left"
      >
        <span className={`text-gray-500 text-xs transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}>▶</span>
        <Badge label={typeInfo.label} color={typeInfo.color} />
        <span className="text-white text-sm font-medium flex-1 truncate">{tool.name}</span>
        {tool.role && (
          <span className="text-xs text-gray-500 italic flex-shrink-0">{tool.role}</span>
        )}
      </button>

      {open && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-2">
          {/* Skill card if matched in DB */}
          {tool.skill && (
            <div className="mb-3">
              <SkillCard skill={tool.skill} compact />
            </div>
          )}

          {/* Tasks */}
          {(tool.tasks || []).map((task, i) => (
            <div key={i} className="flex items-start gap-3 group">
              <span className="text-gray-600 text-xs mt-1 flex-shrink-0">•</span>
              <span className="text-gray-300 text-sm flex-1">{task}</span>
              <button
                onClick={() => onExplain({ goal, step_title: stepTitle, tool_name: tool.name, tool_role: tool.role, task_label: task })}
                className="flex-shrink-0 text-xs text-gray-600 hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded hover:bg-gray-800"
              >
                Expliquer →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StepSection({ step, goal, onExplain, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      {/* Step header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-750 transition-colors text-left"
      >
        <div className="w-7 h-7 bg-indigo-900 border border-indigo-700 rounded-lg flex items-center justify-center flex-shrink-0 text-indigo-300 text-sm font-bold">
          {step.step}
        </div>
        <span className="text-white font-semibold flex-1">{step.title}</span>
        <span className="text-xs text-gray-500 flex-shrink-0">{(step.tools || []).length} outil(s)</span>
        <span className={`text-gray-400 text-sm transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="border-t border-gray-700 px-5 py-4 space-y-3">
          {(step.tools || []).map((tool, i) => (
            <ToolSection
              key={i}
              tool={tool}
              goal={goal}
              stepTitle={step.title}
              onExplain={onExplain}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ExplainDrawer({ context, onClose }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const abortRef = useRef(null)
  const scrollRef = useRef(null)

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
        if (!res.ok) { setContent('Erreur lors de la génération.'); setLoading(false); return }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        setLoading(false)
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          setContent(prev => prev + decoder.decode(value, { stream: true }))
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      } catch (e) {
        if (e.name !== 'AbortError') { setContent('Erreur de connexion.'); setLoading(false) }
      }
    })()

    return () => ctrl.abort()
  }, [context])

  if (!context) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-gray-900 border-l border-gray-700 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 mb-1">{context.tool_name} · {context.step_title}</p>
            <p className="text-sm font-medium text-white leading-snug">{context.task_label}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors flex-shrink-0 text-lg leading-none mt-0.5">×</button>
        </div>

        {/* Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Génération en cours…
            </div>
          ) : (
            <MarkdownContent content={content} />
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Goals() {
  const [goal,    setGoal]    = useState('')
  const [source,  setSource]  = useState('sqlite')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [result,  setResult]  = useState(null)
  const [drawer,  setDrawer]  = useState(null)   // context object for the explain drawer
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!goal.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    setDrawer(null)
    try {
      const res = await decomposeGoal(goal.trim(), source)
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to decompose goal. Please check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const cx = result ? (COMPLEXITY[result.complexity] || COMPLEXITY.simple) : null

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Goal Decomposition</h1>
        <p className="text-gray-400">Describe your goal and get a step-by-step action plan with recommended tools.</p>
      </div>

      {/* Input form */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Source selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-medium flex-shrink-0">Data source :</span>
            <div className="flex bg-gray-900 border border-gray-700 rounded-lg p-0.5 gap-0.5">
              {[
                { value: 'sqlite',        label: 'SQLite',        desc: 'Top 50 skills par popularité' },
                { value: 'sqlite-vector', label: 'SQLite-vector', desc: 'Top 20 skills par pertinence sémantique' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSource(opt.value)}
                  title={opt.desc}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    source === opt.value ? 'bg-indigo-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-600 italic">
              {source === 'sqlite-vector' ? 'Top 20 par pertinence sémantique' : 'Top 50 par popularité'}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">What do you want to accomplish?</label>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="e.g., I want to build a REST API with authentication and deploy it to AWS..."
              rows={3}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!goal.trim() || loading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Decompose Goal
                </>
              )}
            </button>
          </div>
        </form>

        {/* Example goals */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-500 mb-2">Try an example:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_GOALS.map(ex => (
              <button
                key={ex}
                onClick={() => { setGoal(ex); setResult(null); setError(null) }}
                className="text-xs text-indigo-400 hover:text-indigo-300 bg-gray-900 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors border border-gray-700 hover:border-indigo-600"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Loading */}
      {loading && <SkeletonTree />}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-5">

          {/* Summary bar */}
          <div className="flex items-start gap-3 bg-indigo-900/40 border border-indigo-700 rounded-xl p-4">
            <div className="w-8 h-8 bg-indigo-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-sm font-semibold text-indigo-200">
                  "{result.goal}"
                </h2>
                {cx && <Badge label={cx.label} color={cx.color} />}
                <Badge
                  label={result.source === 'sqlite-vector' ? 'sqlite-vector' : 'sqlite'}
                  color={result.source === 'sqlite-vector' ? 'bg-violet-900/50 text-violet-300 border border-violet-700' : 'bg-gray-900 text-gray-500 border border-gray-700'}
                />
              </div>
              {result.summary && <p className="text-indigo-100 text-sm">{result.summary}</p>}
            </div>
          </div>

          {/* Steps tree */}
          {(result.steps || []).map((step, i) => (
            <StepSection
              key={i}
              step={step}
              goal={result.goal}
              defaultOpen={i === 0}
              onExplain={ctx => setDrawer(ctx)}
            />
          ))}

          {!result.steps?.length && (
            <div className="text-center py-12 text-gray-500">
              Aucune étape générée. Essayez un objectif plus précis.
            </div>
          )}
        </div>
      )}

      {/* Explain drawer */}
      {drawer && (
        <ExplainDrawer context={drawer} onClose={() => setDrawer(null)} />
      )}
    </div>
  )
}
