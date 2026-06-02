import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import SearchBar from '../components/SearchBar'
import SkillCard from '../components/SkillCard'
import { searchSkills, getAllTags } from '../api'

const COMPARATOR_KEY = 'skillsHub_comparator'

function SkeletonCard() {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-3/4 mb-3" />
      <div className="flex gap-2 mb-3">
        <div className="h-5 bg-gray-700 rounded-full w-24" />
        <div className="h-5 bg-gray-700 rounded-full w-16" />
      </div>
      <div className="h-3 bg-gray-700 rounded w-full mb-2" />
      <div className="h-3 bg-gray-700 rounded w-5/6" />
    </div>
  )
}

export default function Home() {
  const [skills, setSkills] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [availableTags, setAvailableTags] = useState([])
  const [comparatorIds, setComparatorIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COMPARATOR_KEY) || '[]')
    } catch {
      return []
    }
  })
  const navigate = useNavigate()
  const lastSearchRef = useRef({ query: '', filters: {} })

  useEffect(() => {
    getAllTags()
      .then((res) => setAvailableTags(res.data))
      .catch(() => {})
  }, [])

  const handleSearch = useCallback(async (query, filters) => {
    lastSearchRef.current = { query, filters }
    setLoading(true)
    setError(null)
    try {
      const res = await searchSkills(query, filters)
      setSkills(res.data.skills)
      setTotal(res.data.total)
    } catch (err) {
      setError('Failed to load skills. Make sure the backend is running.')
      setSkills([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleFavoriteToggle = (skillId, isFavorited) => {
    setSkills((prev) =>
      prev.map((s) => (s.id === skillId ? { ...s, is_favorite: isFavorited } : s))
    )
  }

  const handleCompareToggle = (skill) => {
    setComparatorIds((prev) => {
      let next
      if (prev.includes(skill.id)) {
        next = prev.filter((id) => id !== skill.id)
      } else if (prev.length >= 3) {
        next = prev // already at max
      } else {
        next = [...prev, skill.id]
      }
      localStorage.setItem(COMPARATOR_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center py-8">
        <h1 className="text-4xl font-bold text-white mb-3">
          Discover AI Skills & Tools
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Search and explore Claude Code skills, MCP servers, AI coding tools, and productivity apps.
        </p>
      </div>

      <SearchBar onSearch={handleSearch} availableTags={availableTags} />

      {/* Comparator banner */}
      {comparatorIds.length > 0 && (
        <div className="bg-indigo-900 border border-indigo-700 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-indigo-200 text-sm">
            {comparatorIds.length} skill{comparatorIds.length !== 1 ? 's' : ''} selected for comparison
          </span>
          <button
            onClick={() => navigate('/comparator')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
          >
            Compare Now
          </button>
        </div>
      )}

      {/* Results header */}
      {!loading && !error && (
        <div className="flex items-center justify-between">
          <p className="text-gray-400 text-sm">
            {total === 0 ? 'No skills found' : `${total} skill${total !== 1 ? 's' : ''} found`}
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-xl p-6 text-center">
          <svg className="w-12 h-12 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Results grid */}
      {!loading && !error && skills.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onFavoriteToggle={handleFavoriteToggle}
              onCompareToggle={handleCompareToggle}
              isInComparator={comparatorIds.includes(skill.id)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && skills.length === 0 && (
        <div className="text-center py-20">
          <svg className="w-16 h-16 text-gray-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 className="text-gray-400 text-lg font-medium mb-2">No skills found</h3>
          <p className="text-gray-600 text-sm max-w-md mx-auto">
            Try adjusting your search query or filters. The database includes Claude Code skills, MCP servers, AI coding tools, and productivity apps.
          </p>
        </div>
      )}
    </div>
  )
}
