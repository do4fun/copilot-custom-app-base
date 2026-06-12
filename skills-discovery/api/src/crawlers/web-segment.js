import { CheerioCrawler, Configuration } from 'crawlee'
import Anthropic from '@anthropic-ai/sdk'

const SEGMENT_MODEL = 'claude-haiku-4-5-20251001'
const CONFIDENCE_THRESHOLD = 0.65
const HEURISTIC_THRESHOLD = 2

const KEYWORDS = [
  'how to', 'step ', 'steps', 'tutorial', 'guide', 'walkthrough',
  'install', 'setup', 'configure', 'initialize', 'init',
  'input', 'output', 'generate', 'create', 'build',
  'command', 'cli', 'api ', 'function', 'method',
  'run ', 'execute', 'invoke', 'deploy',
  'parameter', 'argument', 'option', 'flag',
  'workflow', 'automation', 'task', 'procedure',
  'npm ', 'npx ', 'pip ', 'docker ', 'curl ',
]

/**
 * Score heuristique d'une section :
 * +1 par mot-clé · +1 par ligne de liste numérotée (max +3) ·
 * +2 si bloc de code · +1 si pattern `$ commande` / npm / npx
 */
export function heuristicScore(text) {
  const lower = text.toLowerCase()
  let score = 0
  for (const kw of KEYWORDS) {
    if (lower.includes(kw)) score += 1
  }
  const numbered = (text.match(/^\s*\d+[.)]\s+/gm) || []).length
  score += Math.min(numbered, 3)
  if (/```|<code|`[^`]+`/.test(text)) score += 2
  if (/^\s*\$\s+\S/m.test(text) || /\b(npm|npx)\s+\S/.test(lower)) score += 1
  return score
}

/** Calcule un sélecteur CSS stable pour un élément : #id propre → #id ancêtre → nth-of-type. */
function cssSelector($, el) {
  const id = $(el).attr('id')
  if (id && /^[\w-]+$/.test(id)) return `#${id}`

  // ancêtre avec id
  const ancestor = $(el).parents('[id]').first()
  const ancestorId = ancestor.attr('id')
  if (ancestorId && /^[\w-]+$/.test(ancestorId)) return `#${ancestorId}`

  // fallback tag:nth-of-type(n)
  const tag = el.tagName || el.name
  const index = $(el).prevAll(tag).length + 1
  return `${tag}:nth-of-type(${index})`
}

/** Extrait les sections par headings h2/h3/h4, fallback article/section. */
function extractSections($) {
  const sections = []
  const headings = $('h2, h3, h4')

  if (headings.length) {
    headings.each((_, h) => {
      const title = $(h).text().trim()
      const content = $(h).nextUntil('h2, h3, h4').text().trim()
      if (!title || content.length < 60) return
      sections.push({ title, text: `${title}\n${content}`.slice(0, 4000), selector: cssSelector($, h) })
    })
  }

  if (!sections.length) {
    $('article, section').each((_, el) => {
      const text = $(el).text().trim()
      if (text.length < 60) return
      const title = $(el).find('h1, h2, h3').first().text().trim() || text.slice(0, 60)
      sections.push({ title, text: text.slice(0, 4000), selector: cssSelector($, el) })
    })
  }

  return sections
}

async function analyzeSection(client, section, pageUrl, category) {
  const prompt = `Analyse cette section d'une page web (${pageUrl}) et détermine si elle décrit un "skill" exploitable : un outil, une procédure, un tutoriel ou une capacité actionnable.

Section "${section.title}" :
"""
${section.text}
"""

Réponds UNIQUEMENT avec ce JSON (aucun markdown) :
{
  "is_skill": true|false,
  "confidence": 0.0-1.0,
  "name": "nom court et précis du skill",
  "description": "description en 1-2 phrases de ce que permet ce skill",
  "inputs": ["prérequis ou entrées nécessaires"],
  "steps": ["étape concrète 1", "étape 2"],
  "output": "résultat produit",
  "category": "${category}",
  "tags": ["tag1", "tag2"]
}`

  const response = await client.messages.create({
    model: SEGMENT_MODEL,
    max_tokens: 900,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('réponse LLM sans JSON')
  return JSON.parse(text.slice(start, end + 1))
}

/**
 * Segmentation IA d'une page web : 1 seule page, sections scorées par heuristique,
 * puis analysées par Claude Haiku. Requiert ANTHROPIC_API_KEY.
 */
export async function crawlWebSegment(config, ctx) {
  if (!process.env.ANTHROPIC_API_KEY) {
    ctx.onLog('ANTHROPIC_API_KEY absente — crawler web-segment indisponible', 'WARN')
    return
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  ctx.onLog(`Segmentation IA de ${config.url}`)

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: 1,
      requestHandlerTimeoutSecs: 30,

      async requestHandler({ request, $ }) {
        // supprime les blocs non-content
        $('nav, header, footer, aside, script, style').remove()

        const sections = extractSections($)
        ctx.onLog(`${sections.length} section(s) extraite(s)`)
        ctx.onTotal(sections.length)

        for (const section of sections) {
          if (ctx.checkStop()) return
          await ctx.waitWhilePaused()
          if (ctx.checkStop()) return

          const score = heuristicScore(section.text)
          if (score < HEURISTIC_THRESHOLD) {
            ctx.onLog(`Section « ${section.title} » ignorée (score heuristique ${score})`, 'TRACE')
            ctx.onSkip()
            continue
          }

          try {
            const analysis = await analyzeSection(client, section, request.url, config.category)

            if (!analysis.is_skill || (analysis.confidence || 0) < CONFIDENCE_THRESHOLD) {
              ctx.onLog(
                `Section « ${section.title} » rejetée par le LLM (confiance ${analysis.confidence ?? '?'})`,
                'DEBUG'
              )
              ctx.onSkip()
              continue
            }

            await ctx.onSkill({
              name: analysis.name,
              description: analysis.description,
              category: analysis.category || config.category,
              source_url: request.url,
              source_name: 'Web',
              pricing: 'free',
              features: analysis.steps || [],
              tags: analysis.tags || [],
              install_instructions: JSON.stringify({
                type: 'web-segment',
                selector: section.selector,
                confidence: analysis.confidence,
                inputs: analysis.inputs || [],
                steps: analysis.steps || [],
                output: analysis.output || '',
              }),
            })
          } catch (err) {
            ctx.onFail(`Section « ${section.title} » : ${err.message}`)
          }
        }
      },

      failedRequestHandler({ request }, err) {
        ctx.onFail(`${request.url} : ${err?.message || 'échec de chargement'}`)
      },
    },
    new Configuration({ persistStorage: false })
  )

  await crawler.run([config.url])
}
