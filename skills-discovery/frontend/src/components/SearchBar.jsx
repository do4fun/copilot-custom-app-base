import { useEffect, useState } from 'react'
import { getCategories } from '../api'

const PRICING_OPTIONS = ['free', 'freemium', 'paid']

export default function SearchBar({ query, onQueryChange, filters, onFiltersChange }) {
  const [categories, setCategories] = useState([])

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col md:flex-row gap-3">
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Rechercher un skill, un serveur MCP, un outil…"
        className="flex-1 bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      <select
        value={filters.category}
        onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
        className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2"
      >
        <option value="">Toutes catégories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={filters.pricing}
        onChange={(e) => onFiltersChange({ ...filters, pricing: e.target.value })}
        className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2"
      >
        <option value="">Tous prix</option>
        {PRICING_OPTIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={filters.tags}
        onChange={(e) => onFiltersChange({ ...filters, tags: e.target.value })}
        placeholder="tags (a,b,c)"
        className="w-full md:w-40 bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2 placeholder-gray-500"
      />
    </div>
  )
}
