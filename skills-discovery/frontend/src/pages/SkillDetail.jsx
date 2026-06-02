import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import TagBadge from '../components/TagBadge'
import { getSkill, toggleFavorite, addNote, deleteNote, getCollections, addToCollection } from '../api'

const COMPARATOR_KEY = 'skillsHub_comparator'

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

export default function SkillDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [skill, setSkill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [noteInput, setNoteInput] = useState('')
  const [noteLoading, setNoteLoading] = useState(false)
  const [collections, setCollections] = useState([])
  const [selectedCollection, setSelectedCollection] = useState('')
  const [addedToCollection, setAddedToCollection] = useState(null)
  const [inComparator, setInComparator] = useState(false)

  useEffect(() => {
    setLoading(true)
    getSkill(id)
      .then((res) => {
        setSkill(res.data)
        // Check comparator
        const stored = JSON.parse(localStorage.getItem(COMPARATOR_KEY) || '[]')
        setInComparator(stored.includes(res.data.id))
      })
      .catch(() => setError('Skill not found'))
      .finally(() => setLoading(false))

    getCollections()
      .then((res) => setCollections(res.data))
      .catch(() => {})
  }, [id])

  const handleFavorite = async () => {
    try {
      const res = await toggleFavorite(skill.id)
      setSkill((s) => ({ ...s, is_favorite: res.data.favorited }))
    } catch {}
  }

  const handleAddNote = async (e) => {
    e.preventDefault()
    if (!noteInput.trim()) return
    setNoteLoading(true)
    try {
      const res = await addNote(skill.id, noteInput.trim())
      setSkill((s) => ({ ...s, notes: [res.data, ...(s.notes || [])] }))
      setNoteInput('')
    } catch {}
    finally { setNoteLoading(false) }
  }

  const handleDeleteNote = async (noteId) => {
    try {
      await deleteNote(skill.id, noteId)
      setSkill((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== noteId) }))
    } catch {}
  }

  const handleAddToCollection = async () => {
    if (!selectedCollection) return
    try {
      await addToCollection(selectedCollection, skill.id)
      const coll = collections.find((c) => c.id === parseInt(selectedCollection))
      setAddedToCollection(coll ? coll.name : 'Collection')
      setTimeout(() => setAddedToCollection(null), 3000)
    } catch {}
  }

  const handleCompareToggle = () => {
    const stored = JSON.parse(localStorage.getItem(COMPARATOR_KEY) || '[]')
    let next
    if (inComparator) {
      next = stored.filter((id) => id !== skill.id)
    } else if (stored.length >= 3) {
      return // at max
    } else {
      next = [...stored, skill.id]
    }
    localStorage.setItem(COMPARATOR_KEY, JSON.stringify(next))
    setInComparator(!inComparator)
  }

  let features = []
  if (skill) {
    try {
      features = JSON.parse(skill.features || '[]')
      if (!Array.isArray(features)) features = []
    } catch { features = [] }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-800 rounded w-1/2" />
        <div className="h-4 bg-gray-800 rounded w-3/4" />
        <div className="h-48 bg-gray-800 rounded-xl" />
      </div>
    )
  }

  if (error || !skill) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 text-lg mb-4">{error || 'Skill not found'}</p>
        <button onClick={() => navigate(-1)} className="text-indigo-400 hover:text-indigo-300">
          Go back
        </button>
      </div>
    )
  }

  const catColor = CATEGORY_COLORS[skill.category] || 'bg-gray-700 text-gray-300'
  const priceColor = PRICING_COLORS[skill.pricing] || 'bg-gray-700 text-gray-300'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to results
      </button>

      {/* Main card */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white mb-2">{skill.name}</h1>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${catColor}`}>
                {skill.category}
              </span>
              <span className={`text-sm px-3 py-1 rounded-full font-medium capitalize ${priceColor}`}>
                {skill.pricing}
              </span>
              {skill.price_details && (
                <span className="text-xs text-gray-400 px-2 py-1 bg-gray-700 rounded-full">
                  {skill.price_details}
                </span>
              )}
            </div>
            {skill.description && (
              <p className="text-gray-300 leading-relaxed">{skill.description}</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={handleFavorite}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                skill.is_favorite
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              <svg className="w-4 h-4" fill={skill.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              {skill.is_favorite ? 'Favorited' : 'Favorite'}
            </button>
            <button
              onClick={handleCompareToggle}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                inComparator
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {inComparator ? 'In Comparator' : 'Compare'}
            </button>
          </div>
        </div>

        {/* Features */}
        {features.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Features</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tags */}
        {skill.tags && skill.tags.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {skill.tags.map((tag) => (
                <TagBadge key={tag.id} tag={tag} />
              ))}
            </div>
          </div>
        )}

        {/* Source URL */}
        {skill.source_url && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Source</h2>
            <a
              href={skill.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {skill.source_name || skill.source_url}
            </a>
          </div>
        )}

        {/* Install instructions */}
        {skill.install_instructions && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Installation</h2>
            <pre className="bg-gray-900 rounded-lg p-3 text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap font-mono">
              {skill.install_instructions}
            </pre>
          </div>
        )}

        {/* Combinations */}
        {skill.combinations && skill.combinations.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Works Great With</h2>
            <div className="space-y-2">
              {skill.combinations.map((combo) => (
                <div key={combo.id} className="bg-gray-900 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-indigo-300">{combo.other_skill_name}</span>
                    {combo.use_case && (
                      <span className="text-xs text-gray-500">— {combo.use_case}</span>
                    )}
                  </div>
                  {combo.description && (
                    <p className="text-xs text-gray-400">{combo.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add to collection */}
      {collections.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Add to Collection</h2>
          {addedToCollection && (
            <div className="mb-3 bg-emerald-900 border border-emerald-700 rounded-lg px-3 py-2 text-emerald-300 text-sm">
              Added to {addedToCollection}!
            </div>
          )}
          <div className="flex gap-2">
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select a collection...</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={handleAddToCollection}
              disabled={!selectedCollection}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Notes section */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Personal Notes</h2>

        <form onSubmit={handleAddNote} className="flex gap-2">
          <input
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Add a note about this skill..."
            className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!noteInput.trim() || noteLoading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {noteLoading ? '...' : 'Add'}
          </button>
        </form>

        {skill.notes && skill.notes.length > 0 ? (
          <div className="space-y-2">
            {skill.notes.map((note) => (
              <div key={note.id} className="flex items-start gap-3 bg-gray-900 rounded-lg p-3">
                <div className="flex-1">
                  <p className="text-sm text-gray-300">{note.content}</p>
                  <p className="text-xs text-gray-600 mt-1">{new Date(note.created_at).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 text-sm text-center py-4">No notes yet. Add your first note above.</p>
        )}
      </div>
    </div>
  )
}
