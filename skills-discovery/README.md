# SkillsHub — Spécification technique complète

> Ce document décrit l'architecture, le fonctionnement et le code de SkillsHub avec suffisamment de détail pour **recréer l'application de zéro**.

---

## 1. Vue d'ensemble

SkillsHub est une application web de découverte et gestion de skills IA. Elle indexe plus de **6 600 outils** (Claude Code Skills, serveurs MCP, outils de coding IA) crawlés depuis GitHub, npm et des pages web. Elle propose une interface de recherche, une décomposition d'objectifs par LLM, un comparateur, des collections, et un scraper configurable.

**Deux processus** :
- `api/` — serveur Hono (Node.js 20+) sur le port 8000
- `frontend/` — app React 18 (Vite) sur le port 5173 en dev, ou servie par Hono en production

---

## 2. Stack et dépendances

### Backend (`api/package.json`)

```json
{
  "type": "module",
  "scripts": { "dev": "node --watch src/server.js" },
  "dependencies": {
    "hono": "^4.6",
    "@hono/node-server": "^1.13",
    "better-sqlite3": "^11.5",
    "@anthropic-ai/sdk": "^0.36",
    "crawlee": "^3.11.5",
    "dotenv": "^16.4.7"
  }
}
```

Toutes les importations utilisent la syntaxe ESM (`import`/`export`).  
`better-sqlite3` fournit une API **synchrone** — aucun `await` sur les requêtes SQLite.

### Frontend (`frontend/package.json`)

```json
{
  "dependencies": {
    "react": "^18.3",
    "react-dom": "^18.3",
    "react-router-dom": "^6.23",
    "axios": "^1.7",
    "react-markdown": "^10.1",
    "remark-gfm": "^4.0.1"
  },
  "devDependencies": {
    "vite": "^5.2",
    "tailwindcss": "^3.4",
    "autoprefixer": "^10",
    "postcss": "^8.4"
  }
}
```

---

## 3. Configuration de l'environnement

### `api/.env` (non commité)

```env
ANTHROPIC_API_KEY=sk-ant-...   # Requis pour Goals (Claude Opus 4) et web-segment (Claude Haiku)
GITHUB_TOKEN=ghp_...           # Rate limit API GitHub × 10 (5000 req/h)
BRAVE_API_KEY=...              # Optionnel
PORT=8000                      # Optionnel, défaut 8000
```

### `frontend/vite.config.js`

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
})
```

---

## 4. Point d'entrée backend

### `api/src/server.js`

```js
import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { app } from './app.js'
import { initDb } from './db.js'
import { initVectorDb, syncMissingVectors } from './vector-db.js'

initDb()
initVectorDb()
// Vectorise en arrière-plan les skills sans embedding
syncMissingVectors().catch(() => {})

// Sert le frontend buildé si présent
app.use('/*', serveStatic({ root: '../frontend/dist' }))

serve({ fetch: app.fetch, port: Number(process.env.PORT) || 8000 })
```

### `api/src/app.js`

```js
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import skillsRouter       from './routes/skills.js'
import searchRouter       from './routes/search.js'
import collectionsRouter  from './routes/collections.js'
import goalsRouter        from './routes/goals.js'
import comparatorRouter   from './routes/comparator.js'
import scraperRouter      from './routes/scraper.js'
import adminRouter        from './routes/admin.js'
import semanticRouter     from './routes/semantic-search.js'

export const app = new Hono()
app.use('/*', cors())

app.route('/api/skills',          skillsRouter)
app.route('/api/search',          searchRouter)
app.route('/api/collections',     collectionsRouter)
app.route('/api/goals',           goalsRouter)
app.route('/api/comparator',      comparatorRouter)
app.route('/api/scraper',         scraperRouter)
app.route('/api/admin',           adminRouter)
app.route('/api/semantic-search', semanticRouter)

app.get('/api/health', (c) => c.json({ status: 'ok', version: '2.0.0', runtime: 'node.js/hono' }))
```

---

## 5. Base de données principale (`db.js`)

### Initialisation

`initDb()` ouvre (ou crée) `skills.db` à la racine de `skills-discovery/`.  
Le chemin est calculé relativement à `server.js` : `join(__dirname, '../../skills.db')`.

### Schéma complet

```sql
-- ─── Skills ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT UNIQUE NOT NULL,
  description          TEXT,
  category             TEXT,
  source_url           TEXT,
  source_name          TEXT,
  pricing              TEXT DEFAULT 'free',
  features             TEXT,              -- JSON: ["feature 1", "feature 2"]
  install_instructions TEXT,             -- texte ou JSON {type:"web-segment",...}
  version              TEXT,
  popularity_score     REAL DEFAULT 0,
  is_active            INTEGER DEFAULT 1,
  is_favorite          INTEGER DEFAULT 0,
  readme               TEXT,
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now'))
);

