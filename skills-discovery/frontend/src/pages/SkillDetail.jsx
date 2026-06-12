import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import TagBadge from '../components/TagBadge'
import MarkdownContent from '../components/MarkdownContent'
import { CATEGORY_COLORS } from '../components/SkillCard'
import { loadComparatorIds, saveComparatorIds } from './Home'
import {
  getSkill,
  toggleFavorite,
  addNote,
  deleteNote,
  getCollections,
  addToCollection,
} from '../api'

export default function SkillDetail() {
  const { id } = useParams()
  const [skill, setSkill] = useState(null)
  const [error, setError] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [collections, setCollections] = useState([])
  const [selectedCollection, setSelectedCollection] = useState('')
  const [addedMsg, setAddedMsg] = useState('')
  const [comparatorIds, setComparatorIds] = useState(loadComparatorIds)

  const load = () =>
    getSkill(id)
      .then(setSkill)
      .catch((err) => setError(err.response?.status === 404 ? 'Skill introuvable' : err.message))

  useEffect(() => {
    load()
    getCollections().then(setCollections).catch(() => {})
  }, [id])

  if (error) return <p className="text-red-400">{error}</p>
  if (!skill) return <p className="text-gray-500">Chargement…</p>

  // install_instructions : texte libre OU JSON web-segment
  let webSegMeta = null
  try {
    const parsed = JSON.parse(skill.install_instructions)
    if (parsed?.type === 'web-segment' && parsed.selector) webSegMeta = parsed
  } catch {
    /* texte libre */
  }

  let features = []
  try {
    const parsed = JSON.parse(skill.features)
    if (Array.isArray(parsed)) features = parsed
  } catch {
    /* pas de features JSON */
  }

  const categoryClass = CATEGORY_COLORS[skill.category] || 'bg-gray-700 text-gray-300'
  const inComparator = comparatorIds.includes(skill.id)

  const handleFavorite = async () => {
    const { is_favorite } = await toggleFavorite(skill.id)
    setSkill((s) => ({ ...s, is_favorite }))
  }

  const handleComparator = () => {
    const next = inComparator
      ? comparatorIds.filter((x) => x !== skill.id)
      : [...comparatorIds, skill.id].slice(0, 3)
    saveComparatorIds(next)
    setComparatorIds(next)
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    await addNote(skill.id, noteText.trim())
    setNoteText('')
    load()
  }

  const handleAddToCollection = async () => {
    if (!selectedCollection) return
    await addToCollection(Number(selectedCollection), skill.id)
    const col = collections.find((c) => c.id === Number(selectedCollection))
    setAddedMsg(`Ajouté à « ${col?.name} »`)
    setTimeout(() => setAddedMsg(''), 2500)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">{skill.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {skill.category && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${categoryClass}`}>{skill.category}</span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{skill.pricing}</span>
              {skill.version && <span className="text-xs text-gray-500">v{skill.version}</span>}
              {skill.popularity_score > 0 && (
                <span className="text-xs text-gray-500">★ {Number(skill.popularity_score).toFixed(1)}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleComparator}
              className={`text-sm px-3 py-1.5 rounded border ${
                inComparator
                  ? 'bg-teal-900 text-teal-300 border-teal-700'
                  : 'text-gray-300 border-gray-600 hover:border-teal-700'
              }`}
            >
              ⇄ Comparer
            </button>
            <button
              onClick={handleFavorite}
              className={`text-2xl leading-none ${skill.is_favorite ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}
            >
              {skill.is_favorite ? '★' : '☆'}
            </button>
          </div>
        </div>

        <p className="text-gray-300">{skill.description}</p>

        {skill.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {skill.tags.map((t) => (
              <TagBadge key={t} tag={t} />
            ))}
          </div>
        )}

        {skill.source_url && (
          <a
            href={skill.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm text-blue-400 hover:underline"
          >
            Source : {skill.source_url}
          </a>
        )}

        {/* Ajout à une collection */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-700">
          <select
            value={selectedCollection}
            onChange={(e) => setSelectedCollection(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm"
          >
            <option value="">Ajouter à une collection…</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddToCollection}
            disabled={!selectedCollection}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-2 rounded disabled:opacity-40"
          >
            Ajouter
          </button>
          {addedMsg && <span className="text-sm text-green-400">{addedMsg}</span>}
          <Link to="/collections" className="text-sm text-gray-500 hover:text-gray-300 ml-auto">
            Gérer les collections →
          </Link>
        </div>
      </div>

      {features.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="font-semibold text-gray-100 mb-3">Fonctionnalités</h2>
          <ul className="list-disc ml-5 text-gray-300 text-sm space-y-1">
            {features.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Panneau web-segment OU instructions standard */}
      {webSegMeta ? (
        <div className="bg-gray-800 rounded-lg border border-teal-800 p-6 space-y-3">
          <h2 className="font-semibold text-teal-300 flex items-center gap-2">
            ✦ Segment web analysé par IA
          </h2>
          <div className="text-sm space-y-2 text-gray-300">
            <div>
              Sélecteur CSS : <code className="bg-gray-700 text-teal-300 px-1.5 py-0.5 rounded">{webSegMeta.selector}</code>
            </div>
            <div className="flex items-center gap-2">
              <span>Confiance :</span>
              <div className="flex-1 max-w-48 bg-gray-700 rounded-full h-2">
                <div
                  className="bg-teal-500 h-2 rounded-full"
                  style={{ width: `${Math.round((webSegMeta.confidence || 0) * 100)}%` }}
                />
              </div>
              <span className="text-teal-300">{Math.round((webSegMeta.confidence || 0) * 100)}%</span>
            </div>
            {webSegMeta.inputs?.length > 0 && (
              <div>
                <span className="text-gray-400">Entrées :</span>
                <ul className="list-disc ml-5">{webSegMeta.inputs.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {webSegMeta.steps?.length > 0 && (
              <div>
                <span className="text-gray-400">Étapes :</span>
                <ol className="list-decimal ml-5">{webSegMeta.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
              </div>
            )}
            {webSegMeta.output && (
              <div>
                <span className="text-gray-400">Résultat :</span> {webSegMeta.output}
              </div>
            )}
            {skill.source_url && (
              <a
                href={`${skill.source_url}${webSegMeta.selector.startsWith('#') ? webSegMeta.selector : ''}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-teal-400 hover:underline"
              >
                Voir la section source →
              </a>
            )}
          </div>
        </div>
      ) : (
        skill.install_instructions && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h2 className="font-semibold text-gray-100 mb-3">Installation</h2>
            <pre className="bg-gray-950 border border-gray-700 rounded-lg p-3 text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap">
              {skill.install_instructions}
            </pre>
          </div>
        )
      )}

      {/* Notes personnelles */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-3">
        <h2 className="font-semibold text-gray-100">Notes personnelles</h2>
        <div className="flex gap-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
            placeholder="Ajouter une note…"
            className="flex-1 bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2 text-sm placeholder-gray-500"
          />
          <button
            onClick={handleAddNote}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded"
          >
            Ajouter
          </button>
        </div>
        {skill.notes?.length ? (
          <ul className="space-y-2">
            {skill.notes.map((note) => (
              <li
                key={note.id}
                className="flex items-start justify-between gap-3 bg-gray-700/50 rounded px-3 py-2 text-sm"
              >
                <div>
                  <p className="text-gray-200">{note.content}</p>
                  <p className="text-xs text-gray-500 mt-1">{note.created_at}</p>
                </div>
                <button
                  onClick={() => deleteNote(skill.id, note.id).then(load)}
                  className="text-gray-500 hover:text-red-400"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Aucune note.</p>
        )}
      </div>

      {skill.readme && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="font-semibold text-gray-100 mb-3">README</h2>
          <MarkdownContent content={skill.readme} />
        </div>
      )}
    </div>
  )
}
