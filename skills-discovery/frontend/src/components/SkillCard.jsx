import React from 'react'
import { useNavigate } from 'react-router-dom'
import TagBadge from './TagBadge'
import { toggleFavorite } from '../api'

const CATEGORY_COLORS = {
  'Claude Code Skill': 'bg-purple-900 text-purple-300 border border-purple-700',
  'MCP Server': 'bg-blue-900 text-blue-300 border border-blue-700',
  'AI Coding Tool': 'bg-green-900 text-green-300 border border-green-700',
  'AI Productivity Tool': 'bg-orange-900 text-orange-300 border border-orange-700',
}

const PRICING_COLORS = {
  free: 'bg-emerald-900 text-emerald-300',
  freemium: 'bg-yellow-900 text-yellow-300',
  paid: 'bg-red-900 text-red-300',
}

export default function SkillCard({
  skill,
  onFavoriteToggle,
  onCompareToggle,
  isInComparator = false,
  compact = false,
}) {
  const navigate = useNavigate()

  const categoryColor =
    CATEGORY_COLORS[skill.category] || 'bg-gray-700 text-gray-300'
  const pricingColor = PRICING_COLORS[skill.pricing] || 'bg-gray-700 text-gray-300'

  const handleFavorite = async (e) => {
    e.stopPropagation()
    try {
      const res = await toggleFavorite(skill.id)
      if (onFavoriteToggle) onFavoriteToggle(skill.id, res.data.favorited)
    } catch (err) {
      console.error('Failed to toggle favorite', err)
    }
  }

  const handleCompare = (e) => {
    e.stopPropagation()
    if (onCompareToggle) onCompareToggle(skill)
  }

  const displayTags = (skill.tags || []).slice(0, 3)
  const truncatedDesc = skill.description
    ? skill.description.length > (compact ? 80 : 120)
      ? skill.description.slice(0, compact ? 80 : 120) + '…'
      : skill.description
    : ''

  return (
    <div
      className="bg-gray-800 border border-gray-700 rounded-xl p-4 cursor-pointer hover:border-indigo-500 hover:bg-gray-750 transition-all duration-200 flex flex-col gap-3 group"
      onClick={() => navigate(`/skill/${skill.id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors truncate text-sm">
            {skill.name}
          </h3>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor}`}>
              {skill.category}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${pricingColor}`}>
              {skill.pricing}
            </span>
          </div>
        </div>

        {/* Favorite star */}
        <button
          className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${
            skill.is_favorite
              ? 'text-yellow-400 hover:text-yellow-300'
              : 'text-gray-600 hover:text-yellow-400'
          }`}
          onClick={handleFavorite}
          title={skill.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg className="w-4 h-4" fill={skill.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
      </div>

      {/* Description */}
      {!compact && truncatedDesc && (
        <p className="text-gray-400 text-xs leading-relaxed">{truncatedDesc}</p>
      )}

      {/* Tags */}
      {displayTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {displayTags.map((tag) => (
            <TagBadge key={tag.id || tag.name} tag={tag} small />
          ))}
        </div>
      )}

      {/* Compare checkbox */}
      {onCompareToggle && (
        <div
          className="flex items-center gap-2 pt-1 border-t border-gray-700"
          onClick={handleCompare}
        >
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            isInComparator ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600 hover:border-indigo-500'
          }`}>
            {isInComparator && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className="text-xs text-gray-400">{isInComparator ? 'In Comparator' : 'Add to Compare'}</span>
        </div>
      )}
    </div>
  )
}