-- ─── Tags (many-to-many) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS skill_tags (
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (skill_id, tag_id)
);

-- ─── FTS5 (sync via triggers) ───────────────────────────────────────────────────
CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  name, description, features,
  content='skills', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, description, features)
  VALUES (new.id, new.name, new.description, new.features);
END;
CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, description, features)
  VALUES ('delete', old.id, old.name, old.description, old.features);
  INSERT INTO skills_fts(rowid, name, description, features)
  VALUES (new.id, new.name, new.description, new.features);
END;
CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, description, features)
  VALUES ('delete', old.id, old.name, old.description, old.features);
END;

-- ─── Organisation ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS collection_skills (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  skill_id      INTEGER NOT NULL REFERENCES skills(id)      ON DELETE CASCADE,
  PRIMARY KEY (collection_id, skill_id)
);
CREATE TABLE IF NOT EXISTS favorites (
  skill_id   INTEGER PRIMARY KEY REFERENCES skills(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id   INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS skill_combinations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id_1 INTEGER REFERENCES skills(id),
  skill_id_2 INTEGER REFERENCES skills(id),
  use_case   TEXT,
  description TEXT
);

-- ─── Scraper ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scraper_configs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'generic',
  category   TEXT DEFAULT 'AI Coding Tool',
  is_active  INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS scraper_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT,
  source      TEXT,
  status      TEXT DEFAULT 'pending',  -- pending|running|paused|completed|failed|stopped
  progress    INTEGER DEFAULT 0,
  total       INTEGER DEFAULT 0,
  found       INTEGER DEFAULT 0,
  failed      INTEGER DEFAULT 0,
  logs        TEXT DEFAULT '[]',       -- JSON: [{ts, msg, level}]
  started_at  TEXT,
  paused_at   TEXT,
  finished_at TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
```

### Fonctions exportées de `db.js`

**`upsertSkill(item)`** : Insère un skill si son `name` (normalisé lowercase) n'existe pas encore. Gère les tags (INSERT OR IGNORE dans `tags`, puis `skill_tags`). Retourne l'objet inséré ou `null` si doublon.

```js
// Signature de l'objet item
{
  name, description, category, source_url, source_name,
  pricing,            // "free"|"freemium"|"paid"
  features,           // JSON string ou array
  install_instructions,
  version,
  popularity_score,
  is_active,
  readme,
  tags,               // string[] — insérés/liés automatiquement
}
```

**`appendLog(sessionId, message, level)`** : Ajoute une entrée au JSON `logs` de la session. Niveaux : `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`.

**`getInventory()`** : Retourne `{urls: Set<string>, names: Set<string>}` pour déduplication rapide en mémoire avant insertion.

### Seed data (8 skills, 12 configs)

Chargée dans `initDb()` uniquement si `SELECT COUNT(*) FROM skills` retourne 0.

**Skills de démarrage :**

| name | category | pricing | popularity_score | tags |
|------|----------|---------|-----------------|------|
| Claude Code CLI | AI Coding Tool | freemium | 9.9 | claude, cli, ai-coding, anthropic |
| Claude.ai | AI Productivity Tool | freemium | 9.8 | claude, ai, assistant, anthropic |
| sequential-thinking MCP | MCP Server | free | 8.5 | mcp, reasoning, thinking |
| brave-search MCP | MCP Server | freemium | 8.2 | mcp, search, web, brave |
| filesystem MCP | MCP Server | free | 8.7 | mcp, filesystem, files |
| github MCP | MCP Server | free | 8.8 | mcp, github, git |
| Cursor | AI Coding Tool | freemium | 9.3 | editor, ai-coding, vscode |
| Aider | AI Coding Tool | free | 8.9 | cli, ai-coding, open-source |

**Configs de crawl (12) :**
`anthropics/skills` repo · GitHub Code Search `skill.md` / `SKILL.md` · Awesome MCP Servers · topics `mcp-server` / `model-context-protocol` · npm `@modelcontextprotocol` / `mcp-server` · GitHub AI agents search (stars:>100)

---

## 6. Base vectorielle (`vector-db.js`)

Fichier `skills_vectors.db` à la racine de `skills-discovery/`.

### Schéma

```sql
CREATE TABLE skill_embeddings (
  skill_id    INTEGER PRIMARY KEY,
  tfidf_vec   TEXT,        -- JSON: {"term": score, ...} (sparse TF-IDF)
  cap_vec     TEXT,        -- JSON: [float × 40] (espace de capacités)
  text_snip   TEXT,        -- extrait du texte vectorisé
  embedded_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE corpus_vocab (term TEXT PRIMARY KEY, doc_freq INTEGER DEFAULT 1);
CREATE TABLE corpus_meta  (key TEXT PRIMARY KEY, value TEXT);  -- doc_count
```

### Espace de capacités (40 dimensions)

```js
const CAPABILITY_DIMS = [
  'code-generation', 'code-review', 'code-refactor', 'code-debug',
  'github', 'git', 'repository', 'version-control',
  'database', 'sql', 'query', 'schema',
  'cli', 'terminal', 'command', 'shell',
  'mcp-server', 'tool-use', 'function-calling', 'agent',
  'search', 'web', 'browser', 'scraping',
  'file-system', 'file-read', 'file-write', 'directory',
  'api', 'rest', 'http', 'webhook',
  'testing', 'deployment', 'ci-cd', 'docker',
  'documentation', 'markdown', 'writing', 'translation',
]
```

Pour chaque skill, le cap_vec est calculé en comptant les occurrences des termes de chaque dimension dans le texte du skill (pas d'appel LLM — calculé localement).

### Score de similarité

```
score = 0.65 × cosine_similarity(tfidf_query, tfidf_skill)
      + 0.35 × cosine_similarity(cap_query,   cap_skill)
```

### Fonctions exportées

**`upsertSkillVector(skill, item, tags)`** : Vectorise un skill et l'insère dans `skill_embeddings`. Met à jour `corpus_vocab` et `corpus_meta.doc_count`.

**`semanticSearch(query, topK)`** : Vectorise la requête, calcule les scores combinés contre tous les skills actifs, retourne les `topK` meilleurs avec `{skill_id, name, description, category, score, match_type}`.

Types de correspondance : `"direct"` (score ≥ 70 % du max) · `"building_block"` (30–70 %) · `"enhancement"` (< 30 %)

**`syncMissingVectors()`** : Vectorise tous les skills actifs sans embedding. Lancé au démarrage du serveur en arrière-plan.

---

## 7. Routes API

### `routes/skills.js`

```
GET  /api/skills                → liste paginée (page, page_size)
GET  /api/skills/:id            → détail avec tags, notes, is_favorite
POST /api/skills                → créer
PUT  /api/skills/:id            → modifier
DELETE /api/skills/:id          → supprimer
PATCH /api/skills/:id/active    → toggle is_active {is_active: 0|1}
POST /api/skills/:id/favorite   → toggle favori (INSERT/DELETE favorites)
POST /api/skills/:id/notes      → ajouter note {content}
DELETE /api/skills/:id/notes/:noteId → supprimer note
GET  /api/skills/:id/combinations → combinaisons depuis skill_combinations
```

Le détail skill joint `tags`, `user_notes`, et `favorites` en une seule réponse JSON.

### `routes/search.js`

```
GET /api/search/search
  ?q=query          → term + " *" dans skills_fts MATCH
  ?category=X       → filtre exact sur skills.category
  ?pricing=X        → filtre exact sur skills.pricing
  ?tags=a,b,c       → JOIN skill_tags WHERE tags.name IN (...)
  ?page=1           → pagination (défaut 20 par page)
  ?page_size=20

GET /api/search/categories   → SELECT DISTINCT category FROM skills WHERE is_active=1
GET /api/search/tags         → tags avec COUNT(skill_id) > 0, triés par fréquence
```

La requête FTS5 complète :

```sql
SELECT s.* FROM skills s
JOIN skills_fts fts ON s.id = fts.rowid
WHERE fts MATCH ? AND s.is_active = 1
  [AND s.category = ?]
  [AND s.pricing = ?]
  [AND s.id IN (SELECT skill_id FROM skill_tags st JOIN tags t ON st.tag_id=t.id WHERE t.name IN (...))]
ORDER BY rank LIMIT ? OFFSET ?
```

### `routes/collections.js`

```
GET  /api/collections
GET  /api/collections/:id        → avec skills inclus
POST /api/collections            → {name, description}
PUT  /api/collections/:id
DELETE /api/collections/:id
POST /api/collections/:id/skills/:skillId   → INSERT INTO collection_skills
DELETE /api/collections/:id/skills/:skillId → DELETE FROM collection_skills
GET  /api/collections/favorites/list        → skills avec is_favorite=1
```

### `routes/goals.js`

**Logique de décomposition (`POST /api/goals/decompose`) :**

```
1. Validation : goal requis, source = "sqlite" (défaut) | "sqlite-vector"

2. Récupération des skills (is_active = 1) :
   - source "sqlite"        → FTS5 MATCH sur mots du goal + skills récents (25-60 skills)
   - source "sqlite-vector" → semanticSearch(goal, 40)

3. Construction du prompt :
   - system = contenu de skills-discovery/CLAUDE.md (persona expert IT)
   - user   = "Objectif : {goal}\n\nSkills disponibles :\n{JSON skills}"

4. Appel Claude Opus 4 :
   client.messages.create({
     model: 'claude-opus-4-8',
     max_tokens: 8000,
     system: systemPrompt,
     messages: [{role: 'user', content: userPrompt}]
   })

5. Parsing JSON de la réponse (strip markdown wrapper si présent)

6. Fallback rule-based si pas d'API key ou erreur :
   - Détection par mots-clés dans le goal (api, frontend, mobile, research, automation…)
   - Templates prédéfinis avec noms de skills exacts

7. Log en mémoire : {id, ts, goal, source, method, skills[]}
```

**Streaming explication (`POST /api/goals/explain`) :**

```js
// Corps : {goal, tool_name, tool_description, step_title}
// Réponse : text/plain en stream (ReadableStream SSE)
const stream = await client.messages.stream({
  model: 'claude-opus-4-8',
  max_tokens: 1500,
  messages: [{role: 'user', content: promptExplication}]
})
return new Response(stream, { headers: {'Content-Type': 'text/plain'} })
```

### `routes/comparator.js`

```
POST /api/comparator   {skill_ids: [1, 2, 3]}
```

Retourne :

```json
{
  "skills": [{id, name, category, pricing, popularity_score, tags, features}],
  "feature_matrix": {
    "Feature X": {1: true, 2: false, 3: true},
    "Feature Y": {1: true, 2: true,  3: false}
  },
  "tag_matrix": {
    "tag-a": {1: true, 2: true,  3: false},
    "tag-b": {1: false, 2: true, 3: true}
  }
}
```

`feature_matrix` : union de tous les tableaux `features` (parsés comme JSON) des skills sélectionnés.
`tag_matrix` : union de tous les tags.

### `routes/scraper.js`

**Configs (CRUD standard)** : `GET /configs`, `POST /configs`, `PUT /configs/:id`, `DELETE /configs/:id`

**Sessions lifecycle :**

```
POST /sessions          {config_id} → crée session + lance runSession() en arrière-plan
POST /sessions/:id/pause   → _pauseFlags.set(id, true), status='paused'
POST /sessions/:id/resume  → _pauseFlags.set(id, false), status='running'
POST /sessions/:id/stop    → _stopFlags.set(id, true)
DELETE /sessions/:id
POST /sessions/clear-all   → DELETE WHERE status IN ('completed','failed','stopped')
```

**`runSession(sid, cfg)` :**

```js
// Callbacks passés aux crawlers
const onSkill = async (item) => {
  // Vérifie doublons (nom + URL) en mémoire d'abord
  // upsertSkill(item) → insère si nouveau
  // upsertSkillVector(added, item, tags) en fire-and-forget
  // Met à jour progress + found en DB
}
const onLog   = (msg, level) => appendLog(sid, msg, level)
const onTotal = (n) => db.prepare('UPDATE scraper_sessions SET total=?').run(n, sid)
const onFail  = (msg) => { failed++; appendLog(sid, `✗ ${msg}`) }
const onSkip  = () => { progress++; db.prepare('UPDATE ... SET progress=?').run(progress, sid) }
const checkStop = () => !!_stopFlags.get(sid)

// Dispatch selon cfg.type
switch (cfg.type) {
  case 'github-awesome':     await crawlGithubAwesome(cfg, ctx);     break
  case 'github-search':      await crawlGithubSearch(cfg, ctx);      break
  case 'github-skill-files': await crawlGithubSkillFiles(cfg, ctx);  break
  case 'github-skill-repo':  await crawlGithubSkillRepo(cfg, ctx);   break
  case 'github-agent-files': await crawlGithubAgentFiles(cfg, ctx);  break
  case 'github-agent-repo':  await crawlGithubAgentRepo(cfg, ctx);   break
  case 'npm':                await crawlNpm(cfg, ctx);                break
  case 'generic':            await crawlGeneric(cfg, ctx);            break
  case 'web-segment':        await crawlWebSegment(cfg, ctx);         break
}
```

### `routes/semantic-search.js`

```
POST /api/semantic-search/objective   {objective, top_k?}
GET  /api/semantic-search/objective   ?q=...&top_k=10
POST /api/semantic-search/sync        → appelle syncMissingVectors()
```

### `routes/admin.js`

```
GET  /admin/db-info           → chemin, taille, version SQLite, comptages par table
GET  /admin/tables/:table     → vue paginée ?page=1&size=50&search=
                                  tables autorisées : skills, tags, skill_tags, collections,
                                  collection_skills, favorites, user_notes, skill_combinations,
                                  scraper_configs, scraper_sessions
POST /admin/purge-sessions    → DELETE skills WHERE source_name != 'Web' AND source_name != 'Seed'
                                  + DELETE scraper_sessions
GET  /admin/status            → {pid, uptime, memory, managed: !!process.send}
POST /admin/restart           → {target: "api"|"frontend"|"all"}
                                  process.send({action:'restart', target}) si managed
                                  sinon process.exit(75) pour restart auto
```

---

## 8. Crawlers

### `crawlers/github.js`

**`crawlGithubAwesome(config, ctx)`** :
1. Fetch README.md du repo `config.url` (GitHub API ou raw)
2. Extrait tous les liens markdown `[name](url)`
3. Pour chaque lien GitHub valide : fetch README du repo cible
4. Parse nom, description, tags depuis le README
5. Appelle `ctx.onSkill(item)`

**`crawlGithubSearch(config, ctx)`** :
1. `GET https://api.github.com/search/repositories?q=config.url&sort=stars`
2. Pour chaque repo : fetch README, extrait infos
3. Batch fetch README en parallèle (15 items)

### `crawlers/github-skills.js`

**`parseSkillMarkdown(content)`** :
```js
// Retourne {skill, reason}
// skill = null si rejeté
// Valide :
//   - Frontmatter YAML délimité par ---
//   - Champ name présent
//   - description.length >= 15
//   - body (hors frontmatter).length >= 30
```

**`crawlGithubSkillRepo(config, ctx)`** :
1. GitHub Trees API : `GET /repos/{owner}/{repo}/git/trees/HEAD?recursive=1`
2. Filtre les fichiers `skill.md` / `SKILL.md`
3. Fetch raw content de chaque fichier (batch 15)
4. `parseSkillMarkdown()` → `onSkill()` si valide

**`crawlGithubSkillFiles(config, ctx)`** :
1. GitHub Code Search : `GET /search/code?q=filename:skill.md+{query}`
2. Pour chaque résultat : fetch raw content
3. `parseSkillMarkdown()` → `onSkill()`

**`crawlGithubAgentRepo` / `crawlGithubAgentFiles`** : idem pour `agents.md`

### `crawlers/npm.js`

```js
export async function crawlNpm(config, ctx) {
  const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${query}&size=100`)
  const { objects } = await res.json()
  for (const {package: pkg} of objects) {
    ctx.onSkill({
      name:             pkg.name,
      description:      pkg.description,
      source_url:       `https://www.npmjs.com/package/${pkg.name}`,
      category:         config.category,
      pricing:          'free',
      popularity_score: Math.min(pkg.score?.final * 10, 9.9) || 0,
      tags:             pkg.keywords || [],
    })
  }
}
```

### `crawlers/generic.js`

`CheerioCrawler` avec `maxRequestsPerCrawl: 100`, suit les liens internes (même domaine).

**Stratégie 1 — GitHub blob URL** : détecte l'URL `github.com/{owner}/{repo}/blob/{branch}/{file}.md`, reconstruit l'URL raw, fetch et parse avec `parseSkillMarkdown()`.

**Stratégie 2 — Markdown embarqué** : cherche `<pre>` ou `<code>` dont le texte commence par `---` (frontmatter YAML), parse avec `parseSkillMarkdown()`.

**Stratégie 3 — Meta tags HTML (fallback)** :
```js
{
  name:        $('meta[property="og:title"]').attr('content') || $('title').text(),
  description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content'),
  tags:        $('meta[name="keywords"]').attr('content').split(',').map(trim),
  pricing:     detectPricing($('body').text()),  // regex open-source / free tier / subscription
}
```

### `crawlers/web-segment.js`

Pipeline LLM-powered pour segmenter n'importe quelle page web en skills :

```
┌─────────────────────────────────────────────────────────┐
│ 1. CheerioCrawler charge la page (1 req max, 30s)       │
│ 2. Supprime nav/header/footer/aside/script/style        │
│ 3. extractSections($) :                                  │
│    a. Headings h2/h3/h4 → section = heading + nextUntil │
│    b. Fallback : article/section si pas de headings     │
│    c. Sélecteur CSS : #id > #id-ancêtre > nth-of-type   │
│ 4. Pour chaque section :                                 │
│    a. heuristicScore(text) — mots-clés + listes + code  │
│    b. Si score < 2 : onSkip() et continuer              │
│    c. Si score ≥ 2 : appel Claude Haiku                 │
│       → JSON {is_skill, confidence, name, description,  │
│               inputs, steps, output, category, tags}    │
│    d. Si confidence < 0.65 : onSkip()                   │
│    e. Sinon : onSkill() avec install_instructions JSON  │
└─────────────────────────────────────────────────────────┘
```

**Mots-clés heuristiques :**
`how to`, `step `, `steps`, `tutorial`, `guide`, `walkthrough`, `install`, `setup`, `configure`, `initialize`, `init`, `input`, `output`, `generate`, `create`, `build`, `command`, `cli`, `api `, `function`, `method`, `run `, `execute`, `invoke`, `deploy`, `parameter`, `argument`, `option`, `flag`, `workflow`, `automation`, `task`, `procedure`, `npm `, `npx `, `pip `, `docker `, `curl `

**Score heuristique :**
- +1 par mot-clé trouvé
- +1 par ligne de liste numérotée (max +3)
- +2 si blocs de code (``` ou `inline`)
- +1 si pattern `$ commande` ou `npm`/`npx`

