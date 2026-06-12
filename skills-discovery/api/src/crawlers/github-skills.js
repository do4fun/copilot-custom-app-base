import { ghFetch, parseRepoUrl } from './github.js'

const GITHUB_API = 'https://api.github.com'
const BATCH_SIZE = 15

/**
 * Parse un fichier SKILL.md / agents.md avec frontmatter YAML.
 * Retourne {skill, reason} — skill = null si rejeté.
 */
export function parseSkillMarkdown(content) {
  const text = String(content || '').replace(/^﻿/, '').trim()
  if (!text.startsWith('---')) return { skill: null, reason: 'pas de frontmatter YAML' }

  const end = text.indexOf('\n---', 3)
  if (end === -1) return { skill: null, reason: 'frontmatter non fermé' }

  const frontmatter = text.slice(3, end)
  const body = text.slice(end + 4).trim()

  // parse YAML simple key: value (suffisant pour les frontmatters de skills)
  const meta = {}
  let currentKey = null
  for (const line of frontmatter.split('\n')) {
    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/)
    if (kv) {
      currentKey = kv[1].toLowerCase()
      meta[currentKey] = kv[2].trim().replace(/^["']|["']$/g, '')
    } else if (currentKey && /^\s+\S/.test(line)) {
      // continuation multi-ligne (folded/literal simplifié)
      meta[currentKey] = `${meta[currentKey]} ${line.trim()}`.trim()
    }
  }

  if (!meta.name) return { skill: null, reason: 'champ name absent' }
  const description = meta.description || ''
  if (description.length < 15) return { skill: null, reason: 'description trop courte (< 15 chars)' }
  if (body.length < 30) return { skill: null, reason: 'body trop court (< 30 chars)' }

  const tags = (meta.tags || meta.keywords || '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)

  return {
    skill: {
      name: meta.name,
      description,
      version: meta.version || null,
      tags,
      readme: text.slice(0, 8000),
      install_instructions: meta.install || null,
    },
    reason: null,
  }
}

async function fetchRaw(owner, repo, path, ref = 'HEAD') {
  const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`, {
    headers: { 'User-Agent': 'SkillsHub-Crawler' },
  })
  if (!res.ok) throw new Error(`raw ${res.status} sur ${owner}/${repo}/${path}`)
  return res.text()
}

async function processBatches(items, ctx, worker) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    if (ctx.checkStop()) return
    await ctx.waitWhilePaused()
    if (ctx.checkStop()) return
    const batch = items.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map((item) => worker(item).catch((err) => ctx.onFail(String(err.message)))))
  }
}

/** Crawl d'un repo entier via Trees API, à la recherche de fichiers {filename}. */
async function crawlRepoTree(config, ctx, filename) {
  const parsed = parseRepoUrl(config.url)
  if (!parsed) throw new Error(`URL de repo GitHub invalide : ${config.url}`)
  const { owner, repo } = parsed

  ctx.onLog(`Trees API sur ${owner}/${repo} (recherche de ${filename})`)
  const res = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`)
  const tree = await res.json()

  const lower = filename.toLowerCase()
  const files = (tree.tree || []).filter(
    (f) => f.type === 'blob' && f.path.toLowerCase().endsWith(lower)
  )

  ctx.onLog(`${files.length} fichier(s) ${filename} trouvé(s)`)
  ctx.onTotal(files.length)

  await processBatches(files, ctx, async (file) => {
    const content = await fetchRaw(owner, repo, file.path)
    const { skill, reason } = parseSkillMarkdown(content)
    if (!skill) {
      ctx.onLog(`Rejeté ${file.path} : ${reason}`, 'DEBUG')
      ctx.onSkip()
      return
    }
    await ctx.onSkill({
      ...skill,
      source_url: `https://github.com/${owner}/${repo}/blob/HEAD/${file.path}`,
    })
  })
}

/** Crawl via GitHub Code Search (filename:{filename} + query). Token requis. */
async function crawlCodeSearch(config, ctx, filename) {
  if (!process.env.GITHUB_TOKEN) {
    ctx.onLog('GITHUB_TOKEN absent — le Code Search GitHub requiert une authentification', 'WARN')
  }
  const query = encodeURIComponent(`filename:${filename} ${config.url}`.trim())
  ctx.onLog(`Code Search : filename:${filename} ${config.url}`)

  const res = await ghFetch(`${GITHUB_API}/search/code?q=${query}&per_page=50`)
  const data = await res.json()
  const items = data.items || []

  ctx.onLog(`${items.length} fichier(s) trouvé(s) (total: ${data.total_count})`)
  ctx.onTotal(items.length)

  await processBatches(items, ctx, async (item) => {
    const owner = item.repository.owner.login
    const repo = item.repository.name
    const content = await fetchRaw(owner, repo, item.path)
    const { skill, reason } = parseSkillMarkdown(content)
    if (!skill) {
      ctx.onLog(`Rejeté ${item.html_url} : ${reason}`, 'DEBUG')
      ctx.onSkip()
      return
    }
    await ctx.onSkill({ ...skill, source_url: item.html_url })
  })
}

export const crawlGithubSkillRepo = (config, ctx) => crawlRepoTree(config, ctx, 'skill.md')
export const crawlGithubSkillFiles = (config, ctx) => crawlCodeSearch(config, ctx, 'skill.md')
export const crawlGithubAgentRepo = (config, ctx) => crawlRepoTree(config, ctx, 'agents.md')
export const crawlGithubAgentFiles = (config, ctx) => crawlCodeSearch(config, ctx, 'agents.md')
