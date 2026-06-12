import { Hono } from 'hono'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { db } from '../db.js'
import { semanticSearch } from '../vector-db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// skills-discovery/CLAUDE.md = prompt système LLM (persona expert IT)
const SYSTEM_PROMPT_PATH = join(__dirname, '../../../CLAUDE.md')

const router = new Hono()

const DECOMPOSE_MODEL = 'claude-opus-4-8'

// Log de session en mémoire uniquement — perdu au redémarrage
const goalLogs = []
let logSeq = 0

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function loadSystemPrompt() {
  try {
    return readFileSync(SYSTEM_PROMPT_PATH, 'utf8')
  } catch {
    return 'Tu es un analyste IT sénior. Décompose l\'objectif en étapes avec outils recommandés. Réponds uniquement en JSON valide avec les clés summary, architecture, tech_stack, analyst_notes, runtime_tools, steps.'
  }
}

const getTagsStmt = () =>
  db.prepare('SELECT t.name FROM tags t JOIN skill_tags st ON st.tag_id = t.id WHERE st.skill_id = ?')

/** Source "sqlite" : FTS5 sur les mots du goal + skills récents (25-60 skills). */
function gatherSkillsFts(goal) {
  const tokens = goal
    .toLowerCase()
    .split(/[^a-z0-9àâéèêëîïôùûç-]+/i)
    .map((t) => t.replace(/["'*()^]/g, ''))
    .filter((t) => t.length > 2)

  const byId = new Map()
  if (tokens.length) {
    const match = tokens.map((t) => `"${t}" *`).join(' OR ')
    try {
      const rows = db
        .prepare(
          `SELECT s.* FROM skills s JOIN skills_fts fts ON s.id = fts.rowid
           WHERE skills_fts MATCH ? AND s.is_active = 1
           ORDER BY rank LIMIT 35`
        )
        .all(match)
      for (const r of rows) byId.set(r.id, r)
    } catch {
      /* requête FTS invalide → on garde seulement les récents */
    }
  }

  // complète avec les skills les plus populaires / récents jusqu'à 25 minimum
  const fill = db
    .prepare(
      'SELECT * FROM skills WHERE is_active = 1 ORDER BY popularity_score DESC, created_at DESC LIMIT 25'
    )
    .all()
  for (const r of fill) {
    if (byId.size >= 60) break
    if (!byId.has(r.id)) byId.set(r.id, r)
  }

  return [...byId.values()].slice(0, 60)
}

/** Source "sqlite-vector" : recherche sémantique TF-IDF + capability space. */
function gatherSkillsVector(goal) {
  const hits = semanticSearch(goal, 40)
  const get = db.prepare('SELECT * FROM skills WHERE id = ? AND is_active = 1')
  return hits.map((h) => ({ ...get.get(h.skill_id), _score: h.score, _match: h.match_type })).filter((s) => s.id)
}

function skillsForPrompt(skills) {
  const tagsStmt = getTagsStmt()
  return skills.map((s) => ({
    name: s.name,
    description: (s.description || '').slice(0, 220),
    category: s.category,
    pricing: s.pricing,
    tags: tagsStmt.all(s.id).map((r) => r.name),
    install: (s.install_instructions || '').slice(0, 120) || undefined,
  }))
}

function parseClaudeJson(text) {
  let raw = text.trim()
  // strip d'un éventuel wrapper markdown ```json ... ```
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) raw = fenced[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Pas de JSON dans la réponse')
  return JSON.parse(raw.slice(start, end + 1))
}

/* ─── Fallback rule-based (sans clé API) — noms exacts des skills seed ─── */

function tool(name, description, type, purpose, installHint, inDb = true) {
  return { name, description, type, purpose, install_hint: installHint, integration_notes: '', in_db: inDb }
}

const FALLBACK_TEMPLATES = [
  {
    keywords: ['api', 'backend', 'rest', 'serveur', 'server', 'endpoint', 'microservice'],
    summary: "Construction d'une API backend : cadrage des endpoints, scaffolding assisté par IA, implémentation, tests et déploiement.",
    architecture: 'API REST en couches : routes → services → accès données. Base SQLite ou PostgreSQL selon la volumétrie. Déploiement conteneurisé.',
    tech_stack: ['Node.js', 'Hono', 'SQLite', 'Docker'],
    steps: [
      {
        title: "Cadrer le besoin et l'architecture",
        role: 'analyst',
        tools: [
          tool('Claude.ai', "Analyser le besoin, lister les endpoints et modéliser les données avec l'assistant.", 'dev', 'Analyse fonctionnelle', 'https://claude.ai'),
          tool('sequential-thinking MCP', 'Décomposer les cas d\'usage complexes en étapes de raisonnement vérifiables.', 'dev', 'Raisonnement structuré', 'npx -y @modelcontextprotocol/server-sequential-thinking'),
          tool('brave-search MCP', "Vérifier l'état de l'art et comparer les frameworks adaptés.", 'dev', 'Veille technique', 'npx -y @modelcontextprotocol/server-brave-search'),
        ],
      },
      {
        title: 'Générer le squelette du projet',
        role: 'dev',
        tools: [
          tool('Claude Code CLI', 'Scaffolder le projet (routes, modèles, config) directement dans le repo : `claude` puis décrire la structure cible.', 'dev', 'Scaffolding initial', 'npm install -g @anthropic-ai/claude-code'),
          tool('github MCP', 'Créer le repo, les branches et les premières issues depuis l\'agent.', 'dev', 'Setup repo', 'npx -y @modelcontextprotocol/server-github'),
          tool('filesystem MCP', 'Lecture/écriture contrôlée des fichiers du projet pendant la génération.', 'dev', 'Accès fichiers', 'npx -y @modelcontextprotocol/server-filesystem .'),
        ],
      },
      {
        title: 'Implémenter les endpoints et la persistance',
        role: 'dev',
        tools: [
          tool('Claude Code CLI', 'Implémenter chaque endpoint avec ses tests, itérer jusqu\'au vert.', 'dev', 'Développement assisté', 'npm install -g @anthropic-ai/claude-code'),
          tool('Cursor', 'Édition fine multi-fichiers avec autocomplétion contextuelle.', 'dev', 'Édition IDE', 'https://cursor.com'),
          tool('Aider', 'Alternative terminal open source avec commits automatiques.', 'dev', 'Pair-programming CLI', 'pip install aider-chat'),
        ],
      },
      {
        title: 'Tester et valider',
        role: 'dev',
        tools: [
          tool('Claude Code CLI', 'Écrire et exécuter la suite de tests, corriger les régressions.', 'dev', 'Tests automatisés', 'npm install -g @anthropic-ai/claude-code'),
          tool('github MCP', 'Ouvrir la PR et suivre la CI depuis l\'agent.', 'dev', 'Revue et CI', 'npx -y @modelcontextprotocol/server-github'),
          tool('Claude.ai', 'Revue de code et analyse des cas limites.', 'dev', 'Code review', 'https://claude.ai'),
        ],
      },
      {
        title: 'Déployer et documenter',
        role: 'architect',
        tools: [
          tool('Claude Code CLI', 'Générer Dockerfile, CI GitHub Actions et README.', 'dev', 'Déploiement', 'npm install -g @anthropic-ai/claude-code'),
          tool('Docker', 'Conteneuriser l\'API pour un déploiement reproductible.', 'user', 'Runtime conteneur', 'docker build -t api .', false),
          tool('Claude.ai', 'Rédiger la documentation API et le guide d\'exploitation.', 'dev', 'Documentation', 'https://claude.ai'),
        ],
      },
    ],
    runtime_tools: [
      { name: 'SQLite', purpose: 'Persistance des données', category: 'database', install_hint: 'npm install better-sqlite3', in_db: false },
      { name: 'Docker', purpose: 'Conteneurisation du service', category: 'hosting', install_hint: 'https://docs.docker.com', in_db: false },
    ],
  },
  {
    keywords: ['frontend', 'ui', 'interface', 'react', 'site', 'web app', 'webapp', 'application web'],
    summary: "Construction d'une interface web moderne : maquettage, scaffolding Vite/React, composants, intégration API et déploiement statique.",
    architecture: 'SPA React (Vite) + TailwindCSS, consommant une API REST. Build statique servi par CDN ou par le backend.',
    tech_stack: ['React', 'Vite', 'TailwindCSS', 'Axios'],
    steps: [
      {
        title: 'Définir les parcours et maquettes',
        role: 'analyst',
        tools: [
          tool('Claude.ai', 'Formaliser les user stories et générer des maquettes textuelles/HTML.', 'dev', 'Conception UX', 'https://claude.ai'),
          tool('sequential-thinking MCP', 'Prioriser les écrans et les flux critiques.', 'dev', 'Priorisation', 'npx -y @modelcontextprotocol/server-sequential-thinking'),
          tool('brave-search MCP', 'Rechercher des patterns UI de référence.', 'dev', 'Inspiration UI', 'npx -y @modelcontextprotocol/server-brave-search'),
        ],
      },
      {
        title: 'Scaffolder le projet React',
        role: 'dev',
        tools: [
          tool('Claude Code CLI', 'Créer le projet Vite + Tailwind, le routing et la structure de composants : `npm create vite@latest`.', 'dev', 'Scaffolding', 'npm install -g @anthropic-ai/claude-code'),
          tool('Cursor', 'Itérer rapidement sur les composants avec l\'autocomplétion IA.', 'dev', 'Édition IDE', 'https://cursor.com'),
          tool('filesystem MCP', 'Manipulation des fichiers du projet par l\'agent.', 'dev', 'Accès fichiers', 'npx -y @modelcontextprotocol/server-filesystem .'),
        ],
      },
      {
        title: 'Développer les composants et pages',
        role: 'dev',
        tools: [
          tool('Claude Code CLI', 'Implémenter pages, composants réutilisables et état global.', 'dev', 'Développement', 'npm install -g @anthropic-ai/claude-code'),
          tool('Aider', 'Sessions de refactoring ciblées avec commits atomiques.', 'dev', 'Refactoring', 'pip install aider-chat'),
          tool('Claude.ai', 'Générer des variantes de design et du contenu.', 'dev', 'Design et contenu', 'https://claude.ai'),
        ],
      },
      {
        title: 'Intégrer l\'API et tester',
        role: 'dev',
        tools: [
          tool('Claude Code CLI', 'Brancher le client HTTP, gérer les états de chargement et erreurs, écrire les tests.', 'dev', 'Intégration API', 'npm install -g @anthropic-ai/claude-code'),
          tool('github MCP', 'PRs et suivi CI.', 'dev', 'Revue', 'npx -y @modelcontextprotocol/server-github'),
          tool('Axios', 'Client HTTP du frontend en production.', 'user', 'Appels API', 'npm install axios', false),
        ],
      },
      {
        title: 'Builder et déployer',
        role: 'architect',
        tools: [
          tool('Claude Code CLI', 'Configurer le build de production et la CI de déploiement.', 'dev', 'Déploiement', 'npm install -g @anthropic-ai/claude-code'),
          tool('Vercel', 'Hébergement du build statique avec previews par PR.', 'user', 'Hosting', 'npm i -g vercel && vercel', false),
          tool('Claude.ai', 'Checklist accessibilité et performance.', 'dev', 'Qualité', 'https://claude.ai'),
        ],
      },
    ],
    runtime_tools: [
      { name: 'Vercel', purpose: 'Hébergement frontend', category: 'hosting', install_hint: 'https://vercel.com', in_db: false },
      { name: 'Axios', purpose: 'Client HTTP', category: 'other', install_hint: 'npm install axios', in_db: false },
    ],
  },
  {
    keywords: ['recherche', 'research', 'veille', 'analyse', 'étude', 'comparer', 'benchmark'],
    summary: "Travail de recherche et d'analyse : collecte de sources, structuration du raisonnement, synthèse et restitution documentée.",
    architecture: 'Pipeline de recherche : collecte (recherche web) → analyse (LLM + raisonnement structuré) → synthèse (documents markdown versionnés).',
    tech_stack: ['Claude', 'MCP', 'Markdown'],
    steps: [
      {
        title: 'Cadrer la question de recherche',
        role: 'analyst',
        tools: [
          tool('Claude.ai', 'Formuler les hypothèses et le plan de recherche.', 'dev', 'Cadrage', 'https://claude.ai'),
          tool('sequential-thinking MCP', 'Décomposer la question en sous-questions vérifiables.', 'dev', 'Décomposition', 'npx -y @modelcontextprotocol/server-sequential-thinking'),
          tool('brave-search MCP', 'Première exploration des sources.', 'dev', 'Exploration', 'npx -y @modelcontextprotocol/server-brave-search'),
        ],
      },
      {
        title: 'Collecter et organiser les sources',
        role: 'dev',
        tools: [
          tool('brave-search MCP', 'Recherches ciblées multi-requêtes, fraîcheur paramétrable.', 'dev', 'Collecte', 'npx -y @modelcontextprotocol/server-brave-search'),
          tool('filesystem MCP', 'Sauvegarder extraits et références en local.', 'dev', 'Archivage', 'npx -y @modelcontextprotocol/server-filesystem .'),
          tool('github MCP', 'Versionner le corpus dans un repo dédié.', 'dev', 'Versioning', 'npx -y @modelcontextprotocol/server-github'),
        ],
      },
      {
        title: 'Analyser et synthétiser',
        role: 'analyst',
        tools: [
          tool('Claude.ai', 'Analyse croisée des sources, détection de contradictions, synthèse.', 'dev', 'Analyse', 'https://claude.ai'),
          tool('sequential-thinking MCP', 'Chaîne de raisonnement traçable pour les conclusions.', 'dev', 'Traçabilité', 'npx -y @modelcontextprotocol/server-sequential-thinking'),
          tool('Claude Code CLI', 'Automatiser la génération des rapports markdown.', 'dev', 'Automatisation', 'npm install -g @anthropic-ai/claude-code'),
        ],
      },
      {
        title: 'Restituer et diffuser',
        role: 'dev',
        tools: [
          tool('Claude Code CLI', 'Générer le rapport final structuré (markdown/HTML).', 'dev', 'Rédaction', 'npm install -g @anthropic-ai/claude-code'),
          tool('Claude.ai', 'Adapter le ton et le format au public cible.', 'dev', 'Édition', 'https://claude.ai'),
          tool('github MCP', 'Publier le rapport et collecter les retours via issues.', 'dev', 'Publication', 'npx -y @modelcontextprotocol/server-github'),
        ],
      },
    ],
    runtime_tools: [
      { name: 'brave-search MCP', purpose: 'Recherche web continue', category: 'other', install_hint: 'npx -y @modelcontextprotocol/server-brave-search', in_db: true },
    ],
  },
  {
    keywords: ['automation', 'automatiser', 'scraping', 'crawler', 'pipeline', 'script', 'batch', 'workflow'],
    summary: "Mise en place d'une automatisation : analyse du processus, développement de scripts/crawlers, orchestration et supervision.",
    architecture: 'Scripts Node.js orchestrés (cron ou CI), collecte via crawler, persistance SQLite, alerting simple.',
    tech_stack: ['Node.js', 'Crawlee', 'SQLite', 'GitHub Actions'],
    steps: [
      {
        title: 'Analyser le processus à automatiser',
        role: 'analyst',
        tools: [
          tool('Claude.ai', 'Cartographier le processus manuel et identifier les étapes automatisables.', 'dev', 'Analyse de processus', 'https://claude.ai'),
          tool('sequential-thinking MCP', 'Découper le workflow en tâches atomiques.', 'dev', 'Décomposition', 'npx -y @modelcontextprotocol/server-sequential-thinking'),
          tool('brave-search MCP', 'Identifier les APIs et sources de données disponibles.', 'dev', 'Repérage sources', 'npx -y @modelcontextprotocol/server-brave-search'),
        ],
      },
      {
        title: 'Développer les scripts',
        role: 'dev',
        tools: [
          tool('Claude Code CLI', 'Écrire les scripts de collecte/transformation avec gestion d\'erreurs et reprise.', 'dev', 'Développement', 'npm install -g @anthropic-ai/claude-code'),
          tool('filesystem MCP', 'Lecture/écriture des fichiers de données.', 'dev', 'I/O fichiers', 'npx -y @modelcontextprotocol/server-filesystem .'),
          tool('Aider', 'Itérations rapides sur les scripts en terminal.', 'dev', 'Itération', 'pip install aider-chat'),
        ],
      },
      {
        title: 'Orchestrer et planifier',
        role: 'architect',
        tools: [
          tool('Claude Code CLI', 'Configurer GitHub Actions (cron) ou un scheduler local.', 'dev', 'Orchestration', 'npm install -g @anthropic-ai/claude-code'),
          tool('github MCP', 'Gérer les workflows CI et leurs déclencheurs.', 'dev', 'CI/CD', 'npx -y @modelcontextprotocol/server-github'),
          tool('GitHub Actions', 'Exécution planifiée des jobs en production.', 'user', 'Scheduler', 'https://docs.github.com/actions', false),
        ],
      },
      {
        title: 'Superviser et fiabiliser',
        role: 'dev',
        tools: [
          tool('Claude Code CLI', 'Ajouter logs structurés, retries et alertes.', 'dev', 'Observabilité', 'npm install -g @anthropic-ai/claude-code'),
          tool('Claude.ai', 'Analyser les logs d\'échec et proposer des correctifs.', 'dev', 'Diagnostic', 'https://claude.ai'),
          tool('SQLite', 'Stocker l\'état des runs et les données collectées.', 'user', 'Persistance', 'npm install better-sqlite3', false),
        ],
      },
    ],
    runtime_tools: [
      { name: 'GitHub Actions', purpose: 'Exécution planifiée', category: 'other', install_hint: 'https://docs.github.com/actions', in_db: false },
      { name: 'SQLite', purpose: 'Persistance des runs', category: 'database', install_hint: 'npm install better-sqlite3', in_db: false },
    ],
  },
]

const DEFAULT_TEMPLATE = {
  summary: "Approche générale en quatre phases : cadrage du besoin, mise en place de l'outillage IA, réalisation itérative assistée, validation et livraison.",
  architecture: 'Architecture à définir après cadrage — privilégier une solution simple en couches avec outillage Claude pour le développement.',
  tech_stack: ['Claude Code CLI', 'Node.js', 'Git'],
  steps: [
    {
      title: 'Cadrer le besoin',
      role: 'analyst',
      tools: [
        tool('Claude.ai', "Clarifier l'objectif, les acteurs et les contraintes.", 'dev', 'Analyse fonctionnelle', 'https://claude.ai'),
        tool('sequential-thinking MCP', 'Décomposer le problème en sous-objectifs.', 'dev', 'Décomposition', 'npx -y @modelcontextprotocol/server-sequential-thinking'),
        tool('brave-search MCP', 'Explorer les solutions existantes.', 'dev', 'Veille', 'npx -y @modelcontextprotocol/server-brave-search'),
      ],
    },
    {
      title: "Préparer l'environnement",
      role: 'dev',
      tools: [
        tool('Claude Code CLI', 'Initialiser le projet et le CLAUDE.md : commande `/init`.', 'dev', 'Setup projet', 'npm install -g @anthropic-ai/claude-code'),
        tool('github MCP', 'Créer le repo et le board de suivi.', 'dev', 'Setup repo', 'npx -y @modelcontextprotocol/server-github'),
        tool('filesystem MCP', 'Accès fichiers contrôlé pour l\'agent.', 'dev', 'I/O fichiers', 'npx -y @modelcontextprotocol/server-filesystem .'),
      ],
    },
    {
      title: 'Réaliser par itérations',
      role: 'dev',
      tools: [
        tool('Claude Code CLI', 'Implémenter fonctionnalité par fonctionnalité avec tests.', 'dev', 'Développement', 'npm install -g @anthropic-ai/claude-code'),
        tool('Cursor', 'Édition IDE assistée pour les retouches fines.', 'dev', 'Édition', 'https://cursor.com'),
        tool('Aider', 'Alternative open source en terminal.', 'dev', 'Pair-programming', 'pip install aider-chat'),
      ],
    },
    {
      title: 'Valider et livrer',
      role: 'architect',
      tools: [
        tool('Claude Code CLI', 'Tests finaux, documentation et packaging.', 'dev', 'Livraison', 'npm install -g @anthropic-ai/claude-code'),
        tool('github MCP', 'PR finale et release.', 'dev', 'Release', 'npx -y @modelcontextprotocol/server-github'),
        tool('Claude.ai', 'Relecture de la documentation livrée.', 'dev', 'Documentation', 'https://claude.ai'),
      ],
    },
  ],
  runtime_tools: [],
}

function ruleBasedDecompose(goal) {
  const lower = goal.toLowerCase()
  let template = DEFAULT_TEMPLATE
  for (const t of FALLBACK_TEMPLATES) {
    if (t.keywords.some((k) => lower.includes(k))) {
      template = t
      break
    }
  }

  const inDbNames = new Set(
    db.prepare('SELECT lower(name) AS n FROM skills WHERE is_active = 1').all().map((r) => r.n)
  )

  const steps = template.steps.map((s, i) => {
    const tools = s.tools.map((t) => ({ ...t, in_db: inDbNames.has(t.name.toLowerCase()) }))
    return {
      step: i + 1,
      title: s.title,
      role: s.role,
      dev_tools: tools.filter((t) => t.type === 'dev').map((t) => t.name),
      user_tools: tools.filter((t) => t.type === 'user').map((t) => t.name),
      tools,
    }
  })

  return {
    summary: template.summary,
    architecture: template.architecture,
    tech_stack: template.tech_stack,
    analyst_notes:
      "Décomposition générée par templates (fallback sans clé API). Configurer ANTHROPIC_API_KEY pour une analyse Claude complète et contextualisée.",
    runtime_tools: template.runtime_tools,
    steps,
  }
}

/* ─── Routes ─── */

router.post('/decompose', async (c) => {
  const start = Date.now()
  const body = await c.req.json()
  const goal = (body.goal || '').trim()
  const source = body.source === 'sqlite-vector' ? 'sqlite-vector' : 'sqlite'
  if (!goal) return c.json({ error: 'goal requis' }, 400)

  const skills = source === 'sqlite-vector' ? gatherSkillsVector(goal) : gatherSkillsFts(goal)
  const promptSkills = skillsForPrompt(skills)

  let result = null
  let method = 'claude'
  const client = getClient()

  if (client) {
    try {
      const response = await client.messages.create({
        model: DECOMPOSE_MODEL,
        max_tokens: 8000,
        system: loadSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: `Objectif : ${goal}\n\nSkills disponibles :\n${JSON.stringify(promptSkills, null, 1)}`,
          },
        ],
      })
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
      result = parseClaudeJson(text)
    } catch (err) {
      console.error('[goals] échec Claude, fallback rule-based :', err.message)
      result = null
    }
  }

  if (!result) {
    result = ruleBasedDecompose(goal)
    method = 'fallback'
  }

  result.method = method
  result.runtime_ms = Date.now() - start

  goalLogs.unshift({
    id: ++logSeq,
    ts: new Date().toISOString(),
    goal,
    source,
    method,
    skills: promptSkills.map((s) => s.name),
  })
  if (goalLogs.length > 100) goalLogs.length = 100

  return c.json(result)
})

router.get('/logs', (c) => c.json(goalLogs))

router.delete('/logs', (c) => {
  goalLogs.length = 0
  return c.body(null, 204)
})

// Explication streaming (text/plain progressif)
router.post('/explain', async (c) => {
  const { goal, tool_name, tool_description, step_title } = await c.req.json()
  if (!tool_name) return c.json({ error: 'tool_name requis' }, 400)

  const client = getClient()
  const encoder = new TextEncoder()

  if (!client) {
    return c.text(
      `${tool_name} — ${tool_description || 'outil recommandé'} pour l'étape « ${step_title || '?'} ».\n\nConfigurer ANTHROPIC_API_KEY pour obtenir une explication détaillée générée par Claude.`
    )
  }

  const prompt = `Dans le cadre de l'objectif suivant : "${goal}"
À l'étape "${step_title}", l'outil suivant est recommandé : ${tool_name}
Description : ${tool_description || 'n/a'}

Explique en français, de façon concrète et opérationnelle (5-8 phrases max) :
1. Pourquoi cet outil est pertinent pour cette étape précise
2. Comment l'utiliser concrètement (commandes ou actions clés)
3. Comment il s'intègre avec le reste du workflow`

  const stream = client.messages.stream({
    model: DECOMPOSE_MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const readable = new ReadableStream({
    start(controller) {
      stream.on('text', (text) => controller.enqueue(encoder.encode(text)))
      stream.on('end', () => controller.close())
      stream.on('error', (err) => {
        controller.enqueue(encoder.encode(`\n[Erreur de streaming : ${err.message}]`))
        controller.close()
      })
    },
    cancel() {
      stream.abort()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
})

export default router
