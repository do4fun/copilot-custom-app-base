import { CheerioCrawler, Configuration } from 'crawlee'
import { URL } from 'url'

function detectPricing(text) {
  const t = text.toLowerCase()
  if (/open[\s-]?source|apache|mit license|free forever/.test(t)) return 'free'
  if (/free plan|free tier|freemium|community plan/.test(t)) return 'freemium'
  if (/\$\d|\bpricing\b|\bsubscri/.test(t)) return 'freemium'
  return 'free'
}

function extractSkillFromPage($, request, category, fallbackName) {
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
  ).trim().slice(0, 500)

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

export async function crawlGeneric(config, { onSkill, onLog, onTotal, onFail = () => {}, checkStop, knownUrls = new Set(), knownNames = new Set() }) {
  const { url, category, name: configName } = config
  const rootDomain = new URL(url).hostname
  onLog(`CheerioCrawler → ${url} (root + pages liées, même domaine)`)

  Configuration.getGlobalConfig().set('persistStorage', false)

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 100,
    requestHandlerTimeoutSecs: 30,

    async requestHandler({ $, request, enqueueLinks }) {
      if (checkStop()) return

      const skill = extractSkillFromPage($, request, category, configName)
      onSkill(skill)

      // Follow links only from the root page, restricted to same domain, skipping known URLs
      if (!request.userData.linked) {
        const linked = await enqueueLinks({
          userData: { linked: true },
          transformRequestFunction: (req) => {
            try {
              const host = new URL(req.url).hostname
              if (host !== rootDomain) return false
              if (knownUrls.has(req.url)) return false
              return req
            } catch {
              return false
            }
          },
        })
        if (linked?.processedRequests?.length) {
          onLog(`${linked.processedRequests.length} pages liées trouvées`)
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
