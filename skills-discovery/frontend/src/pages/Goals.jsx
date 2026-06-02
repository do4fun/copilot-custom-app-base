import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SkillCard from '../components/SkillCard'
import { decomposeGoal } from '../api'

const EXAMPLE_GOALS = [
  'I want to build a REST API with JWT authentication',
  'I need to research the best databases for my project',
  'I want to automate my deployment pipeline',
  'I need to build a React dashboard with real-time data',
]

function SkeletonTask() {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 animate-pulse">
      <div className="h-5 bg-gray-700 rounded w-1/3 mb-3" />
      <div className="h-3 bg-gray-700 rounded w-5/6 mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-700 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export default function Goals() {
  const [goal, setGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!goal.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await decomposeGoal(goal.trim())
      setResult(res.data)
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'Failed to decompose goal. Please check that the backend is running.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleExample = (example) => {
    setGoal(example)
    setResult(null)
    setError(null)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Goal Decomposition</h1>
        <p className="text-gray-400">
          Describe your goal and we'll break it down into actionable tasks with recommended skills and tools.
        </p>
      </div>

      {/* Input form */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              What do you want to accomplish?
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
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
                  Analyzing...
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
            {EXAMPLE_GOALS.map((example) => (
              <button
                key={example}
                onClick={() => handleExample(example)}
                className="text-xs text-indigo-400 hover:text-indigo-300 bg-gray-900 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors border border-gray-700 hover:border-indigo-600"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-4">
          <div className="h-4 bg-gray-800 rounded w-2/3 animate-pulse" />
          {[1, 2, 3].map((i) => <SkeletonTask key={i} />)}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-5">
          {/* Summary */}
          {result.summary && (
            <div className="bg-indigo-900/40 border border-indigo-700 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-indigo-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-indigo-200 mb-1">Summary</h2>
                  <p className="text-indigo-100 text-sm">{result.summary}</p>
                </div>
              </div>
            </div>
          )}

          {/* Goal */}
          <h2 className="text-lg font-semibold text-white">
            Tasks for: <span className="text-indigo-300">"{result.goal}"</span>
          </h2>

          {/* Tasks */}
          {result.tasks.map((task, idx) => (
            <div key={idx} className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-indigo-900 border border-indigo-700 rounded-lg flex items-center justify-center flex-shrink-0 text-indigo-300 text-sm font-bold">
                  {idx + 1}
                </div>
                <div>
                  <h3 className="font-semibold text-white">{task.task}</h3>
                  <p className="text-gray-400 text-sm mt-1">{task.description}</p>
                </div>
              </div>

              {task.skills && task.skills.length > 0 ? (
                <div>
                  <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-medium">Recommended Tools</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {task.skills.map((skill) => (
                      <SkillCard key={skill.id} skill={skill} compact />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-600 italic">No specific tools matched for this task.</p>
              )}
            </div>
          ))}

          {result.tasks.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No tasks generated. Please try a more specific goal.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
