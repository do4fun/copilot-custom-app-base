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

const MIN_DESC_LEN = 15
const MIN_BODY_LEN = 30

// Returns { skill, reason } where skill is null on rejection.
// reason always describes the outcome (accepted or why rejected).
export function parseSkillMarkdown(content) {
  // ── 1. Frontmatter presence ───────────────────────────────────────────────
  const fmMatch = content.match(/^---[\r\n]([\s\S]*?)[\r\n]---[\r\n]?/)
  if (!fmMatch)
    return { skill: null, reason: 'Pas de frontmatter YAML (--- manquant)' }

  const body = content.slice(fmMatch[0].length).trimStart()

  // ── 2. YAML parsing ───────────────────────────────────────────────────────
  let fm = {}
  try { fm = parseYaml(fmMatch[1]) }
  catch (e) { return { skill: null, reason: `Frontmatter invalide: ${e.message}` } }

  // ── 3. name ───────────────────────────────────────────────────────────────
  const name = fm.name ? String(fm.name).trim() : ''
  if (name.length < 2)
    return { skill: null, reason: 'name absent ou trop court dans le frontmatter' }

  // ── 4. description ────────────────────────────────────────────────────────
  const description = fm.description ? String(fm.description).trim() : ''
  if (!description)
    return { skill: null, reason: `description absente du frontmatter (champ obligatoire — mécanisme de déclenchement)` }
  if (description.length < MIN_DESC_LEN)
    return { skill: null, reason: `description trop courte: ${description.length} chars (minimum ${MIN_DESC_LEN})` }

  // ── 5. Body (instructions) ────────────────────────────────────────────────
  const bodyLen = body.trim().length
  if (bodyLen < MIN_BODY_LEN)
    return { skill: null, reason: `body trop court: ${bodyLen} chars (minimum ${MIN_BODY_LEN} — doit contenir les instructions)` }

  // ── 6. Extract optional fields ────────────────────────────────────────────
  const version = fm.version ? String(fm.version).trim() : ''

  // Tags: from frontmatter or derived from name parts (Anthropic format has none)
  let tags = []
  if (Array.isArray(fm.tags)) {
    tags = fm.tags.map(String).filter(Boolean)
  } else if (typeof fm.tags === 'string' && fm.tags.trim()) {
    tags = fm.tags.split(',').map(s => s.trim()).filter(Boolean)
  }
  if (!tags.length)
    tags = name.split(/[-_\s]+/).filter(t => t.length > 2)
  if (!tags.includes('claude-code')) tags.unshift('claude-code')

  // Features: community format (agents/allowed-tools) or Anthropic format (compatibility)
  const features = []
  if (Array.isArray(fm.agents))           features.push(...fm.agents.map(a => `Agent: ${a}`))
  if (Array.isArray(fm['allowed-tools'])) features.push(...fm['allowed-tools'].map(t => `Tool: ${t}`))
  if (fm.compatibility && typeof fm.compatibility === 'string')
    features.push(`Requires: ${fm.compatibility}`)

  const skill = {
    name:        name.slice(0, 100),
    description: description.slice(0, 800),
    tags,
    version,
    features,
  }

  const summary = [
    `name: "${skill.name}"`,
    `description: ${description.length} chars`,
    `body: ${bodyLen} chars`,
    tags.length ? `tags: [${tags.slice(0, 4).join(', ')}]` : null,
    version ? `version: ${version}` : null,
    features.length ? `features: ${features.length}` : null,
  ].filter(Boolean).join(' | ')

  return { skill, reason: `✓ ${summary}` }
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
        if (!content.trim()) {
          onLog(`  [${item.repository.full_name}/${item.path}] → fichier vide`, 'TRACE')
          onSkip()
          return
        }

        const { skill, reason } = parseSkillMarkdown(content)
        onLog(`  [${item.repository.full_name}/${item.path}] → ${reason}`, 'TRACE')

        if (!skill) {
          onSkip()
          return
        }

        onSkill({
          name:         skill.name,
          description:  skill.description,
          source_url:   item.html_url,
          source_name:  `GitHub / ${item.repository.full_name}`,
          category:     config.category || 'Claude Code Skill',
          pricing:      'free',
          version:      skill.version,
          tags:         skill.tags,
          features:     skill.features,
          readme:       content.slice(0, 15000),
        })
      } catch (e) {
        onFail(`${item.path} — ${e.message}`)
      }
    }))
  }
}
