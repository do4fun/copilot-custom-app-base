export default function TagBadge({ tag, onClick }) {
  return (
    <span
      onClick={onClick}
      className={`inline-block bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full ${
        onClick ? 'cursor-pointer hover:bg-gray-600' : ''
      }`}
    >
      {tag}
    </span>
  )
}
