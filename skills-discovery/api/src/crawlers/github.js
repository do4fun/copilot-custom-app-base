const FETCH_OPTS = { headers: { 'User-Agent': 'skillshub-crawler/2.0' } }

async function fetchText(url) {
  const res = await fetch(url, FETCH_OPTS)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return res.text()
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'skillshub-crawler/2.0' },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status} — ${url}`)
  return res.json()
}

// Try skill.md first (Claude Code skill format), then README.md.
// Returns { type, content } or null. Works for any github.com URL.
async function fetchReadme(githubUrl) {
  const m = (githubUrl || '').match(/github\.com\/([^/]+)\/([^/\s?#]+)/)
  if (!m) return null
  const base = `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main`
  // skill.md: full content (no limit — it's the skill definition itself)
  // README.md: cap at 20 000 chars (READMEs can be multi-MB)
  for (const [file, maxLen] of [['skill.md', Infinity], ['README.md', 20000]]) {
    try {
      const res = await fetch(`${base}/${file}`, {
        ...FETCH_OPTS,
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const text = await res.text()
        return { type: file, content: maxLen === Infinity ? text : text.slice(0, maxLen) }
      }
    } catch {}
  }
  return null
}

// Fetch readmes for a batch of items in parallel, return array matching input order
async function batchFetchReadmes(items, urlKey, onLog, batchSize = 15) {
  const results = new Array(items.length).fill(null)
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize)
    const fetched = await Promise.allSettled(slice.map(async (item) => {
      const srcUrl = item[urlKey]
      onLog(`> ${srcUrl}`, 'TRACE')
      return fetchReadme(srcUrl)
    }))
    fetched.forEach((r, j) => {
      if (r.status === 'fulfilled' && r.value) {
        results[i + j] = r.value
        onLog(`  [${r.value.type}] ${slice[j][urlKey]}`, 'DEBUG')
      }
    })
  }
  return results
}

function parseAwesomeMarkdown(markdown, category) {
  const results = []
  const re = /^[-*]\s+\[([^\]]{1,100})\]\((https?:\/\/[^)]+)\)(?:\s*[-—–:]\s*(.+))?/gm
  let m
  while ((m = re.exec(markdown)) !== null) {
    const url = m[2].trim()
    if (/\.(png|jpg|gif|svg|ico)(\?|$)/i.test(url)) continue
    results.push({
      name:        m[1].trim(),
      description: (m[3] || '').replace(/\s+/g, ' ').trim().slice(0, 500),
      source_url:  url,
      source_name: 'GitHub',
      category:    category || 'MCP Server',
      pricing:     'free',
      tags:        ['mcp', 'open-source'],
    })
  }
  return results
}

export async function crawlGithubAwesome(config, { onSkill, onLog, onTotal, onFail = () => {}, checkStop, knownUrls = new Set(), knownNames = new Set() }) {
  const { url, category } = config
  let rawUrl = url
  const m = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/)
  if (m) rawUrl = `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main/README.md`
  onLog(`Fetching: ${rawUrl}`, 'DEBUG')
  const markdown = await fetchText(rawUrl)
  const all = parseAwesomeMarkdown(markdown, category)
  onLog(`${all.length} entrées dans le README — récupération des détails…`, 'INFO')
  onTotal(all.length)

  const readmes = await batchFetchReadmes(all, 'source_url', onLog)
  let skillMdCount = readmes.filter(r => r?.type === 'skill.md').length
  if (skillMdCount) onLog(`${skillMdCount} fichier(s) skill.md trouvés`, 'INFO')

  for (let i = 0; i < all.length; i++) {
    if (checkStop()) break
    onSkill({ ...all[i], readme: readmes[i]?.content || '' })
  }
}

export async function crawlGithubSearch(config, { onSkill, onLog, onTotal, onFail = () => {}, checkStop, knownUrls = new Set(), knownNames = new Set() }) {
  const { url, category } = config
  const query = url.startsWith('http') ? new URL(url).searchParams.get('q') || url : url
  onLog(`GitHub search: ${query}`, 'INFO')
  const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=100`
  onLog(`> ${apiUrl}`, 'DEBUG')
  const data = await fetchJson(apiUrl)
  const repos = data.items || []
  onLog(`${repos.length} dépôts — récupération des détails…`, 'INFO')
  onTotal(repos.length)

  // Map repos to objects with source_url for the generic readme fetcher
  const repoItems = repos.map(r => ({ source_url: r.html_url, _repo: r }))
  const readmes = await batchFetchReadmes(repoItems, 'source_url', onLog)
  let skillMdCount = readmes.filter(r => r?.type === 'skill.md').length
  if (skillMdCount) onLog(`${skillMdCount} fichier(s) skill.md trouvés`)

  for (let i = 0; i < repos.length; i++) {
    if (checkStop()) break
    const repo = repos[i]
    onSkill({
      name:             repo.name,
      description:      (repo.description || '').slice(0, 500),
      source_url:       repo.html_url,
      source_name:      'GitHub',
      category:         category || 'AI Coding Tool',
      pricing:          'free',
      popularity_score: parseFloat(Math.min(9.9, repo.stargazers_count / 1000).toFixed(2)),
      tags:             (repo.topics || []).slice(0, 10),
      readme:           readmes[i]?.content || '',
    })
  }
}
