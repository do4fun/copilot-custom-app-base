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
  if (value === true) {
    return (
      <svg className="w-5 h-5 text-emerald-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (value === false) {
    return (
      <svg className="w-5 h-5 text-gray-700 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  }
  return <span className="text-gray-400 text-sm">{String(value)}</span>
}

export default function Comparator() {
  const navigate = useNavigate()
  const [ids, setIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COMPARATOR_KEY) || '[]')
    } catch { return [] }
  })
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (ids.length < 2) {
      setComparison(null)
      return
    }
    setLoading(true)
    setError(null)
    compareSkills(ids)
      .then((res) => setComparison(res.data))
      .catch(() => setError('Failed to load comparison data. Make sure the API is running.'))
      .finally(() => setLoading(false))
  }, [ids.join(',')])

  const removeSkill = (id) => {
    const next = ids.filter((x) => x !== id)
    localStorage.setItem(COMPARATOR_KEY, JSON.stringify(next))
    setIds(next)
  }

  const clearAll = () => {
    localStorage.setItem(COMPARATOR_KEY, '[]')
    setIds([])
    setComparison(null)
  }

  if (ids.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <svg className="w-16 h-16 text-gray-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h2 className="text-2xl font-bold text-white mb-3">Comparator</h2>
        <p className="text-gray-400 mb-6 max-w-md mx-auto">
          Select 2-3 skills from the search results or skill detail pages using the "Compare" button or checkbox.
        </p>
        <button
          onClick={() => navigate('/')}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium transition-colors"
        >
          Browse Skills
        </button>
      </div>
    )
  }

  if (ids.length === 1) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <h2 className="text-xl font-bold text-white mb-3">Need One More Skill</h2>
        <p className="text-gray-400 mb-6">You need at least 2 skills to compare.</p>
        <button
          onClick={() => navigate('/')}
          className="text-indigo-400 hover:text-indigo-300 text-sm underline"
        >
          Add more skills from search
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Comparator</h1>
          <p className="text-gray-400 text-sm mt-1">Comparing {ids.length} skill{ids.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            + Add more
          </button>
          <button
            onClick={clearAll}
            className="text-sm text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1.5"
          >
            Clear all
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
          <svg className="w-8 h-8 animate-spin text-indigo-500 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {comparison && !loading && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900">
                  <th className="text-left text-gray-500 font-medium py-4 px-5 text-xs uppercase tracking-wide w-44">
                    Attribute
                  </th>
                  {comparison.skills.map((skill) => (
                    <th key={skill.id} className="py-4 px-5 text-center min-w-48">
                      <div className="flex flex-col items-center gap-2">
                        <span className="font-semibold text-white text-sm">{skill.name}</span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[skill.category] || 'bg-gray-700 text-gray-300'}`}>
                          {skill.category}
                        </span>
                        <button
                          onClick={() => removeSkill(skill.id)}
                          className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                <tr className="hover:bg-gray-900">
                  <td className="px-5 py-3.5 text-sm text-gray-400 font-medium">Pricing</td>
                  {comparison.skills.map((skill) => (
                    <td key={skill.id} className="px-5 py-3.5 text-center">
                      <span className={`text-sm font-semibold capitalize ${PRICING_COLORS[skill.pricing] || 'text-gray-400'}`}>
                        {skill.pricing}
                      </span>
                      {comparison.comparison.price_details[skill.id] && (
                        <p className="text-xs text-gray-600 mt-1">
                          {comparison.comparison.price_details[skill.id]}
                        </p>
                      )}
                    </td>
                  ))}
                </tr>

                <tr className="hover:bg-gray-900">
                  <td className="px-5 py-3.5 text-sm text-gray-400 font-medium">Popularity</td>
                  {comparison.skills.map((skill) => (
                    <td key={skill.id} className="px-5 py-3.5 text-center">
                      {skill.popularity_score > 0 ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-yellow-400 font-medium text-sm">
                            {skill.popularity_score.toFixed(1)}/10
                          </span>
                          <div className="w-24 bg-gray-700 rounded-full h-1.5">
                            <div
                              className="bg-yellow-400 h-1.5 rounded-full"
                              style={{ width: `${(skill.popularity_score / 10) * 100}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-600 text-sm">-</span>
                      )}
                    </td>
                  ))}
                </tr>

                <tr className="hover:bg-gray-900">
                  <td className="px-5 py-3.5 text-sm text-gray-400 font-medium">Source</td>
                  {comparison.skills.map((skill) => (
                    <td key={skill.id} className="px-5 py-3.5 text-center">
                      {comparison.comparison.source_urls[skill.id] ? (
                        <a
                          href={comparison.comparison.source_urls[skill.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 text-xs underline"
                        >
                          Visit
                        </a>
                      ) : (
                        <span className="text-gray-600 text-sm">-</span>
                      )}
                    </td>
                  ))}
                </tr>

                {Object.keys(comparison.tag_matrix || {}).length > 0 && (
                  <>
                    <tr className="bg-gray-900">
                      <td colSpan={comparison.skills.length + 1} className="px-5 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Tags
                      </td>
                    </tr>
                    {Object.entries(comparison.tag_matrix).map(([tag, skillMap]) => (
                      <tr key={tag} className="hover:bg-gray-900">
                        <td className="px-5 py-2.5 text-sm text-gray-400">
                          <span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">{tag}</span>
                        </td>
                        {comparison.skills.map((skill) => (
                          <td key={skill.id} className="px-5 py-2.5 text-center">
                            <CheckIcon value={skillMap[skill.id]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                )}

                {Object.keys(comparison.feature_matrix || {}).length > 0 && (
                  <>
                    <tr className="bg-gray-900">
                      <td colSpan={comparison.skills.length + 1} className="px-5 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Features
                      </td>
                    </tr>
                    {Object.entries(comparison.feature_matrix).map(([feature, skillMap]) => (
                      <tr key={feature} className="hover:bg-gray-900">
                        <td className="px-5 py-2.5 text-sm text-gray-400">{feature}</td>
                        {comparison.skills.map((skill) => (
                          <td key={skill.id} className="px-5 py-2.5 text-center">
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
        </div>
      )}
    </div>
  )
}