**Modèle LLM :** `claude-haiku-4-5-20251001`, `max_tokens: 900`

**Stockage du résultat dans `install_instructions` :**
```json
{
  "type": "web-segment",
  "selector": "#installation",
  "confidence": 0.87,
  "inputs": ["Node.js 18+", "npm token"],
  "steps": ["npm install X", "Configure .env", "npm run dev"],
  "output": "Service running on port 3000"
}
```

---

## 9. Frontend — Détail des pages

### `Home.jsx`

**State :** `query`, `filters` (`{category, pricing, tags[]}`), `results[]`, `loading`, `comparatorIds[]` (depuis localStorage)

**Flux :**
1. `useEffect` sur `query`+`filters` → `api.searchSkills(query, filters)`
2. Grille de `<SkillCard>` avec toggle favori (`api.toggleFavorite(id)`) et bouton comparateur
3. Persistance comparateur : `localStorage.setItem('skillsHub_comparator', JSON.stringify(ids))`
4. Limit 3 IDs dans le comparateur — badge flottant avec lien vers `/comparator`

### `SkillDetail.jsx`

**State :** `skill`, `notes[]`, `collections[]`, `selectedCollection`, `inComparator`

**Détection web-segment :**
```js
let webSegMeta = null
try {
  const parsed = JSON.parse(skill.install_instructions)
  if (parsed.type === 'web-segment' && parsed.selector) webSegMeta = parsed
} catch {}
```

