import { Hono } from 'hono'
import { streamText } from 'hono/streaming'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db.js'
import { semanticSearch } from '../vector-db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load expert persona from CLAUDE.md — used as system prompt for decompose
let EXPERT_SYSTEM = null
try {
  EXPERT_SYSTEM = readFileSync(
    join(__dirname, '..', '..', '..', 'CLAUDE.md'),
    'utf8'
  )
} catch {
  // File absent: fallback to inline prompt
}

const router = new Hono()

// ─── In-memory session log ────────────────────────────────────────────────────

const sessionLogs = []

router.get('/logs', (c) => c.json(sessionLogs))
router.delete('/logs', (c) => { sessionLogs.length = 0; return c.json({ cleared: true }) })

// ─── Rule-based fallback ──────────────────────────────────────────────────────

function ruleBasedFallback(goal, source) {
  const g = goal.toLowerCase()
  const templates = {
    api:        { steps: ['Design API contract', 'Implement endpoints', 'Write tests', 'Document API'],       skills: ['Claude Code CLI', 'Claude.ai', 'github MCP'] },
    frontend:   { steps: ['Design UI', 'Implement components', 'Integrate API', 'Test responsiveness'],       skills: ['Claude Code CLI', 'filesystem MCP'] },
    research:   { steps: ['Search literature', 'Gather sources', 'Synthesize findings', 'Write report'],      skills: ['Claude.ai', 'brave-search MCP', 'sequential-thinking MCP'] },
    automation: { steps: ['Map workflow', 'Choose tools', 'Implement scripts', 'Schedule execution'],         skills: ['Claude Code CLI', 'Aider', 'filesystem MCP'] },
    default:    { steps: ['Define scope', 'Plan approach', 'Execute step by step', 'Review and iterate'],     skills: ['Claude.ai', 'Claude Code CLI', 'sequential-thinking MCP'] },
  }
  const key = g.includes('api') || g.includes('backend') ? 'api'
    : g.includes('frontend') || g.includes('ui') ? 'frontend'
    : g.includes('research') || g.includes('analys') ? 'research'
    : g.includes('automat') ? 'automation' : 'default'
  const tpl = templates[key]
  const skillRows = tpl.skills
    .map(name => db.prepare('SELECT * FROM skills WHERE LOWER(name)=LOWER(?) AND is_active=1').get(name))
    .filter(Boolean)

  return {
    goal,
    summary: `Approche basique pour: ${key}`,
    architecture: '',
    tech_stack: [],
    analyst_notes: '',
    steps: tpl.steps.map((title, i) => ({
      step: i + 1,
      title,
      role: 'dev',
      dev_tools: skillRows.map(s => s.name),
      user_tools: [],
      tools: skillRows.map(s => ({
        name: s.name,
        description: `Utiliser ${s.name} pour accomplir cette étape`,
        type: 'dev',
      })),
    })),
    source: source || 'sqlite',
    method: 'rule-based',
  }
}

// ─── POST /decompose ──────────────────────────────────────────────────────────

router.post('/decompose', async (c) => {
  const { goal, source = 'sqlite' } = await c.req.json()
  if (!goal?.trim()) return c.json({ error: 'goal requis' }, 422)

  let allSkills
  if (source === 'sqlite-vector') {
    const hits = semanticSearch(goal, 20)
    allSkills = hits
      .map(h => db.prepare('SELECT id, name, category, description FROM skills WHERE id=? AND is_active=1').get(h.skill_id))
      .filter(Boolean)
  } else {
    allSkills = db.prepare(
      'SELECT id, name, category, description FROM skills WHERE is_active=1 ORDER BY popularity_score DESC LIMIT 50'
    ).all()
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  console.log(`\n[goals/decompose] goal="${goal}" source=${source} skills=${allSkills.length} apiKey=${apiKey ? 'OK' : 'MANQUANTE → fallback rule-based'}`)

  const logEntry = {
    id:        Date.now(),
    ts:        new Date().toISOString(),
    goal,
    source,
    method:    null,
    skills:    allSkills.map(s => ({ id: s.id, name: s.name, category: s.category })),
  }
  sessionLogs.unshift(logEntry)

  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey })

      const skillList = allSkills
        .map(s => `- ${s.name} (${s.category})${s.description ? ': ' + s.description.slice(0, 120) : ''}`)
        .join('\n')

      // System prompt: CLAUDE.md expert persona or minimal fallback
      const systemPrompt = EXPERT_SYSTEM || [
        'You are a senior IT analyst specialized in web solution integration.',
        'You combine the roles of software developer, functional analyst, and IT architect.',
        'Always distinguish dev_tools (used to build the solution) from user_tools (part of the delivered solution).',
      ].join(' ')

      const userMessage = [
        'Available skills in the database:',
        skillList,
        '',
        `User goal: "${goal}"`,
        '',
        'Analyze this goal and respond with the JSON format defined in your instructions.',
        'Use ONLY skill names that appear exactly in the list above for tool names.',
        'Respond with valid JSON only (no markdown fences).',
      ].join('\n')

      const message = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })

      const text = message.content[0].text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')

      const parsed = JSON.parse(text)

      const steps = (parsed.steps || []).map(step => ({
        ...step,
        role:       step.role       || 'dev',
        dev_tools:  step.dev_tools  || [],
        user_tools: step.user_tools || [],
        tools: (step.tools || []).map(tool => ({
          name:        tool.name,
          description: tool.description,
          type:        tool.type || 'dev',
          skill: db.prepare('SELECT * FROM skills WHERE LOWER(name)=LOWER(?) AND is_active=1').get(tool.name) || null,
        })),
      }))

      logEntry.method = 'claude'
      return c.json({
        goal,
        summary:       parsed.summary       || '',
        architecture:  parsed.architecture  || '',
        tech_stack:    parsed.tech_stack    || [],
        analyst_notes: parsed.analyst_notes || '',
        steps,
        source,
        method: 'claude',
      })
    } catch (err) {
      console.error('[goals/decompose] Erreur Claude, fallback rule-based:', err.message)
    }
  }

  logEntry.method = 'rule-based'
  return c.json(ruleBasedFallback(goal, source))
})

// ─── POST /explain — streaming ────────────────────────────────────────────────

router.post('/explain', async (c) => {
  const { goal, step_title, tool_name, tool_description } = await c.req.json()
  if (!tool_name?.trim()) return c.json({ error: 'tool_name requis' }, 422)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return c.text(`**${tool_name}**\n\nPour "${tool_description}" dans l'étape "${step_title}", utilisez ${tool_name} en suivant sa documentation officielle. Configurez-le selon votre environnement, exécutez les actions requises, puis vérifiez le résultat avant de passer à l'étape suivante.`)
  }

  return streamText(c, async (stream) => {
    const client = new Anthropic({ apiKey })
    const msg = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Goal: "${goal}"
Step: "${step_title}"
Tool: "${tool_name}"
Usage in this step: "${tool_description}"

In 3-4 sentences, explain concretely how to use this tool for this step. Include specific commands, settings, or actions. Use markdown.`,
      }],
    })
    for await (const chunk of msg) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        await stream.write(chunk.delta.text)
      }
    }
  })
})

export default router
