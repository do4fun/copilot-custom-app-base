import React, { useState, useEffect } from 'react'
import SkillCard from '../components/SkillCard'
import {
  getFavorites,
  getCollections,
  createCollection,
  deleteCollection,
  removeFromCollection,
  toggleFavorite,
} from '../api'

export default function Collections() {
  const [favorites, setFavorites] = useState([])
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [newCollName, setNewCollName] = useState('')
  const [newCollDesc, setNewCollDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [expandedCollections, setExpandedCollections] = useState({})

  const loadData = async () => {
    setLoading(true)
    try {
      const [favRes, collRes] = await Promise.all([
        getFavorites(),
        getCollections(),
      ])
      setFavorites(favRes.data)
      setCollections(collRes.data)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateCollection = async (e) => {
    e.preventDefault()
    if (!newCollName.trim()) return
    setCreating(true)
    try {
      const res = await createCollection({ name: newCollName.trim(), description: newCollDesc.trim() })
      setCollections((prev) => [res.data, ...prev])
      setNewCollName('')
      setNewCollDesc('')
      setShowCreateForm(false)
    } catch {}
    finally { setCreating(false) }
  }

  const handleDeleteCollection = async (id) => {
    if (!window.confirm('Delete this collection?')) return
    try {
      await deleteCollection(id)
      setCollections((prev) => prev.filter((c) => c.id !== id))
    } catch {}
  }

  const handleRemoveFromCollection = async (collectionId, skillId) => {
    try {
      await removeFromCollection(collectionId, skillId)
      setCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId
            ? { ...c, skills: c.skills.filter((s) => s.id !== skillId) }
            : c
        )
      )
    } catch {}
  }

  const handleUnfavorite = async (skillId) => {
    try {
      await toggleFavorite(skillId)
      setFavorites((prev) => prev.filter((s) => s.id !== skillId))
    } catch {}
  }

  const toggleExpanded = (id) => {
    setExpandedCollections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-800 rounded w-1/3" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-gray-800 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Favorites Section */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-2xl font-bold text-white">Favorites</h2>
          <span className="bg-yellow-900 text-yellow-300 text-sm px-2.5 py-0.5 rounded-full">
            {favorites.length}
          </span>
        </div>

        {favorites.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-10 text-center">
            <svg className="w-12 h-12 text-gray-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <p className="text-gray-500 text-sm">No favorites yet. Star skills to add them here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {favorites.map((skill) => (
              <div key={skill.id} className="relative">
                <SkillCard
                  skill={{ ...skill, is_favorite: true }}
                  onFavoriteToggle={() => handleUnfavorite(skill.id)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Collections Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white">My Collections</h2>
            <span className="bg-indigo-900 text-indigo-300 text-sm px-2.5 py-0.5 rounded-full">
              {collections.length}
            </span>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Collection
          </button>
        </div>

        {/* Create form */}
        {showCreateForm && (
          <form
            onSubmit={handleCreateCollection}
            className="bg-gray-800 border border-indigo-700 rounded-xl p-4 mb-5 space-y-3"
          >
            <h3 className="text-sm font-semibold text-indigo-300">Create New Collection</h3>
            <input
              type="text"
              value={newCollName}
              onChange={(e) => setNewCollName(e.target.value)}
              placeholder="Collection name (required)"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              value={newCollDesc}
              onChange={(e) => setNewCollDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!newCollName.trim() || creating}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {collections.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-10 text-center">
            <svg className="w-12 h-12 text-gray-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-gray-500 text-sm">No collections yet. Create one to organize your skills.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {collections.map((coll) => (
              <div key={coll.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                {/* Collection header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-750"
                  onClick={() => toggleExpanded(coll.id)}
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${expandedCollections[coll.id] ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div>
                      <h3 className="font-semibold text-white">{coll.name}</h3>
                      {coll.description && (
                        <p className="text-xs text-gray-500">{coll.description}</p>
                      )}
                    </div>
                    <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
                      {coll.skills?.length || 0} skills
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCollection(coll.id) }}
                    className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-gray-700"
                    title="Delete collection"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Skills in collection */}
                {expandedCollections[coll.id] && (
                  <div className="border-t border-gray-700 p-4">
                    {coll.skills && coll.skills.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {coll.skills.map((skill) => (
                          <div key={skill.id} className="relative">
                            <SkillCard skill={skill} compact />
                            <button
                              onClick={() => handleRemoveFromCollection(coll.id, skill.id)}
                              className="absolute top-2 right-2 bg-red-900 hover:bg-red-800 text-red-300 rounded-lg p-1 transition-colors text-xs"
                              title="Remove from collection"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-600 text-sm text-center py-6">
                        This collection is empty. Add skills from the skill detail pages.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
