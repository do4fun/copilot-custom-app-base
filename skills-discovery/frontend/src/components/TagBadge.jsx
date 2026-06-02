import React from 'react'

export default function TagBadge({ tag, onClick, selected = false, small = false }) {
  const base = small
    ? 'text-xs px-2 py-0.5 rounded-full font-medium transition-colors cursor-pointer'
    : 'text-xs px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer'

  const colorClass = selected
    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'

  const tagName = typeof tag === 'string' ? tag : tag.name

  return (
    <span
      className={`${base} ${colorClass}`}
      onClick={onClick ? () => onClick(tagName) : undefined}
    >
      {tagName}
    </span>
  )
}
