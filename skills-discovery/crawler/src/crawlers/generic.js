import { CheerioCrawler, Configuration } from 'crawlee'

function detectPricing(text) {
  const t = text.toLowerCase()
  if (/open[\s-]?source|apache|mit license|free forever/.test(t)) return 'free'
  if (/free plan|free tier|freemium|community plan/.test(t)) return 'freemium'
  if (/\$\d|\bpricing\b|\bsubscri/.test(t)) return 'freemium'
  return 'free'
}

export async function crawlGeneric(config, { onSkill, onLog, checkStop }) {
  const { url, category, name: configName } = config
  onLog(`CheerioCrawler → ${url}`)
  Configuration.getGlobalConfig().set('persistStorage', false)

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 30,
    async requestHandler({ $, request }) {
      if (checkStop()) return
      const title = (
        $('meta[property="og:title"]').attr('content') ||
        $('title').text() ||
        $('h1').first().text() ||
        configName || 'Unknown'
      ).trim().slice(0, 100)

      const description = (
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        $('p').first().text() || ''
      ).trim().slice(0, 500)

      const keywords = ($('meta[name="keywords"]').attr('content') || '')
        .split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 1 && k.length <= 40).slice(0, 10)

      onSkill({
        name:        title,
        description,
        source_url:  request.url,
        source_name: 'Web',
        category:    category || 'AI Productivity Tool',
        pricing:     detectPricing($('body').text()),
        tags:        keywords,
      })
      onLog(`Scraped: ${title}`)
    },
    failedRequestHandler({ request, error }) {
      onLog(`Échec: ${request.url} — ${error.message}`)
    },
  })

  await crawler.run([url])
}
