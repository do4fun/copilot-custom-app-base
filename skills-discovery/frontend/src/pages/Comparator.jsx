import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { compareSkills } from '../api'
import { loadComparatorIds, saveComparatorIds } from './Home'

function Matrix({ title, matrix, skills }) {
  const rows = Object.keys(matrix)
  if (!rows.length) return null
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 overflow-x-auto">
      <h2 className="font-semibold text-gray-100 mb-3">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left text-gray-400 font-medium py-2 pr-4"></th>
            {skills.map((s) => (
              <th key={s.id} className="text-center text-gray-300 font-medium py-2 px-3">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {rows.map((row) => (
            <tr key={row}>
              <td className="py-2 pr-4 text-gray-300">{row}</td>
              {skills.map((s) => (
                <td key={s.id} className="text-center py-2 px-3">
                  {matrix[row][s.id] ? (
                    <span className="text-green-400">✓</span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Comparator() {
  const [ids, setIds] = useState(loadComparatorIds)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (ids.length < 2) {
      setData(null)
      return
    }
    compareSkills(ids)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
  }, [ids])

  const removeSkill = (id) => {
    const next = ids.filter((x) => x !== id)
    saveComparatorIds(next)
    setIds(next)
  }

  if (ids.length < 2) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 space-y-3">
        <h1 className="text-xl font-bold text-gray-100">Comparateur</h1>
        <p className="text-gray-400">
          Sélectionnez 2 à 3 skills avec le bouton <span className="text-teal-300">⇄</span> depuis la{' '}
          <Link to="/" className="text-blue-400 hover:underline">recherche</Link> ou une page de détail.
        </p>
        {ids.length === 1 && <p className="text-sm text-gray-500">1 skill sélectionné — il en faut au moins 2.</p>}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-100">Comparateur ({ids.length}/3)</h1>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-2 text-sm">{error}</div>
      )}

      {data && (
        <>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${data.skills.length}, 1fr)` }}>
            {data.skills.map((s) => (
              <div key={s.id} className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/skills/${s.id}`} className="font-semibold text-gray-100 hover:text-blue-400">
                    {s.name}
                  </Link>
                  <button onClick={() => removeSkill(s.id)} className="text-gray-500 hover:text-red-400">
                    ✕
                  </button>
                </div>
                <p className="text-xs text-gray-400 line-clamp-3">{s.description}</p>
                <div className="text-xs text-gray-500 space-y-1">
                  <div>Catégorie : <span className="text-gray-300">{s.category || '—'}</span></div>
                  <div>Prix : <span className="text-gray-300">{s.pricing}</span></div>
                  <div>Popularité : <span className="text-gray-300">★ {Number(s.popularity_score).toFixed(1)}</span></div>
                </div>
              </div>
            ))}
          </div>

          <Matrix title="Feature matrix" matrix={data.feature_matrix} skills={data.skills} />
          <Matrix title="Tag matrix" matrix={data.tag_matrix} skills={data.skills} />
        </>
      )}
    </div>
  )
}
