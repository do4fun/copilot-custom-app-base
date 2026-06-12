import { CheerioCrawler, Configuration } from 'crawlee'
import { parseSkillMarkdown } from './github-skills.js'

const MAX_REQUESTS = 100

function detectPricing(bodyText) {
  const text = bodyText.toLowerCase()
  if (/open[ -]source|mit license|apache license|gpl/.test(text)) return 'free'
  if (/free tier|free plan|freemium/.test(text)) return 'freemium'
  if (/subscription|per month|\/month|pricing plan|buy now/.test(text)) return 'paid'
  return 'free'
}

/** Reconstruit l'URL raw d'une URL blob GitHub. */
function githubBlobToRaw(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\.md)$/i)
  if (!m) return null
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`
}

/**
 * Crawler HTML générique (CheerioCrawler, max 100 pages, même domaine).
 * Stratégie 1 : URL blob GitHub → raw markdown → parseSkillMarkdown
 * Stratégie 2 : markdown embarqué dans <pre>/<code> (frontmatter YAML)
 * Stratégie 3 : meta tags HTML (og:title, description, keywords)
 */
export async function crawlGeneric(config, ctx) {
  const startUrl = config.url
  let origin
  try {
    origin = new URL(startUrl).origin
  } catch {
    throw new Error(`URL invalide : ${startUrl}`)
  }

  ctx.onLog(`Crawl générique depuis ${startUrl} (max ${MAX_REQUESTS} pages, même domaine)`)
  ctx.onTotal(MAX_REQUESTS)

  const crawlerConfig = new Configuration({ persistStorage: false })

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: MAX_REQUESTS,
      requestHandlerTimeoutSecs: 30,
      maxConcurrency: 5,

      async requestHandler({ request, $, enqueueLinks }) {
        if (ctx.checkStop()) return
        await ctx.waitWhilePaused()
        if (ctx.checkStop()) return

        const url = request.loadedUrl || request.url

        // Stratégie 1 — URL blob GitHub → raw markdown
        const rawUrl = githubBlobToRaw(url)
        if (rawUrl) {
          try {
            const res = await fetch(rawUrl, { headers: { 'User-Agent': 'SkillsHub-Crawler' } })
            if (res.ok) {
              const { skill, reason } = parseSkillMarkdown(await res.text())
              if (skill) {
                await ctx.onSkill({ ...skill, source_url: url })
                return
              }
              ctx.onLog(`Markdown rejeté (${reason}) : ${url}`, 'DEBUG')
            }
          } catch (err) {
            ctx.onFail(`${url} : ${err.message}`)
          }
        }

        // Stratégie 2 — markdown embarqué dans <pre>/<code>
        let embedded = null
        $('pre, code').each((_, el) => {
          if (embedded) return
          const text = $(el).text().trim()
          if (text.startsWith('---')) {
            const { skill } = parseSkillMarkdown(text)
            if (skill) embedded = skill
          }
        })
        if (embedded) {
          await ctx.onSkill({ ...embedded, source_url: url })
          return
        }

        // Stratégie 3 — meta tags HTML (fallback)
        const name =
          $('meta[property="og:title"]').attr('content')?.trim() || $('title').text().trim()
        const description =
          $('meta[property="og:description"]').attr('content')?.trim() ||
          $('meta[name="description"]').attr('content')?.trim()
        const keywords = ($('meta[name="keywords"]').attr('content') || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)

        if (name && description && description.length >= 15) {
          await ctx.onSkill({
            name,
            description,
            source_url: url,
            tags: keywords,
            pricing: detectPricing($('body').text()),
          })
        } else {
          ctx.onSkip()
        }

        // suit les liens internes (même domaine)
        await enqueueLinks({
          strategy: 'same-domain',
          transformRequestFunction: (req) => (req.url.startsWith(origin) ? req : false),
        })
      },

      failedRequestHandler({ request }, err) {
        ctx.onFail(`${request.url} : ${err?.message || 'échec de chargement'}`)
      },
    },
    crawlerConfig
  )

  await crawler.run([startUrl])
}
