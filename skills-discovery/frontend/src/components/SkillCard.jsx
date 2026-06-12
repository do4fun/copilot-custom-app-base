import { Link } from 'react-router-dom'
import TagBadge from './TagBadge'

export const CATEGORY_COLORS = {
  'Claude Code Skill': 'bg-purple-900 text-purple-300',
  'MCP Server': 'bg-blue-900 text-blue-300',
  'AI Coding Tool': 'bg-green-900 text-green-300',
  'AI Productivity Tool': 'bg-orange-900 text-orange-300',
  Software: 'bg-gray-700 text-gray-300',
}

export default function SkillCard({ skill, onFavoriteToggle, onComparatorToggle, inComparator }) {
  const categoryClass = CATEGORY_COLORS[skill.category] || 'bg-gray-700 text-gray-300'

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-3 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/skills/${skill.id}`}
          className="font-semibold text-gray-100 hover:text-blue-400 break-words"
        >
          {skill.name}
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          {onComparatorToggle && (
            <button
              onClick={() => onComparatorToggle(skill.id)}
              title={inComparator ? 'Retirer du comparateur' : 'Ajouter au comparateur'}
              className={`text-sm px-1.5 py-0.5 rounded border ${
                inComparator
                  ? 'bg-teal-900 text-teal-300 border-teal-700'
                  : 'text-gray-400 border-gray-600 hover:text-teal-300 hover:border-teal-700'
              }`}
            >
              ⇄
            </button>
          )}
          {onFavoriteToggle && (
            <button
              onClick={() => onFavoriteToggle(skill.id)}
              title={skill.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className={`text-lg leading-none ${
                skill.is_favorite ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'
              }`}
            >
              {skill.is_favorite ? '★' : '☆'}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-400 line-clamp-3 flex-1">{skill.description}</p>

      <div className="flex items-center flex-wrap gap-1.5">
        {skill.category && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${categoryClass}`}>{skill.category}</span>
        )}
        {skill.pricing && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{skill.pricing}</span>
        )}
        {skill.popularity_score > 0 && (
          <span className="text-xs text-gray-500 ml-auto">★ {Number(skill.popularity_score).toFixed(1)}</span>
        )}
      </div>

      {skill.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {skill.tags.slice(0, 5).map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>
      )}
    </div>
  )
}
