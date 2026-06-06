import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Skills
export const searchSkills = (query = '', filters = {}) => {
  const params = {}
  if (query) params.q = query
  if (filters.category) params.category = filters.category
  if (filters.pricing) params.pricing = filters.pricing
  if (filters.tags && filters.tags.length > 0) params.tags = filters.tags.join(',')
  if (filters.page) params.page = filters.page
  if (filters.page_size) params.page_size = filters.page_size
  return api.get('/search/search', { params })
}

export const getCategories = () => api.get('/search/categories')
export const getAllTags = () => api.get('/search/tags')

export const listSkills = (page = 1, pageSize = 20) =>
  api.get('/skills', { params: { page, page_size: pageSize } })

export const getSkill = (id) => api.get(`/skills/${id}`)

export const createSkill = (data) => api.post('/skills', data)
export const updateSkill = (id, data) => api.put(`/skills/${id}`, data)
export const deleteSkill = (id) => api.delete(`/skills/${id}`)

export const toggleFavorite = (id) => api.post(`/skills/${id}/favorite`)

export const addNote = (id, content) =>
  api.post(`/skills/${id}/notes`, { content })

export const deleteNote = (id, noteId) =>
  api.delete(`/skills/${id}/notes/${noteId}`)

export const getSkillCombinations = (id) =>
  api.get(`/skills/${id}/combinations`)

// Collections
export const getCollections = () => api.get('/collections')
export const getCollection = (id) => api.get(`/collections/${id}`)

export const createCollection = (data) => api.post('/collections', data)
export const updateCollection = (id, data) => api.put(`/collections/${id}`, data)
export const deleteCollection = (id) => api.delete(`/collections/${id}`)

export const addToCollection = (collectionId, skillId) =>
  api.post(`/collections/${collectionId}/skills/${skillId}`)

export const removeFromCollection = (collectionId, skillId) =>
  api.delete(`/collections/${collectionId}/skills/${skillId}`)

export const getFavorites = () => api.get('/collections/favorites/list')

// Goals
export const decomposeGoal = (goal) =>
  api.post('/goals/decompose', { goal })

// Comparator
export const compareSkills = (ids) =>
  api.post('/comparator', { skill_ids: ids })

// Scraper configs
export const getConfigs = () => api.get('/scraper/configs')
export const createConfig = (data) => api.post('/scraper/configs', data)
export const updateConfig = (id, data) => api.put(`/scraper/configs/${id}`, data)
export const deleteConfig = (id) => api.delete(`/scraper/configs/${id}`)

// Scraper sessions
export const getSessions = () => api.get('/scraper/sessions')
export const getSession = (id) => api.get(`/scraper/sessions/${id}`)
export const startSession = (config_id) => api.post('/scraper/sessions', { config_id })
export const pauseSession = (id) => api.post(`/scraper/sessions/${id}/pause`)
export const resumeSession = (id) => api.post(`/scraper/sessions/${id}/resume`)
export const stopSession = (id) => api.post(`/scraper/sessions/${id}/stop`)
export const deleteSession = (id) => api.delete(`/scraper/sessions/${id}`)
export const clearCompletedSessions = () => api.post('/scraper/sessions/clear-all')

export default api
