import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

/* ─── Skills ─── */
export const listSkills = (page = 1, pageSize = 20) =>
  api.get('/skills', { params: { page, page_size: pageSize } }).then((r) => r.data)

export const getSkill = (id) => api.get(`/skills/${id}`).then((r) => r.data)

export const createSkill = (data) => api.post('/skills', data).then((r) => r.data)

export const updateSkill = (id, data) => api.put(`/skills/${id}`, data).then((r) => r.data)

export const deleteSkill = (id) => api.delete(`/skills/${id}`).then((r) => r.data)

export const toggleFavorite = (id) => api.post(`/skills/${id}/favorite`).then((r) => r.data)

export const setSkillActive = (id, isActive) =>
  api.patch(`/skills/${id}/active`, { is_active: isActive ? 1 : 0 }).then((r) => r.data)

export const addNote = (skillId, content) =>
  api.post(`/skills/${skillId}/notes`, { content }).then((r) => r.data)

export const deleteNote = (skillId, noteId) =>
  api.delete(`/skills/${skillId}/notes/${noteId}`).then((r) => r.data)

export const getCombinations = (skillId) =>
  api.get(`/skills/${skillId}/combinations`).then((r) => r.data)

/* ─── Recherche ─── */
export const searchSkills = (q, filters = {}) =>
  api.get('/search/search', { params: { q, ...filters } }).then((r) => r.data)

export const getCategories = () => api.get('/search/categories').then((r) => r.data)

export const getTags = () => api.get('/search/tags').then((r) => r.data)

/* ─── Collections ─── */
export const getCollections = () => api.get('/collections').then((r) => r.data)

export const getCollection = (id) => api.get(`/collections/${id}`).then((r) => r.data)

export const createCollection = (name, description) =>
  api.post('/collections', { name, description }).then((r) => r.data)

export const updateCollection = (id, data) => api.put(`/collections/${id}`, data).then((r) => r.data)

export const deleteCollection = (id) => api.delete(`/collections/${id}`).then((r) => r.data)

export const addToCollection = (collectionId, skillId) =>
  api.post(`/collections/${collectionId}/skills/${skillId}`).then((r) => r.data)

export const removeFromCollection = (collectionId, skillId) =>
  api.delete(`/collections/${collectionId}/skills/${skillId}`).then((r) => r.data)

export const getFavorites = () => api.get('/collections/favorites/list').then((r) => r.data)

/* ─── Goals ─── */
export const decomposeGoal = (goal, source = 'sqlite') =>
  api.post('/goals/decompose', { goal, source }).then((r) => r.data)

export const getGoalLogs = () => api.get('/goals/logs').then((r) => r.data)

export const clearGoalLogs = () => api.delete('/goals/logs').then((r) => r.data)

/* ─── Comparateur ─── */
export const compareSkills = (ids) => api.post('/comparator', { skill_ids: ids }).then((r) => r.data)

/* ─── Scraper ─── */
export const getConfigs = () => api.get('/scraper/configs').then((r) => r.data)

export const createConfig = (data) => api.post('/scraper/configs', data).then((r) => r.data)

export const updateConfig = (id, data) => api.put(`/scraper/configs/${id}`, data).then((r) => r.data)

export const deleteConfig = (id) => api.delete(`/scraper/configs/${id}`).then((r) => r.data)

export const getSessions = () => api.get('/scraper/sessions').then((r) => r.data)

export const getSession = (id) => api.get(`/scraper/sessions/${id}`).then((r) => r.data)

export const startSession = (configId) =>
  api.post('/scraper/sessions', { config_id: configId }).then((r) => r.data)

export const pauseSession = (id) => api.post(`/scraper/sessions/${id}/pause`).then((r) => r.data)

export const resumeSession = (id) => api.post(`/scraper/sessions/${id}/resume`).then((r) => r.data)

export const stopSession = (id) => api.post(`/scraper/sessions/${id}/stop`).then((r) => r.data)

export const deleteSession = (id) => api.delete(`/scraper/sessions/${id}`).then((r) => r.data)

export const clearAllSessions = () => api.post('/scraper/sessions/clear-all').then((r) => r.data)

/* ─── Recherche sémantique ─── */
export const semanticSearchObjective = (objective, topK = 10) =>
  api.post('/semantic-search/objective', { objective, top_k: topK }).then((r) => r.data)

export const syncVectorDb = () => api.post('/semantic-search/sync').then((r) => r.data)

/* ─── Admin ─── */
export const getAdminDbInfo = () => api.get('/admin/db-info').then((r) => r.data)

export const getAdminTable = (table, page = 1, size = 50, search = '') =>
  api.get(`/admin/tables/${table}`, { params: { page, size, search } }).then((r) => r.data)

export const purgeSessionData = () => api.post('/admin/purge-sessions').then((r) => r.data)

export const getAdminStatus = () => api.get('/admin/status').then((r) => r.data)

export const restartService = (target) => api.post('/admin/restart', { target }).then((r) => r.data)

export default api
