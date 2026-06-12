import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SearchBar from '../components/SearchBar'
import SkillCard from '../components/SkillCard'
import { searchSkills, toggleFavorite } from '../api'

const COMPARATOR_KEY = 'skillsHub_comparator'

export function loadComparatorIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(COMPARATOR_KEY) || '[]')
    return Array.isArray(ids) ? ids.slice(0, 3) : []
  } catch {
    return []
  }
}

export function saveComparatorIds(ids) {
  localStorage.setItem(COMPARATOR_KEY, JSON.stringify(ids.slice(0, 3)))
}

export default function Home() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ category: '', pricing: '', tags: '' })
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [comparatorIds, setComparatorIds] = useState(loadComparatorIds)

  useEffect(() => {
    setPage(1)
  }, [query, filters])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      searchSkills(query, { ...filters, page, page_size: 20 })
        .then((data) => {
          if (cancelled) return
          setResults(data.results || [])
          setTotal(data.total || 0)
        })
        .catch((err) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setLoading(false))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, filters, page])

  const handleFavorite = async (id) => {
    const { is_favorite } = await toggleFavorite(id)
    setResults((prev) => prev.map((s) => (s.id === id ? { ...s, is_favorite } : s)))
  }

  const handleComparator = (id) => {
    setComparatorIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 3)
      saveComparatorIds(next)
      return next
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div className="space-y-4">
      <SearchBar query={query} onQueryChange={setQuery} filters={filters} onFiltersChange={setFilters} />

      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>{loading ? 'Recherche…' : `${total} résultat(s)`}</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-2 py-1 rounded bg-gray-800 border border-gray-700 disabled:opacity-40"
            >
              ←
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 rounded bg-gray-800 border border-gray-700 disabled:opacity-40"
            >
              →
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-2 text-sm">
          Erreur : {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {results.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            onFavoriteToggle={handleFavorite}
            onComparatorToggle={handleComparator}
            inComparator={comparatorIds.includes(skill.id)}
          />
        ))}
      </div>

      {!loading && !results.length && (
        <p className="text-center text-gray-500 py-10">Aucun skill trouvé.</p>
      )}

      {comparatorIds.length > 0 && (
        <Link
          to="/comparator"
          className="fixed bottom-5 right-5 bg-teal-700 hover:bg-teal-600 text-white text-sm px-4 py-2 rounded-full shadow-lg"
        >
          ⇄ Comparateur ({comparatorIds.length}/3)
        </Link>
      )}
    </div>
  )
}