**Panneau web-segment** (si `webSegMeta`) :
- Sélecteur CSS en `<code>`
- Barre de confiance (%)
- Liste inputs + output
- Lien "Voir la section source" : `source_url + (selector.startsWith('#') ? selector : '')`

**Sinon** : bloc `<pre>` standard pour `install_instructions`

### `Goals.jsx`

**State :** `goal`, `source` ("sqlite" | "sqlite-vector"), `result`, `loading`, `explainTool` (pour ExplainDrawer)

**Appel :** `POST /api/goals/decompose {goal, source}`

**Affichage du résultat :**
```
Pour chaque step dans result.steps :
  - Titre + rôle badge
  - Liste des tools avec nom, description, install_hint
  - Bouton "Expliquer" → ouvre ExplainDrawer
```

**ExplainDrawer :**
```js
const res = await fetch('/api/goals/explain', {
  method: 'POST',
  body: JSON.stringify({goal, tool_name, tool_description, step_title})
})
const reader = res.body.getReader()
// Lecture du stream et affichage progressif
```

### `Scraper.jsx`

**`CRAWLER_TYPES` (dans le composant) :**
```js
const CRAWLER_TYPES = [
  {value:'github-skill-repo',  label:'GitHub — repo de skills (Trees API)',       group:'Skills'},
  {value:'github-skill-files', label:'GitHub — recherche skill.md (code search)', group:'Skills'},
  {value:'github-agent-repo',  label:"GitHub — repo d'agents (Trees API)",        group:'Agents'},
  {value:'github-agent-files', label:'GitHub — recherche agents.md (code search)',group:'Agents'},
  {value:'github-awesome',     label:'GitHub Awesome List',                        group:'Général'},
  {value:'github-search',      label:'GitHub Search',                              group:'Général'},
  {value:'npm',                label:'npm Registry',                               group:'Général'},
  {value:'web-segment',        label:'Segmentation web IA (LLM)',                  group:'Web IA'},
  {value:'generic',            label:'Page web générique (basique, sans IA)',      group:'Web IA'},
]
```

