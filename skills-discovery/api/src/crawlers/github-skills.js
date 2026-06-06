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
      result[key] = val.replace(/^\[|\]$/g, '').split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      key = null
    } else {
      result[key] = val.replace(/^["']|["']$/g, '')
      key = null
    }
  }

  if (collecting && key) result[key] = buf
  return result
}

// ─── Skill validation & parsing ───────────────────────────────────────────────
//
// Reference: https://github.com/anthropics/skills
//
// A Claude Code skill is a SKILL.md / skill.md with YAML frontmatter containing:
//   name        — identifier (kebab-case)
//   description — PRIMARY trigger mechanism: what the skill does + when to use it
// The markdown body contains instructions for Claude on how to execute the skill.
//
// A file is only a valid skill if BOTH name AND description are in the frontmatter
// AND the body has substantive instructions. Files that are regular READMEs or
// docs that happen to be named skill.md are rejected here.

function isValidSkill(fm, body) {
  const name = fm.name ? String(fm.name).trim() : ''
  const desc = fm.description ? String(fm.description).trim() : ''
  // name must exist, description must exist and be meaningful, body must have instructions
  return name.length >= 2 && desc.length >= 15 && body.trim().length >= 30
}

// Returns null if the file is not a valid Claude Code skill.
export function parseSkillMarkdown(content) {
  // Must have YAML frontmatter — no frontmatter means it's not a skill
  const fmMatch = content.match(/^---[\r\n]([\s\S]*?)[\r\n]---[\r\n]?/)
  if (!fmMatch) return null

  const body = content.slice(fmMatch[0].length).trimStart()

  let fm = {}
  try { fm = parseYaml(fmMatch[1]) } catch { return null }

  if (!isValidSkill(fm, body)) return null

  const name        = String(fm.name).trim()
  const description = String(fm.description).trim()
  const version     = fm.version ? String(fm.version).trim() : ''

  // Tags: use frontmatter tags if present; otherwise derive from the skill name.
  // Anthropic's official format has no tags field — we infer them from name parts.
  let tags = []
  if (Array.isArray(fm.tags)) {
    tags = fm.tags.map(String).filter(Boolean)
  } else if (typeof fm.tags === 'string' && fm.tags.trim()) {
    tags = fm.tags.split(',').map(s => s.trim()).filter(Boolean)
  }
  if (!tags.length) {
    // "code-review-expert" → ["code", "review", "expert"]
    tags = name.split(/[-_\s]+/).filter(t => t.length > 2)
  }
  if (!tags.includes('claude-code')) tags.unshift('claude-code')

  // Features: community format uses agents/allowed-tools;
  // Anthropic format uses compatibility (optional tools/dependencies).
  const features = []
  if (Array.isArray(fm.agents))             features.push(...fm.agents.map(a => `Agent: ${a}`))
  if (Array.isArray(fm['allowed-tools']))   features.push(...fm['allowed-tools'].map(t => `Tool: ${t}`))
  if (fm.compatibility && typeof fm.compatibility === 'string')
    features.push(`Requires: ${fm.compatibility}`)

  return {
    name:        name.slice(0, 100),
    // description is the trigger context — preserve up to 800 chars (richer than a typical readme)
    description: description.slice(0, 800),
    tags,
    version,
    features,
  }
}

// ─── GitHub code search crawler ───────────────────────────────────────────────

export async function crawlGithubSkillFiles(config, {
  onSkill, onLog, onTotal, onFail = () => {}, onSkip = () => {}, checkStop,
}) {
  const query = config.url.trim()
  const headers = githubHeaders()

  onLog(`Recherche GitHub code: ${query}`, 'INFO')

  // If the query already has filename: use it as-is; otherwise search both casings
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
  onLog(`${items.length} fichier(s) à vérifier (validation frontmatter name+description requise)`, 'INFO')

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
        if (!content.trim()) { onSkip(); return }

        const parsed = parseSkillMarkdown(content)

        if (!parsed) {
          // File exists but has no valid frontmatter name+description — not a Claude Code skill
          onLog(`  ✗ ${item.repository.full_name}/${item.path} — ignoré (pas de frontmatter name+description)`, 'DEBUG')
          onSkip()
          return
        }

        onLog(`  ✓ [${item.repository.full_name}] ${item.path} → "${parsed.name}"`, 'DEBUG')

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
