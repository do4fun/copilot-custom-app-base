import Anthropic from '@anthropic-ai/sdk'
import { CheerioCrawler, Configuration } from 'crawlee'

// ─── Heuristic pre-filter ─────────────────────────────────────────────────────

const SKILL_KEYWORDS = [
  'how to', 'step ', 'steps', 'tutorial', 'guide', 'walkthrough',
  'install', 'setup', 'configure', 'initialize', 'init',
  'input', 'output', 'generate', 'create', 'build',
  'command', 'cli', 'api ', 'function', 'method',
  'run ', 'execute', 'invoke', 'deploy',
  'parameter', 'argument', 'option', 'flag',
  'workflow', 'automation', 'task', 'procedure',
  'npm ', 'npx ', 'pip ', 'docker ', 'curl ',
]

function heuristicScore(text) {
  const lower = text.toLowerCase()
  let score = 0
  for (const kw of SKILL_KEYWORDS) {
    if (lower.includes(kw)) score++
  }
  // Numbered list items (step indicators)
  const numbered = (text.match(/^\s*\d+[.)]/gm) || []).length
  score += Math.min(numbered, 3)
  // Code indicators
  if (/```|`[^`]+`/.test(text)) score += 2
  if (/\$\s+\w|\bnpm\b|\bnpx\b/.test(text)) score++
  return score
}

// ─── DOM section extraction ───────────────────────────────────────────────────

function extractSections($) {
  // Clean non-content nodes first
  $('script, style, noscript').remove()
  $('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="complementary"]').remove()

  const sections = []

  // Strategy 1: heading-based sections (h2, h3, h4)
  $('h2, h3, h4').each((_, el) => {
    const $el = $(el)
    const title = $el.text().trim()
    if (!title || title.length < 3 || title.length > 150) return

    // Collect sibling content until next heading of same or higher rank
    const level = parseInt(el.tagName[1])
    const stopTags = Array.from({ length: level }, (_, i) => `h${i + 1}`).join(',')
    const bodyText = $el.nextUntil(stopTags).text().trim()

    if (bodyText.length < 50) return

    const fullText = title + '\n' + bodyText

    // CSS selector: prefer #id on heading or nearest ancestor with id
    let selector = null
    const ownId = $el.attr('id')
    if (ownId) {
      selector = `#${ownId}`
    } else {
      let $anc = $el.parent()
      for (let i = 0; i < 4 && $anc.length; i++) {
        const pid = $anc.attr('id')
        if (pid) { selector = `#${pid}`; break }
        $anc = $anc.parent()
      }
      if (!selector) {
        const tag = el.tagName.toLowerCase()
        const idx = $(tag).index(el) + 1
        selector = `${tag}:nth-of-type(${idx})`
      }
    }

    sections.push({ selector, title, text: fullText.slice(0, 2000) })
  })

  // Strategy 2: article/section blocks when no headings detected
  if (sections.length === 0) {
    $('article, section').each((i, el) => {
      const $el = $(el)
      const text = $el.text().trim()
      if (text.length < 100) return

      const id = $el.attr('id')
      const tag = el.tagName.toLowerCase()
      const title = $el.find('h1,h2,h3,h4').first().text().trim() || `${tag} ${i + 1}`
      const selector = id ? `#${id}` : `${tag}:nth-of-type(${i + 1})`

      sections.push({ selector, title, text: text.slice(0, 2000) })
    })
  }

  return sections
}

// ─── LLM classification ───────────────────────────────────────────────────────