**Type par défaut du formulaire** : `web-segment`

**Bannière teal** quand `web-segment` sélectionné :
```jsx
{form.type === 'web-segment' && (
  <div className="flex items-start gap-2 bg-teal-950 border border-teal-800 rounded-lg px-3 py-2 text-xs text-teal-300">
    <span>✦</span>
    <span>Segmentation IA — chaque section analysée par Claude Haiku.
          Requiert <code>ANTHROPIC_API_KEY</code>.</span>
  </div>
)}
```

**Monitoring session :** polling toutes les 2 s quand une session est `running` ou `paused`.  
Affiche : barre de progression `(progress/total)%`, compteurs `found`/`failed`, logs filtrables.

### `Crud.jsx`

Accessible via `/crud` (hors navbar). Utilise `GET /admin/tables/:table` pour afficher et naviguer dans toutes les tables. Toggle `is_active` via `PATCH /api/skills/:id/active`. Boutons restart via `POST /admin/restart`.

---

## 10. Frontend — Composants

### `SkillCard.jsx`

```jsx
// Props : skill, onFavoriteToggle, onComparatorToggle, inComparator
// Badge catégorie coloré :
// "Claude Code Skill"    → bg-purple-900 text-purple-300
// "MCP Server"           → bg-blue-900   text-blue-300
// "AI Coding Tool"       → bg-green-900  text-green-300
// "AI Productivity Tool" → bg-orange-900 text-orange-300
// "Software"             → bg-gray-700   text-gray-300
```

