import React, { useState, useEffect, useCallback } from 'react'
import { getCategories } from '../api'
import TagBadge from './TagBadge'

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

const PRICING_OPTIONS = ['free', 'freemium', 'paid']

export default function SearchBar({ onSearch, availableTags = [] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [pricing, setPricing] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [categories, setCategories] = useState([])

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    getCategories()
      .then((res) => setCategories(res.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    onSearch(debouncedQuery, { category, pricing, tags: selectedTags })
  }, [debouncedQuery, category, pricing, selectedTags])

  const toggleTag = useCallback((tagName) => {
    setSelectedTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    )
  }, [])

  const clearAll = () => {
    setQuery('')
    setCategory('')
    setPricing('')
    setSelectedTags([])
  }

  const hasFilters = query || category || pricing || selectedTags.length > 0

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-4">
      {/* Search input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills, tools, MCP servers..."
          className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
        />
        {query && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            onClick={() => setQuery('')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Category */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {/* Pricing */}
        <select
          value={pricing}
          onChange={(e) => setPricing(e.target.value)}
          className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="">All Pricing</option>
          {PRICING_OPTIONS.map((p) => (
            <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-gray-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Tag filter pills */}
      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableTags.slice(0, 20).map((tag) => (
            <TagBadge
              key={tag.id || tag.name}
              tag={tag}
              selected={selectedTags.includes(typeof tag === 'string' ? tag : tag.name)}
              onClick={toggleTag}
              small
            />
          ))}
        </div>
      )}
    </div>
  )
}
