const BASE_HEADERS = {
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'skillshub-crawler/2.0',
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN
  return token ? { ...BASE_HEADERS, Authorization: `Bearer ${token}` } : BASE_HEADERS
}

// ─── Minimal YAML frontmatter parser ─────────────────────────────────────────

function parseYaml(yaml) {
  const result = {}
  const lines = yaml.split('\n')
  let key = null
  let collecting = false
  let buf = []

  for (const line of lines) {
    if (collecting) {
      if (/^\s+[-*]\s+/.test(line)) {
        buf.push(line.replace(/^\s+[-*]\s+/, '').trim().replace(/^["']|["']$/g, ''))
        continue
      }
      result[key] = buf
      collecting = false
      buf = []
      key = null
    }

    const m = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/)
    if (!m) continue
    key = m[1]
    const val = m[2].trim()

    if (val === '') {
      collecting = true
      buf = []
    } else if (val.startsWith('[')) {
      result[key] = val.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      key = null
    } else {
      result[key] = val.replace(/^["']|["']$/g, '')
      key = null
    }
  }

  if (collecting && key) result[key] = buf
  return result
}

// ─── Skill markdown parser ────────────────────────────────────────────────────

export function parseSkillMarkdown(content, fallbackName) {
  let name = fallbackName || 'Untitled'
  let description = ''
  let tags = []
  let version = ''
  let features = []
  let body = content

  const fmMatch = content.match(/^---[\r\n]([\s\S]*?)[\r\n]---[\r\n]?/)
  if (fmMatch) {
    body = content.slice(fmMatch[0].length).trimStart()
    try {
      const fm = parseYaml(fmMatch[1])
      if (fm.name)        name        = String(fm.name).trim()
      if (fm.description) description = String(fm.description).trim()
      if (fm.version)     version     = String(fm.version).trim()
      if (Array.isArray(fm.tags))   tags     = fm.tags.map(String)
      if (Array.isArray(fm.agents)) features = fm.agents.map(a => `Agent: ${a}`)
      const tools = fm['allowed-tools']
      if (Array.isArray(tools)) features = [...features, ...tools.map(t => `Tool: ${t}`)]
      // tags as comma string fallback
      if (!tags.length && typeof fm.tags === 'string') {
        tags = fm.tags.split(',').map(s => s.trim()).filter(Boolean)
      }
    } catch {}
  }

  // First H1 as fallback name
  if (!name || name === fallbackName) {
    const h1 = body.match(/^#\s+(.+)/m)
    if (h1) name = h1[1].trim().replace(/[*_`]/g, '')
  }

  // First non-heading text as fallback description
  if (!description) {
    const text = body
      .replace(/```[\s\S]*?```/g, '')
      .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, ' ')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && !l.startsWith('-') && !l.startsWith('|') && l.length > 10)
    description = text.slice(0, 3).join(' ').slice(0, 500)
  }

  if (!tags.length) tags = ['claude-code', 'skill']

  return {
    name:        name.slice(0, 100),
    description: description.slice(0, 500),
    tags,
    version,
    features,
  }
}

// ─── GitHub code search crawler ───────────────────────────────────────────────

export async function crawlGithubSkillFiles(config, {
  onSkill, onLog, onTotal, onFail = () => {}, checkStop,
}) {
  const query = config.url.trim()
  const headers = githubHeaders()

  onLog(`Recherche GitHub code: ${query}`, 'INFO')

  // Build one or two search queries based on the config url
  const queries = /filename:/i.test(query)
    ? [query]
    : [`filename:skill.md ${query}`, `filename:SKILL.md ${query}`]

  const seen  = new Set()
  const items = []

  for (const q of queries) {
    if (checkStop()) break
    const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=100`
    onLog(`> ${searchUrl}`, 'DEBUG')
    try {
      const res = await fetch(searchUrl, {
        headers,
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        const hint = res.status === 401 ? ' — ajoutez GITHUB_TOKEN dans .env'
                   : res.status === 403 ? ' — rate-limit GitHub: attendez ou ajoutez GITHUB_TOKEN'
                   : ''
        onLog(`GitHub API ${res.status}${hint} pour: ${q}`, 'ERROR')
        continue
      }
      const data = await res.json()
      for (const item of (data.items || [])) {
        if (!seen.has(item.html_url)) {
          seen.add(item.html_url)
          items.push(item)
        }
      }
      onLog(`${data.items?.length ?? 0} résultat(s) pour: ${q}`, 'DEBUG')
    } catch (e) {
      onLog(`Erreur search: ${e.message}`, 'ERROR')
    }
  }

  onTotal(items.length)
  onLog(`${items.length} fichier(s) skill unique(s) à traiter`, 'INFO')

  const BATCH = 8
  for (let i = 0; i < items.length; i += BATCH) {
    if (checkStop()) break

    await Promise.allSettled(items.slice(i, i + BATCH).map(async (item) => {
      if (checkStop()) return

      const rawUrl = item.download_url ||
        `https://raw.githubusercontent.com/${item.repository.full_name}/HEAD/${item.path}`
      onLog(`> ${rawUrl}`, 'TRACE')

      try {
        const r = await fetch(rawUrl, {
          headers: { 'User-Agent': 'skillshub-crawler/2.0' },
          signal: AbortSignal.timeout(8000),
        })
        if (!r.ok) { onFail(`${item.path} — HTTP ${r.status}`); return }

        const content = await r.text()
        if (!content.trim()) return

        const fallback = item.name.replace(/\.(md|MD)$/, '')
        const parsed = parseSkillMarkdown(content, fallback)

        onLog(`  [${item.repository.full_name}] ${item.path} → "${parsed.name}"`, 'DEBUG')

        onSkill({
          name:         parsed.name,
          description:  parsed.description,
          source_url:   item.html_url,
          source_name:  `GitHub / ${item.repository.full_name}`,
          category:     config.category || 'Claude Code Skill',
          pricing:      'free',
          version:      parsed.version,
          tags:         parsed.tags,
          features:     parsed.features,
          readme:       content.slice(0, 15000),
        })
      } catch (e) {
        onFail(`${item.path} — ${e.message}`)
      }
    }))
  }
}