### `SearchBar.jsx`

Inputs : texte libre + select catégorie + select pricing + input tags (séparés par virgule).

### `MarkdownContent.jsx`

```jsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownContent({ content }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
}
```

---

## 11. Client API (`api.js`)

```js
import axios from 'axios'
const api = axios.create({ baseURL: '/api' })

export const searchSkills = (q, filters) =>
  api.get('/search/search', { params: { q, ...filters } }).then(r => r.data)

export const getSkill = (id) =>
  api.get(`/skills/${id}`).then(r => r.data)

export const toggleFavorite = (id) =>
  api.post(`/skills/${id}/favorite`).then(r => r.data)

export const setSkillActive = (id, isActive) =>
  api.patch(`/skills/${id}/active`, { is_active: isActive ? 1 : 0 }).then(r => r.data)

export const decomposeGoal = (goal, source = 'sqlite') =>
  api.post('/goals/decompose', { goal, source }).then(r => r.data)

export const compareSkills = (ids) =>
  api.post('/comparator', { skill_ids: ids }).then(r => r.data)

export const startSession = (configId) =>
  api.post('/scraper/sessions', { config_id: configId }).then(r => r.data)

export const syncVectorDb = () =>
  api.post('/semantic-search/sync').then(r => r.data)

// ... autres méthodes : addNote, deleteNote, createCollection, addToCollection,
//     getAdminDbInfo, getAdminTable, purgeSessionData, etc.
```

