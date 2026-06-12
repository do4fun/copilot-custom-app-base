const GITHUB_API = 'https://api.github.com'
const BATCH_SIZE = 15

export function ghHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SkillsHub-Crawler',
  }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return headers
}

export async function ghFetch(url, accept) {
  const headers = ghHeaders()
  if (accept) headers.Accept = accept
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GitHub ${res.status} sur ${url}`)
  return res
}

/** Extrait owner/repo d'une URL ou d'un slug github. */
export function parseRepoUrl(url) {
  const m = String(url).match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/) || String(url).match(/^([\w.-]+)\/([\w.-]+)$/)
  if (!m) return null
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') }
}

export async function fetchReadme(owner, repo) {
  const res = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`, 'application/vnd.github.raw+json')
  return res.text()
}

function starsToScore(stars) {
  if (!stars) return 0
  return Math.min(9.9, Number((Math.log10(stars + 1) * 2.2).toFixed(1)))
}

function readmeExcerpt(readme) {
  if (!readme) return null
  // première ligne de texte significative hors titres, badges et liens d'images
  const lines = readme.split('\n').map((l) => l.trim())
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('![') || line.startsWith('[!') || line.startsWith('<')) continue
    if (line.length >= 20) return line.slice(0, 400)
  }
  return null
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

/**
 * Awesome list : fetch du README du repo, extraction des liens markdown,
 * puis fetch du README de chaque repo cible (batchs de 15).
 */
export async function crawlGithubAwesome(config, ctx) {
  const parsed = parseRepoUrl(config.url)
  if (!parsed) throw new Error(`URL de repo GitHub invalide : ${config.url}`)

  ctx.onLog(`Lecture de la liste awesome ${parsed.owner}/${parsed.repo}`)
  const readme = await fetchReadme(parsed.owner, parsed.repo)

  // liens markdown [name](url) pointant vers des repos GitHub
  const seen = new Set()
  const links = []
  for (const m of readme.matchAll(/\[([^\]]+)\]\((https:\/\/github\.com\/[^)\s]+)\)/g)) {
    const target = parseRepoUrl(m[2])
    if (!target) continue
    const key = `${target.owner}/${target.repo}`.toLowerCase()
    if (seen.has(key) || key.startsWith(`${parsed.owner.toLowerCase()}/`)) continue
    seen.add(key)
    links.push({ label: m[1].trim(), ...target })
  }

  ctx.onLog(`${links.length} repos référencés trouvés`)
  ctx.onTotal(links.length)

  await processBatches(links, ctx, async (link) => {
    const res = await ghFetch(`${GITHUB_API}/repos/${link.owner}/${link.repo}`)
    const repo = await res.json()
    let readmeText = null
    try {
      readmeText = await fetchReadme(link.owner, link.repo)
    } catch {
      /* repo sans README */
    }
    await ctx.onSkill({
      name: repo.full_name || link.label,
      description: repo.description || readmeExcerpt(readmeText) || link.label,
      source_url: repo.html_url,
      pricing: 'free',
      popularity_score: starsToScore(repo.stargazers_count),
      tags: repo.topics || [],
      readme: readmeText ? readmeText.slice(0, 8000) : null,
    })
  })
}

/**
 * GitHub Search : recherche de repos par topic/keywords (config.url = query),
 * tri par stars, fetch des READMEs en batch.
 */
export async function crawlGithubSearch(config, ctx) {
  const query = encodeURIComponent(config.url)
  ctx.onLog(`Recherche GitHub : ${config.url}`)

  const res = await ghFetch(`${GITHUB_API}/search/repositories?q=${query}&sort=stars&order=desc&per_page=50`)
  const data = await res.json()
  const repos = data.items || []

  ctx.onLog(`${repos.length} repos trouvés (total: ${data.total_count})`)
  ctx.onTotal(repos.length)

  await processBatches(repos, ctx, async (repo) => {
    let readmeText = null
    try {
      readmeText = await fetchReadme(repo.owner.login, repo.name)
    } catch {
      /* repo sans README */
    }
    await ctx.onSkill({
      name: repo.full_name,
      description: repo.description || readmeExcerpt(readmeText) || repo.name,
      source_url: repo.html_url,
      pricing: 'free',
      popularity_score: starsToScore(repo.stargazers_count),
      tags: repo.topics || [],
      version: repo.default_branch,
      readme: readmeText ? readmeText.slice(0, 8000) : null,
    })
  })
}
