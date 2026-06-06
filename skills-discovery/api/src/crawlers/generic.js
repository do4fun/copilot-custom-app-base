import { CheerioCrawler, Configuration } from 'crawlee'
import { URL } from 'url'
import { parseSkillMarkdown } from './github-skills.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Convert a GitHub blob URL for a markdown file to its raw content URL.
// https://github.com/{owner}/{repo}/blob/{branch}/{path}
//   → https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
function toRawGithubUrl(pageUrl) {
  const m = pageUrl.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/)
  if (!m) return null
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`
}

// Look for raw markdown embedded in the page HTML (pre/code blocks that start
// with a YAML frontmatter delimiter).
function findEmbeddedMarkdown($) {
  let found = null
  $('pre, code').each((_, el) => {
    if (found) return false
    const text = $(el).text().trim()
    if (text.startsWith('---') && text.length > 80) {
      found = text
      return false
    }
  })
  return found
}

function detectPricing(text) {
  const t = text.toLowerCase()
  if (/open[\s-]?source|apache|mit license|free forever/.test(t)) return 'free'
  if (/free plan|free tier|freemium|community plan/.test(t)) return 'freemium'
  if (/\$\d|\bpricing\b|\bsubscri/.test(t)) return 'freemium'
  return 'free'
}

// Fallback: extract basic info from HTML meta tags
function extractFromHtml($, request, category, fallbackName) {
  const title = (
    $('meta[property="og:title"]').attr('content') ||
    $('title').text() ||
    $('h1').first().text() ||
    fallbackName || 'Unknown'
  ).trim().slice(0, 100)

  const description = (
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('p').first().text() || ''
  ).trim().slice(0, 800)

  const keywords = ($('meta[name="keywords"]').attr('content') || '')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length > 1 && k.length <= 40)
    .slice(0, 10)

  return {
    name:        title,
    description,
    source_url:  request.url,
    source_name: 'Web',
    category:    category || 'AI Productivity Tool',
    pricing:     detectPricing($('body').text()),
    tags:        keywords,
  }
}

// ─── Crawler ──────────────────────────────────────────────────────────────────

export async function crawlGeneric(config, {
  onSkill, onLog, onTotal, onFail = () => {}, onSkip = () => {}, checkStop,
  knownUrls = new Set(), knownNames = new Set(),
}) {
  const { url, category, name: configName } = config
  const rootDomain = new URL(url).hostname
  onLog(`CheerioCrawler → ${url} (domaine: ${rootDomain})`, 'INFO')

  Configuration.getGlobalConfig().set('persistStorage', false)

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 100,
    requestHandlerTimeoutSecs: 30,

    async requestHandler({ $, request, enqueueLinks }) {
      if (checkStop()) return
      onLog(`> ${request.url}`, 'TRACE')

      let skill = null

      // ── 1. GitHub blob URL for a .md file → fetch raw content and parse ────
      const rawUrl = toRawGithubUrl(request.url)
      if (rawUrl && /\.(md|MD)$/.test(rawUrl)) {
        try {
          const res = await fetch(rawUrl, {
            headers: { 'User-Agent': 'skillshub-crawler/2.0' },
            signal: AbortSignal.timeout(8000),
          })
          if (res.ok) {
            const content = await res.text()
            const { skill: parsed, reason } = parseSkillMarkdown(content)
            onLog(`  [raw .md] → ${reason}`, 'TRACE')
            if (parsed) {
              skill = {
                name:         parsed.name,
                description:  parsed.description,
                source_url:   request.url,
                source_name:  'Web',
                category:     category || 'Claude Code Skill',
                pricing:      'free',
                version:      parsed.version,
                tags:         parsed.tags,
                features:     parsed.features,
                readme:       content,
              }
            }
          }
        } catch (e) {
          onLog(`  raw fetch error: ${e.message}`, 'DEBUG')
        }
      }

      // ── 2. Embedded markdown in HTML (pre/code blocks with YAML frontmatter) ─
      if (!skill) {
        const embedded = findEmbeddedMarkdown($)
        if (embedded) {
          const { skill: parsed, reason } = parseSkillMarkdown(embedded)
          onLog(`  [embedded md] → ${reason}`, 'TRACE')
          if (parsed) {
            skill = {
              name:         parsed.name,
              description:  parsed.description,
              source_url:   request.url,
              source_name:  'Web',
              category:     category || 'Claude Code Skill',
              pricing:      'free',
              version:      parsed.version,
              tags:         parsed.tags,
              features:     parsed.features,
              readme:       embedded,
            }
          }
        }
      }

      // ── 3. Fallback: HTML meta tags extraction ────────────────────────────
      if (!skill) {
        skill = extractFromHtml($, request, category, configName)
        onLog(`  [HTML] name="${skill.name}" desc=${skill.description.length}c`, 'TRACE')
      }

      onSkill(skill)

      // Follow links from root page, same domain only
      if (!request.userData.linked) {
        const linked = await enqueueLinks({
          userData: { linked: true },
          transformRequestFunction: (req) => {
            try {
              if (new URL(req.url).hostname !== rootDomain) return false
              if (knownUrls.has(req.url)) return false
              return req
            } catch {
              return false
            }
          },
        })
        if (linked?.processedRequests?.length) {
          onLog(`${linked.processedRequests.length} page(s) liée(s) trouvée(s)`, 'INFO')
          onTotal(1 + linked.processedRequests.length)
        }
      }
    },

    failedRequestHandler({ request, error }) {
      onFail(`${request.url} — ${error.message}`)
    },
  })

  await crawler.run([url])
}
