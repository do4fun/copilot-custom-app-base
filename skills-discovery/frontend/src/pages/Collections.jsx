import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SkillCard from '../components/SkillCard'
import {
  getFavorites,
  getCollections,
  getCollection,
  createCollection,
  deleteCollection,
  removeFromCollection,
  toggleFavorite,
} from '../api'

export default function Collections() {
  const [favorites, setFavorites] = useState([])
  const [collections, setCollections] = useState([])
  const [selected, setSelected] = useState(null) // collection détaillée
  const [form, setForm] = useState({ name: '', description: '' })

  const load = () => {
    getFavorites().then(setFavorites).catch(() => {})
    getCollections().then(setCollections).catch(() => {})
  }

  useEffect(load, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    await createCollection(form.name.trim(), form.description.trim() || null)
    setForm({ name: '', description: '' })
    load()
  }

  const openCollection = (id) => getCollection(id).then(setSelected)

  const handleFavorite = async (id) => {
    await toggleFavorite(id)
    load()
  }

  return (
    <div className="space-y-8">
      {/* Favoris */}
      <section className="space-y-3">
        <h1 className="text-xl font-bold text-gray-100">⭐ Favoris</h1>
        {favorites.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {favorites.map((skill) => (
              <SkillCard key={skill.id} skill={skill} onFavoriteToggle={handleFavorite} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            Aucun favori. Marquez des skills depuis la <Link to="/" className="text-blue-400">recherche</Link>.
          </p>
        )}
      </section>

      {/* Collections */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold text-gray-100">Collections</h2>

        <form onSubmit={handleCreate} className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col sm:flex-row gap-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nom de la collection"
            className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm placeholder-gray-500"
          />
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optionnelle)"
            className="flex-1 bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={!form.name.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded disabled:opacity-40"
          >
            Créer
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((col) => (
            <div key={col.id} className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => openCollection(col.id)}
                  className="font-semibold text-gray-100 hover:text-blue-400 text-left"
                >
                  {col.name}
                </button>
                <button
                  onClick={() => deleteCollection(col.id).then(() => { load(); if (selected?.id === col.id) setSelected(null) })}
                  className="text-gray-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
              {col.description && <p className="text-sm text-gray-400">{col.description}</p>}
              <p className="text-xs text-gray-500">{col.skill_count} skill(s)</p>
            </div>
          ))}
        </div>
        {!collections.length && <p className="text-gray-500 text-sm">Aucune collection.</p>}
      </section>

      {/* Détail collection sélectionnée */}
      {selected && (
        <section className="bg-gray-800 rounded-lg border border-gray-700 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">Collection « {selected.name} »</h3>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-300">
              Fermer ✕
            </button>
          </div>
          {selected.skills?.length ? (
            <ul className="divide-y divide-gray-700">
              {selected.skills.map((skill) => (
                <li key={skill.id} className="flex items-center gap-3 py-2">
                  <Link to={`/skills/${skill.id}`} className="text-gray-200 hover:text-blue-400 flex-1">
                    {skill.name}
                  </Link>
                  <span className="text-xs text-gray-500">{skill.category}</span>
                  <button
                    onClick={() =>
                      removeFromCollection(selected.id, skill.id).then(() => openCollection(selected.id)).then(load)
                    }
                    className="text-gray-500 hover:text-red-400 text-sm"
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              Collection vide — ajoutez des skills depuis leur page de détail.
            </p>
          )}
        </section>
      )}
    </div>
  )
}
