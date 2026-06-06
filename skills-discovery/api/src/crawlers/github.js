async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'skillshub-crawler/2.0' } })
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
  onLog(`Fetching: ${rawUrl}`)
  const markdown = await fetchText(rawUrl)
  const all = parseAwesomeMarkdown(markdown, category)
  onLog(`${all.length} entrées dans le README — traitement en cours…`)
  onTotal(all.length)
  for (const s of all) {
    if (checkStop()) break
    onSkill(s)
  }
}

export async function crawlGithubSearch(config, { onSkill, onLog, onTotal, onFail = () => {}, checkStop, knownUrls = new Set(), knownNames = new Set() }) {
  const { url, category } = config
  const query = url.startsWith('http') ? new URL(url).searchParams.get('q') || url : url
  onLog(`GitHub search: ${query}`)
  const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=100`
  const data = await fetchJson(apiUrl)
  const repos = data.items || []
  onLog(`GitHub: ${repos.length} dépôts — traitement en cours…`)
  onTotal(repos.length)
  for (const repo of repos) {
    if (checkStop()) break
    onSkill({
      name:             repo.name,
      description:      (repo.description || '').slice(0, 500),
      source_url:       repo.html_url,
      source_name:      'GitHub',
      category:         category || 'AI Coding Tool',
      pricing:          'free',
      popularity_score: parseFloat(Math.min(9.9, repo.stargazers_count / 1000).toFixed(2)),
      tags:             (repo.topics || []).slice(0, 10),
    })
  }
}
