import { Hono } from 'hono'
import { streamText } from 'hono/streaming'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db.js'
import { semanticSearch } from '../vector-db.js'

const router = new Hono()

// ─── Rule-based fallback (tree format) ───────────────────────────────────────

function ruleBasedFallback(goal, source) {
  const g = goal.toLowerCase()
  const templates = {
    api:        { steps: ['Design API contract', 'Implement endpoints', 'Write tests', 'Document API'],        skills: ['Claude Code CLI', 'Claude.ai', 'github MCP'] },
    frontend:   { steps: ['Design UI', 'Implement components', 'Integrate API', 'Test responsiveness'],        skills: ['Claude Code CLI', 'filesystem MCP'] },
    research:   { steps: ['Search literature', 'Gather sources', 'Synthesize findings', 'Write report'],       skills: ['Claude.ai', 'brave-search MCP', 'sequential-thinking MCP'] },
    automation: { steps: ['Map workflow', 'Choose tools', 'Implement scripts', 'Schedule execution'],          skills: ['Claude Code CLI', 'Aider', 'filesystem MCP'] },
    default:    { steps: ['Define scope', 'Plan approach', 'Execute step by step', 'Review and iterate'],      skills: ['Claude.ai', 'Claude Code CLI', 'sequential-thinking MCP'] },
  }
  const key = g.includes('api') || g.includes('backend') ? 'api'
    : g.includes('frontend') || g.includes('ui') ? 'frontend'
    : g.includes('research') || g.includes('analyse') ? 'research'
    : g.includes('automat') ? 'automation' : 'default'
  const tpl = templates[key]
  const skillRows = tpl.skills
    .map(name => db.prepare('SELECT * FROM skills WHERE LOWER(name)=LOWER(?)').get(name))
    .filter(Boolean)

  return {
    goal,
    complexity: 'simple',
    summary: `Approche basique pour: ${key}`,
    steps: tpl.steps.map((title, i) => ({
      step: i + 1,
      title,
      tools: skillRows.map(s => ({
        type: 'skill',
        name: s.name,
        role: 'Tool',
        tasks: [`Utiliser ${s.name} pour cette étape`],
        skill: s,
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
      const skillList = allSkills.map(s => `- ${s.name} (${s.category}): ${(s.description || '').slice(0, 80)}`).join('\n')

      const message = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 2500,
        messages: [{
          role: 'user',
          content: `You are an expert at decomposing goals into actionable plans using AI tools.

Available skills in our database:
${skillList}

Complexity levels — choose the right one based on the goal:
- trivial: 1-2 steps, 3-5 tools total, "skill" type only
- simple: 2-4 steps, 5-10 tools, "skill" and "agent" types
- moderate: 4-6 steps, 10-20 tools, add "workflow" type
- complex: 6+ steps, no limit, all types including "llm_feature"

Tool types:
- skill: a specific AI tool or service (prefer exact names from the list above)
- agent: an AI agent with specialized expertise
- workflow: an automated sequence of steps
- task: a concrete manual or scripted action
- llm_feature: a native Claude capability (extended thinking, code execution, vision, web search)

User goal: "${goal}"

Respond with valid JSON only (no markdown):
{
  "complexity": "trivial|simple|moderate|complex",
  "summary": "Brief explanation of the overall approach (1-2 sentences)",
  "steps": [
    {
      "step": 1,
      "title": "Step title",
      "tools": [
        {
          "type": "skill|agent|workflow|task|llm_feature",
          "name": "Tool or agent name (exact name from available skills when type=skill)",
          "role": "Role in this step (e.g. Architect, Reviewer, Executor, Researcher)",
          "tasks": ["Specific action 1", "Specific action 2"]
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
          ...tool,
          skill: tool.type === 'skill'
            ? (db.prepare('SELECT * FROM skills WHERE LOWER(name)=LOWER(?) AND is_active=1').get(tool.name) || null)
            : null,
        })),
      }))

      return c.json({ goal, complexity: parsed.complexity || 'simple', summary: parsed.summary, steps, source, method: 'claude' })
    } catch {
      // fall through to rule-based
    }
  }

  return c.json(ruleBasedFallback(goal, source))
})

// ─── POST /explain — streaming ────────────────────────────────────────────────

router.post('/explain', async (c) => {
  const { goal, step_title, tool_name, tool_role, task_label } = await c.req.json()
  if (!task_label?.trim()) return c.json({ error: 'task_label requis' }, 422)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // No API key — return a static fallback as plain text
    return c.text(`**${tool_name}** — ${tool_role || 'Tool'}\n\nPour accomplir "${task_label}" dans le contexte "${step_title}", utilisez ${tool_name} en suivant sa documentation officielle. Configurez-le selon votre environnement, exécutez les commandes ou actions requises, puis vérifiez le résultat avant de passer à l'étape suivante.`)
  }

  return streamText(c, async (stream) => {
    const client = new Anthropic({ apiKey })
    const msg = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Goal: "${goal}"
Step: "${step_title}"
Tool: "${tool_name}" (role: ${tool_role || 'Tool'})
Task: "${task_label}"

In 3-5 sentences, explain concretely how to accomplish this specific task using this tool in this context. Be practical: mention commands, configurations, or concrete actions. Use markdown for formatting.`,
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
