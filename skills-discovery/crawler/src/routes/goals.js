import { Hono } from 'hono'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db.js'

const router = new Hono()

function ruleBasedFallback(goal) {
  const g = goal.toLowerCase()
  const templates = {
    api:        { tasks: ['Design API contract', 'Implement endpoints', 'Write tests', 'Document API'],         skills: ['Claude Code CLI', 'Claude.ai', 'github MCP'] },
    frontend:   { tasks: ['Design UI', 'Implement components', 'Integrate API', 'Test responsiveness'],         skills: ['Claude Code CLI', 'v0 by Vercel', 'filesystem MCP'] },
    research:   { tasks: ['Search literature', 'Gather sources', 'Synthesize findings', 'Write report'],        skills: ['Claude.ai', 'brave-search MCP', 'sequential-thinking MCP'] },
    automation: { tasks: ['Map workflow', 'Choose tools', 'Implement scripts', 'Schedule execution'],           skills: ['Claude Code CLI', 'Aider', 'filesystem MCP'] },
    default:    { tasks: ['Define scope', 'Plan approach', 'Execute step by step', 'Review and iterate'],       skills: ['Claude.ai', 'Claude Code CLI', 'sequential-thinking MCP'] },
  }
  const key = g.includes('api') || g.includes('backend') ? 'api'
    : g.includes('frontend') || g.includes('ui') ? 'frontend'
    : g.includes('research') || g.includes('analyse') ? 'research'
    : g.includes('automat') ? 'automation' : 'default'
  const tpl = templates[key]
  const skillRows = tpl.skills.map(name => db.prepare('SELECT * FROM skills WHERE LOWER(name)=LOWER(?)').get(name)).filter(Boolean)
  return {
    goal,
    tasks: tpl.tasks.map((t, i) => ({ step: i + 1, task: t, skills: skillRows })),
    skills: skillRows,
    method: 'rule-based',
  }
}

router.post('/decompose', async (c) => {
  const { goal } = await c.req.json()
  if (!goal?.trim()) return c.json({ error: 'goal requis' }, 422)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey })
      const allSkills = db.prepare('SELECT name, category, description FROM skills WHERE is_active=1 ORDER BY popularity_score DESC LIMIT 50').all()
      const skillList = allSkills.map(s => `- ${s.name} (${s.category})`).join('\n')

      const message = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `You are a helpful assistant that decomposes user goals into actionable tasks and recommends AI tools/skills.

Available skills in our database:
${skillList}

User goal: "${goal}"

Respond with valid JSON only (no markdown):
{
  "tasks": [
    { "step": 1, "task": "task description", "skill_names": ["Skill Name 1", "Skill Name 2"] }
  ],
  "summary": "Brief explanation of the approach"
}`,
        }],
      })

      const text = message.content[0].text.trim()
      const parsed = JSON.parse(text.replace(/^```json\s*/, '').replace(/\s*```$/, ''))
      const tasks = (parsed.tasks || []).map(t => ({
        ...t,
        skills: (t.skill_names || []).map(n => db.prepare('SELECT * FROM skills WHERE LOWER(name)=LOWER(?)').get(n)).filter(Boolean),
      }))
      const allSkillRefs = [...new Map(tasks.flatMap(t => t.skills).map(s => [s.id, s])).values()]
      return c.json({ goal, tasks, skills: allSkillRefs, summary: parsed.summary, method: 'claude' })
    } catch {
      // fall through to rule-based
    }
  }

  return c.json(ruleBasedFallback(goal))
})

export default router
