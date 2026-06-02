import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { compareSkills } from '../api'

const COMPARATOR_KEY = 'skillsHub_comparator'

const CATEGORY_COLORS = {
  'Claude Code Skill': 'bg-purple-900 text-purple-300',
  'MCP Server': 'bg-blue-900 text-blue-300',
  'AI Coding Tool': 'bg-green-900 text-green-300',
  'AI Productivity Tool': 'bg-orange-900 text-orange-300',
}

const PRICING_COLORS = {
  free: 'text-emerald-400',
  freemium: 'text-yellow-400',
  paid: 'text-red-400',
}

function CheckIcon({ value }) {
  if (value === true) return <span className="text-emerald-400 text-lg">✓</span>
  if (value === false) return <span className="text-gray-700 text-lg">—</span>
  return <span className="text-gray-400 text-sm">{String(value)}</span>
}

export default function Comparator() {
  const navigate = useNavigate()
  const [ids, setIds] = useState(() =>
    JSON.parse(localStorage.getItem(COMPARATOR_KEY) || '[]')
  )
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (ids.length < 2) return
    setLoading(true)
    setError(null)
    compareSkills(ids)
      .then(res => setComparison(res.data))
      .catch(() => setError('Failed to load comparison.'))
      .finally(() => setLoading(false))
  }, [ids.join(',')])

  const removeSkill = (id) => {
    const next = ids.filter(x => x !== id)
    localStorage.setItem(COMPARATOR_KEY, JSON.stringify(next))
    setIds(next)
    if (comparison) {
      setComparison(prev => ({
        ...prev,
        skills: prev.skills.filter(s => s.id !== id),
      }))
    }
  }

  const clearAll = () => {
    localStorage.setItem(COMPARATOR_KEY, '[]')
    setIds([])
    setComparison(null)
  }

  if (ids.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <div className="text-6xl mb-4">⚖️</div>
        <h2 className="text-2xl font-bold text-white mb-3">Comparator</h2>
        <p className="text-gray-400 mb-6">
          Select 2–3 skills from the search page or skill detail pages to compare them side by side.
        </p>
        <button
          onClick={() => navigate('/')}
          className="bg-indigo-700 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg transition-colors"
        >
          Browse Skills
        </button>
      </div>
    )
  }

  if (ids.length === 1) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-gray-400 mb-4">Select at least one more skill to compare.</p>
        <button onClick={() => navigate('/')} className="text-indigo-400 hover:text-indigo-300 underline text-sm">
          Browse more skills
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Comparator</h1>
        <button onClick={clearAll} className="text-gray-500 hover:text-red-400 text-sm transition-colors">
          Clear all
        </button>
      </div>

      {loading && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/3 mx-auto" />
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {comparison && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 font-medium py-3 pr-4 w-40 text-sm">Attribute</th>
                {comparison.skills.map(skill => (
                  <th key={skill.id} className="text-left py-3 px-4 min-w-48">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-white font-semibold text-sm leading-tight">{skill.name}</div>
                        {skill.category && (
                          <span className={`text-xs text-white px-2 py-0.5 rounded-full mt-1 inline-block ${CATEGORY_COLORS[skill.category] || 'bg-gray-600'}`}>
                            {skill.category}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removeSkill(skill.id)}
                        className="text-gray-600 hover:text-red-400 text-xs flex-shrink-0 mt-0.5 transition-colors"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Pricing row */}
              <tr className="border-b border-gray-800">
                <td className="text-gray-500 text-sm py-3 pr-4 font-medium">Pricing</td>
                {comparison.skills.map(skill => (
                  <td key={skill.id} className="py-3 px-4">
                    <span className={`text-sm font-medium capitalize ${PRICING_COLORS[skill.pricing] || 'text-gray-400'}`}>
                      {skill.pricing}
                    </span>
                    {comparison.comparison.price_details[skill.id] && (
                      <p className="text-gray-600 text-xs mt-0.5">{comparison.comparison.price_details[skill.id]}</p>
                    )}
                  </td>
                ))}
              </tr>

              {/* Popularity */}
              <tr className="border-b border-gray-800">
                <td className="text-gray-500 text-sm py-3 pr-4 font-medium">Popularity</td>
                {comparison.skills.map(skill => (
                  <td key={skill.id} className="py-3 px-4">
                    {skill.popularity_score > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-700 rounded-full h-1.5 max-w-24">
                          <div
                            className="bg-yellow-400 h-1.5 rounded-full"
                            style={{ width: `${(skill.popularity_score / 10) * 100}%` }}
                          />
                        </div>
                        <span className="text-yellow-400 text-xs">{skill.popularity_score.toFixed(1)}</span>
                      </div>
                    ) : <span className="text-gray-600 text-sm">—</span>}
                  </td>
                ))}
              </tr>

              {/* Source */}
              <tr className="border-b border-gray-800">
                <td className="text-gray-500 text-sm py-3 pr-4 font-medium">Source</td>
                {comparison.skills.map(skill => (
                  <td key={skill.id} className="py-3 px-4">
                    {comparison.comparison.source_urls[skill.id] ? (
                      <a
                        href={comparison.comparison.source_urls[skill.id]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 text-xs underline"
                      >
                        View ↗
                      </a>
                    ) : <span className="text-gray-600 text-sm">—</span>}
                  </td>
                ))}
              </tr>

              {/* Tags */}
              {Object.keys(comparison.tag_matrix || {}).length > 0 && (
                <>
                  <tr className="border-b border-gray-800 bg-gray-900/50">
                    <td colSpan={comparison.skills.length + 1} className="py-2 px-0">
                      <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Tags</span>
                    </td>
                  </tr>
                  {Object.entries(comparison.tag_matrix).map(([tag, skillMap]) => (
                    <tr key={tag} className="border-b border-gray-800">
                      <td className="text-gray-500 text-xs py-2.5 pr-4">{tag}</td>
                      {comparison.skills.map(skill => (
                        <td key={skill.id} className="py-2.5 px-4">
                          <CheckIcon value={skillMap[skill.id]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}

              {/* Features */}
              {Object.keys(comparison.feature_matrix || {}).length > 0 && (
                <>
                  <tr className="border-b border-gray-800 bg-gray-900/50">
                    <td colSpan={comparison.skills.length + 1} className="py-2 px-0">
                      <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Features</span>
                    </td>
                  </tr>
                  {Object.entries(comparison.feature_matrix).map(([feature, skillMap]) => (
                    <tr key={feature} className="border-b border-gray-800">
                      <td className="text-gray-500 text-xs py-2.5 pr-4">{feature}</td>
                      {comparison.skills.map(skill => (
                        <td key={skill.id} className="py-2.5 px-4">
                          <CheckIcon value={skillMap[skill.id]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="pt-2 flex gap-3">
        <button
          onClick={() => navigate('/')}
          className="text-indigo-400 hover:text-indigo-300 text-sm underline"
        >
          Add more skills from search
        </button>
      </div>
    </div>
  )
}