async function classifyWithLLM(section, client) {
  const prompt = `You are analyzing a web page section to determine if it describes a "skill" — a concrete, repeatable procedure with:
1. A clear objective
2. Input parameters (required or optional)
3. Step-by-step instructions or a workflow
4. An expected output or result

Section title: "${section.title}"

Content:
${section.text.slice(0, 1500)}

Respond with valid JSON only (no markdown wrapper):
{
  "is_skill": true or false,
  "confidence": number between 0.0 and 1.0,
  "name": "Short descriptive skill name (max 60 chars)",
  "description": "What this skill does and when to use it (1-2 sentences)",
  "inputs": ["input parameter 1", "input parameter 2"],
  "steps": ["Step 1: action", "Step 2: action"],
  "output": "Expected output or result description",
  "category": "Claude Code Skill or MCP Server or AI Coding Tool or AI Productivity Tool or Software",
  "pricing": "free",
  "tags": ["tag1", "tag2", "tag3"],
  "rejection_reason": "If not a skill, brief reason"
}`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0]?.text || '{}').trim()
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
    return JSON.parse(cleaned)
  } catch (e) {
    return { is_skill: false, rejection_reason: `error: ${e.message}` }
  }
}

// ─── Main crawler ─────────────────────────────────────────────────────────────

export async function crawlWebSegment(config, {
  onSkill, onLog, onTotal, onFail = () => {}, onSkip = () => {}, checkStop,
}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    onLog('ANTHROPIC_API_KEY manquante — web-segment désactivé', 'ERROR')
    return
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const { url, category, name: configName } = config

  onLog(`Web-segment → ${url}`, 'INFO')
  Configuration.getGlobalConfig().set('persistStorage', false)

  let sections = []
  let pageTitle = configName || url

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 30,

    async requestHandler({ $, request }) {
      if (checkStop()) return
      pageTitle = (
        $('meta[property="og:title"]').attr('content') ||
        $('title').text() ||
        $('h1').first().text() ||
        configName || 'Page'
      ).trim().slice(0, 80)

      onLog(`Page chargée: "${pageTitle}"`, 'INFO')
      sections = extractSections($)
      onLog(`${sections.length} section(s) trouvée(s)`, 'INFO')
      onTotal(sections.length)
    },

    failedRequestHandler({ request, error }) {
      onFail(`${request.url} — ${error.message}`)
    },
  })

  try {
    await crawler.run([url])
  } catch (e) {
    onFail(`Chargement échoué: ${e.message}`)
    return
  }

  if (sections.length === 0) {
    onLog('Aucune section trouvée.', 'WARN')
    return
  }

  const HEURISTIC_THRESHOLD = 2
  const CONFIDENCE_THRESHOLD = 0.65

  for (const section of sections) {
    if (checkStop()) break

    const score = heuristicScore(section.text)
    onLog(`"${section.title.slice(0, 50)}" score=${score} [${section.selector}]`, 'DEBUG')

    if (score < HEURISTIC_THRESHOLD) {
      onLog(`  → ignoré (score=${score})`, 'TRACE')
      onSkip()
      continue
    }

    onLog(`  → classification LLM...`, 'DEBUG')
    const result = await classifyWithLLM(section, client)

    if (!result.is_skill || (result.confidence ?? 0) < CONFIDENCE_THRESHOLD) {
      onLog(`  → rejeté: ${result.rejection_reason || `confiance=${result.confidence}`}`, 'DEBUG')
      onSkip()
      continue
    }

    onLog(`  → skill: "${result.name}" (confiance=${result.confidence})`, 'INFO')

    const installMeta = JSON.stringify({
      type: 'web-segment',
      selector: section.selector,
      confidence: result.confidence,
      inputs: result.inputs || [],
      steps: result.steps || [],
      output: result.output || '',
    })

    await onSkill({
      name:                 result.name || section.title,
      description:          result.description || '',
      source_url:           url,
      source_name:          pageTitle,
      category:             result.category || category || 'AI Productivity Tool',
      pricing:              result.pricing || 'free',
      features:             JSON.stringify(result.steps || []),
      install_instructions: installMeta,
      tags:                 result.tags || [],
    })
  }

  onLog(`Segmentation terminée — ${sections.length} section(s) traitée(s)`, 'INFO')
}
