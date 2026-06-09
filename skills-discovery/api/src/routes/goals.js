import { Hono } from 'hono'
import { streamText } from 'hono/streaming'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db.js'
import { semanticSearch } from '../vector-db.js'

const router = new Hono()

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
    : g.includes('research') || g.includes('analyse') ? 'research'
    : g.includes('automat') ? 'automation' : 'default'
  const tpl = templates[key]
  const skillRows = tpl.skills
    .map(name => db.prepare('SELECT * FROM skills WHERE LOWER(name)=LOWER(?) AND is_active=1').get(name))
    .filter(Boolean)

  return {
    goal,
    summary: `Approche basique pour: ${key}`,
    steps: tpl.steps.map((title, i) => ({
      step: i + 1,
      title,
      tools: skillRows.map(s => ({
        name: s.name,
        description: `Utiliser ${s.name} pour accomplir cette étape`,
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
      .map(h => db.prepare('SELECT name, category, description FROM skills WHERE id=? AND is_active=1').get(h.skill_id))
      .filter(Boolean)
  } else {
    allSkills = db.prepare(
      'SELECT name, category, description FROM skills WHERE is_active=1 ORDER BY popularity_score DESC LIMIT 50'
    ).all()
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey })
      const skillList = allSkills.map(s => `- ${s.name} (${s.category})`).join('\n')

      const message = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You decompose goals into clear, ordered steps with the right tools for each step.

Available tools:
${skillList}

Rules:
- Choose the number of steps based on goal complexity (2–8 steps)
- For each step, list only the tools that are genuinely useful (1–4 tools per step)
- "description" must be a single short sentence: what the tool does IN THIS STEP specifically
- Prefer tools from the available list; you may add generic ones (e.g. "Terminal", "Browser") if truly necessary
- No redundancy: don't repeat the same tool across steps unless the usage is clearly different

Goal: "${goal}"

Respond with valid JSON only (no markdown):
{
  "summary": "One sentence describing the overall approach",
  "steps": [
    {
      "step": 1,
      "title": "Step title (short, action verb)",
      "tools": [
        {
          "name": "Tool name (exact name from list when possible)",
          "description": "What it does in this specific step"
        }
      ]
    }
  ]
}`,
        }],
      })

      const text = message.content[0].text.trim()
      const parsed = JSON.parse(text.replace(/^```json\s*/, '').replace(/\s*```$/, ''))

      const steps = (parsed.steps || []).map(step => ({
        ...step,
        tools: (step.tools || []).map(tool => ({
          name: tool.name,
          description: tool.description,
          skill: db.prepare('SELECT * FROM skills WHERE LOWER(name)=LOWER(?) AND is_active=1').get(tool.name) || null,
        })),
      }))

      return c.json({ goal, summary: parsed.summary, steps, source, method: 'claude' })
    } catch {
      // fall through to rule-based
    }
  }

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