---

## 12. Router React (`App.jsx`)

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar      from './components/Navbar'
import Home        from './pages/Home'
import SkillDetail from './pages/SkillDetail'
import Goals       from './pages/Goals'
import GoalsLog    from './pages/GoalsLog'
import Collections from './pages/Collections'
import Comparator  from './pages/Comparator'
import Scraper     from './pages/Scraper'
import Crud        from './pages/Crud'

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/"            element={<Home />} />
        <Route path="/skills/:id"  element={<SkillDetail />} />
        <Route path="/goals"       element={<Goals />} />
        <Route path="/goals/log"   element={<GoalsLog />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/comparator"  element={<Comparator />} />
        <Route path="/scraper"     element={<Scraper />} />
        <Route path="/crud"        element={<Crud />} />
      </Routes>
    </BrowserRouter>
  )
}
```

---

## 13. Process manager (`scripts/manager.js`)

```js
// Lance api/ et frontend/ comme processus enfants
// IPC : si l'API envoie process.send({action:'restart', target:'api'|'frontend'|'all'})
//       le manager tue et relance le(s) processus cible(s)
// Auto-restart : exit code 0 ou 75 → relance après 1 s
//                exit code 1        → arrêt définitif
// Logs préfixés : [HH:MM:SS] [api] message
//                 [HH:MM:SS] [frontend] message
```

---

## 14. Thème et classes TailwindCSS récurrentes

| Usage | Classes |
|-------|---------|
| Fond de page | `bg-gray-900 min-h-screen` |
| Cartes / panels | `bg-gray-800 rounded-lg border border-gray-700` |
| Texte principal | `text-gray-100` |
| Texte secondaire | `text-gray-400` |
| Inputs | `bg-gray-700 border-gray-600 text-gray-100 rounded px-3 py-2` |
| Bouton primaire | `bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded` |
| Bouton danger | `bg-red-600 hover:bg-red-500 text-white` |
| Badge success | `bg-green-900 text-green-300` |
| Badge info | `bg-teal-900 text-teal-300` |
| Lien navbar actif | `text-blue-400 border-b-2 border-blue-400` |

---

## 15. Variables d'environnement complètes

| Variable | Valeur exemple | Obligatoire | Usage |
|----------|---------------|-------------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Non (dégradé) | `goals.js` (Claude Opus 4) + `web-segment.js` (Claude Haiku) |
| `GITHUB_TOKEN` | `ghp_xxxx` | Recommandé | Tous les crawlers GitHub (augmente le rate limit de 60 à 5000 req/h) |
| `BRAVE_API_KEY` | `BSA-xxxx` | Non | Futur usage dans goals.js |
| `PORT` | `8000` | Non | Port du serveur Hono |

---

## 16. Déploiement Vercel

`api/vercel.json` :
```json
{
  "version": 2,
  "builds": [{"src": "index.js", "use": "@vercel/node"}],
  "routes": [{"src": "/(.*)", "dest": "index.js"}]
}
```

`api/index.js` : exporte le handler Hono pour Vercel serverless.

`frontend/vercel.json` : configuration SPA (rewrites vers `index.html`).

---

## 17. Points d'attention pour la recréation

1. **Chemin des bases de données** : `skills.db` et `skills_vectors.db` sont à la racine de `skills-discovery/`, calculé relativement depuis `api/src/server.js` avec `join(__dirname, '../../skills.db')`.

2. **Seed data déclenchée une seule fois** : `IF (SELECT COUNT(*) FROM skills) = 0`. Pour re-seeder, supprimer `skills.db`.

3. **FTS5 shadow tables** : ne pas les exposer dans l'admin (noms `skills_fts_*`). Les filtrer avec `WHERE name NOT LIKE 'skills_fts%'`.

4. **Fallback rule-based** dans `goals.js` : utilise des noms exacts de skills. Mettre à jour si un skill est renommé.

5. **`web-segment` : 1 seule page** (`maxRequestsPerCrawl: 1`). `generic` : jusqu'à 100 pages.

6. **Comparateur localStorage** : clé `skillsHub_comparator`, tableau JSON de 0 à 3 IDs entiers.

7. **`install_instructions` dual-usage** : texte libre OU JSON `{type:"web-segment",...}`. SkillDetail doit gérer les deux cas avec `try/catch` sur `JSON.parse`.

8. **Log de session Goals** : stocké en mémoire uniquement (tableau module-level dans `goals.js`). Perdu au redémarrage.

9. **`process.send` IPC** : disponible seulement quand lancé par `manager.js` (sinon `process.send` est `undefined`). L'admin route vérifie `!!process.send` pour exposer `managed: true`.

10. **ESM strict** : pas de `__dirname` natif. Utiliser `fileURLToPath(import.meta.url)` + `dirname()`.
```js
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
```

---

## 18. Roadmap

### Priorité haute — Workflows

```sql
CREATE TABLE workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  goal TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE workflow_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id),
  step_order INTEGER NOT NULL,
  instructions TEXT
);
```

- `GET/POST/PUT/DELETE /api/workflows`
- `GET/POST/DELETE /api/workflows/:id/steps`
- Page `/workflows` : liste + éditeur drag-and-drop
- Bouton "Sauvegarder comme Workflow" dans `Goals.jsx`
- Section "Workflows suggérés" dans `SkillDetail.jsx`

### Priorité haute — Export

```
GET /api/export?ids=1,2,3&format=json|csv|markdown
```

Bouton "Exporter la sélection" dans `Collections.jsx` et `Home.jsx`.

### Priorité moyenne

- **Score dynamique** : cron/re-crawl qui fetch `GET /repos/{owner}/{repo}` et met à jour `popularity_score`
- **Champs riches Goals** : afficher `architecture`, `tech_stack`, `analyst_notes` dans `Goals.jsx`
- **Pagination vectorielle** : exposer `offset` + `total` dans semantic-search
