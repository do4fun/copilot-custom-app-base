# SkillsHub — AI Skills Discovery

Application web de **découverte, recherche et gestion** de skills IA, serveurs MCP et outils de développement. Propulsée par Claude AI (Anthropic).

## Vue d'ensemble

SkillsHub centralise plus de **6 600 outils IA** crawlés automatiquement depuis GitHub, npm et le web. Elle permet de rechercher, comparer, annoter et organiser ces outils, et d'obtenir une décomposition structurée de tout objectif technique en étapes + recommandations d'outils.

L'application est composée de deux parties :
- `skills-discovery/api/` — Backend **Node.js / Hono** sur le port 8000
- `skills-discovery/frontend/` — Frontend **React 18 / Vite / TailwindCSS** sur le port 5173

---

## Fonctionnalités

### Recherche et découverte
- **Full-text search SQLite FTS5** sur nom, description, features et tags, avec correspondance préfixe
- **Filtres combinables** : catégorie (`Claude Code Skill`, `MCP Server`, `AI Coding Tool`, `AI Productivity Tool`, `Software`), prix (`free` / `freemium` / `paid`), tags libres
- **Recherche sémantique vectorielle** : TF-IDF sparse + espace de capacités 40 dimensions, score combiné 65 % TF-IDF / 35 % capability space
- Pagination 20 résultats/page, tri par popularité

### Décomposition de but (Goals)
- Saisie d'un objectif en langage naturel
- Appel **Claude Opus 4** avec persona expert IT sénior (analyste, architecte, développeur)
- Réponse structurée : `summary`, `architecture`, `tech_stack`, `analyst_notes`, `runtime_tools`, `steps[]` (chaque étape avec `dev_tools` et `user_tools`)
- **Deux sources** : FTS5 SQLite ou recherche vectorielle sémantique
- **Fallback rule-based** sans clé API (templates par mots-clés)
- **ExplainDrawer** : panneau latéral avec explication contextuelle en streaming pour chaque outil suggéré
- **Log de session** : historique des décompositions avec la liste des skills proposés au LLM

### Collections et organisation
- **Favoris** : toggle par skill depuis la grille ou le détail
- **Collections** : groupes nommés multi-skills avec description
- **Notes personnelles** : annotations libres par skill, persistantes en base
- **Combinaisons** : associations de skills compatibles avec description d'usage

### Comparateur
- Sélection de 2 à 3 skills depuis n'importe quelle page
- État persisté en `localStorage` (clé `skillsHub_comparator`)
- **Feature matrix** : grille features × skills avec coches
- **Tag matrix** : tags partagés et spécifiques

### Scraper (crawl automatique)
9 types de sources configurables, pilotés via l'interface :

| Type | Source | IA requise |
|------|--------|-----------|
| `github-skill-repo` | Repo GitHub complet via Trees API | Non |
| `github-skill-files` | GitHub Code Search (skill.md) | Non |
| `github-agent-repo` | Repo GitHub agents via Trees API | Non |
| `github-agent-files` | GitHub Code Search (agents.md) | Non |
| `github-awesome` | Liste Awesome GitHub | Non |
| `github-search` | Recherche GitHub topic/keyword | Non |
| `npm` | Registry npm (`/v1/search`) | Non |
| `web-segment` | Segmentation IA d'une page web | **Claude Haiku** |
| `generic` | Crawler HTML générique (méta + markdown) | Non |

Sessions de crawl : démarrage, pause, reprise, arrêt · Logs en temps réel filtrables par niveau · Déduplication automatique par nom et URL · Vectorisation automatique des nouveaux skills.

### Administration (Admin DB)
- Vue directe sur toutes les tables SQLite (pagination + recherche)
- Toggle `is_active` par skill (masque dans search, goals, vecteurs)
- Informations système (PID, RAM, uptime, mode managed)
- Purge des sessions et skills crawlés
- Restart API / Frontend via IPC

---

## Stack technique

| Couche | Technologie | Version |
|--------|-------------|---------|
| Runtime backend | Node.js | 20+ |
| Framework backend | Hono + @hono/node-server | 4.6 / 1.13 |
| Base de données | SQLite + FTS5 (better-sqlite3) | 11.5 |
| Base vectorielle | SQLite custom (TF-IDF + 40D) | — |
| Web crawler | Crawlee (CheerioCrawler) | 3.11.5 |
| IA décomposition | Claude Opus 4 (`claude-opus-4-8`) | — |
| IA segmentation web | Claude Haiku (`claude-haiku-4-5-20251001`) | — |
| SDK Anthropic | @anthropic-ai/sdk | 0.36 |
| Framework frontend | React 18 + Vite | 18.3 / 5.2 |
| CSS | TailwindCSS | 3.4 |
| Client HTTP | Axios | 1.7 |
| Rendu markdown | react-markdown + remark-gfm | 10.1 / 4.0 |

---

## Architecture

```
copilot-custom-app-base/
└── skills-discovery/               ← projet principal
    ├── api/                        ← Backend Node.js/Hono
    │   ├── src/
    │   │   ├── app.js              # App Hono : CORS ('*'), montage /api/*
    │   │   ├── server.js           # Point d'entrée : init DB + vecteurs + sync, static, port 8000
    │   │   ├── db.js               # Schéma SQLite, FTS5, triggers, seed 8 skills + 12 configs, upsertSkill
    │   │   ├── vector-db.js        # TF-IDF + espace 40D capability, cosine similarity, semanticSearch
    │   │   ├── routes/
    │   │   │   ├── skills.js       # GET/POST/PUT/DELETE + PATCH /active + POST /favorite + /notes + /combinations
    │   │   │   ├── search.js       # FTS5 MATCH préfixe + /categories + /tags
    │   │   │   ├── collections.js  # Collections CRUD + /favorites/list
    │   │   │   ├── goals.js        # POST /decompose (Claude Opus 4) + GET/DELETE /logs + POST /explain (SSE)
    │   │   │   ├── comparator.js   # POST / → {skills, feature_matrix, tag_matrix}
    │   │   │   ├── scraper.js      # Configs CRUD + Sessions lifecycle (start/pause/stop) + runner async
    │   │   │   ├── semantic-search.js # POST /objective + POST /sync
    │   │   │   └── admin.js        # db-info + tables/:t + purge-sessions + status + restart
    │   │   └── crawlers/
    │   │       ├── github.js       # crawlGithubAwesome + crawlGithubSearch
    │   │       ├── github-skills.js # parseSkillMarkdown + crawlGithubSkill/AgentFiles/Repo
    │   │       ├── npm.js          # crawlNpm
    │   │       ├── generic.js      # crawlGeneric (3 stratégies, 100 req max, même domaine)
    │   │       └── web-segment.js  # crawlWebSegment (heuristique + Claude Haiku, 1 page)
    │   ├── package.json
    │   ├── .env                    # ANTHROPIC_API_KEY, GITHUB_TOKEN, BRAVE_API_KEY (non commité)
    │   ├── index.js                # Handler Vercel serverless
    │   └── vercel.json
    ├── frontend/                   ← Frontend React/Vite
    │   ├── src/
    │   │   ├── pages/
    │   │   │   ├── Home.jsx        # Recherche + grille + favoris + sélection comparateur
    │   │   │   ├── SkillDetail.jsx # Détail + notes + collections + panneau web-segment
    │   │   │   ├── Goals.jsx       # Décomposition + ExplainDrawer streaming
    │   │   │   ├── GoalsLog.jsx    # Historique sessions (polling 2s)
    │   │   │   ├── Collections.jsx # Favoris + collections CRUD
    │   │   │   ├── Comparator.jsx  # Tableau feature_matrix + tag_matrix
    │   │   │   ├── Scraper.jsx     # Config + monitoring sessions en temps réel
    │   │   │   └── Crud.jsx        # Admin DB (hors navbar)
    │   │   ├── components/
    │   │   │   ├── Navbar.jsx
    │   │   │   ├── SearchBar.jsx
    │   │   │   ├── SkillCard.jsx
    │   │   │   ├── MarkdownContent.jsx
    │   │   │   └── TagBadge.jsx
    │   │   ├── api.js              # Client Axios (baseURL: /api)
    │   │   ├── App.jsx             # Router React (react-router-dom v6)
    │   │   └── main.jsx            # Point d'entrée React
    │   ├── vite.config.js          # Proxy /api → http://localhost:8000
    │   ├── tailwind.config.js
    │   └── vercel.json
    ├── scripts/
    │   └── manager.js              # Process manager : API + Frontend, IPC, restart auto
    ├── CLAUDE.md                   # Prompt système LLM (persona expert IT) — chargé par goals.js
    ├── README.md                   # Ce fichier
    ├── skills.db                   # Base SQLite principale (FTS5) — créée au runtime
    └── skills_vectors.db           # Base vectorielle — créée au runtime
```

---

## Installation

### Prérequis
- Node.js 20+
- npm 10+

### 1. Installer les dépendances

```bash
# Backend
cd skills-discovery/api
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configurer les variables d'environnement

Créer `skills-discovery/api/.env` :

```env
# Requis pour la décomposition Goals et le crawler web-segment
ANTHROPIC_API_KEY=sk-ant-...

# Recommandé — multiplie par 10 le taux d'appels GitHub (5000 req/h)
GITHUB_TOKEN=ghp_...

# Optionnel
BRAVE_API_KEY=...
```

### 3. Lancer l'application

```bash
# Option A — Process manager (recommandé)
cd skills-discovery
node scripts/manager.js

# Option B — Séparément
# Terminal 1
cd skills-discovery/api && npm run dev    # → http://localhost:8000

# Terminal 2
cd skills-discovery/frontend && npm run dev  # → http://localhost:5173
```

La base `skills.db` est créée automatiquement au premier démarrage avec **8 skills** de seed et **12 configs de crawl** pré-chargées.

### 4. Build production (frontend servi par l'API)

```bash
cd skills-discovery/frontend
npm run build
# → dist/ chargé par Hono, accessible sur http://localhost:8000
```

---

## API — Référence complète

**Base URL :** `http://localhost:8000/api`

### Skills

| Méthode | Endpoint | Corps / Paramètres | Description |
|---------|----------|--------------------|-------------|
| GET | `/skills` | `?page=1&page_size=20` | Liste paginée |
| GET | `/skills/:id` | — | Détail avec tags, notes, is_favorite |
| POST | `/skills` | `{name, description, category, ...}` | Créer |
| PUT | `/skills/:id` | `{name, description, ...}` | Modifier |
| DELETE | `/skills/:id` | — | Supprimer |
| PATCH | `/skills/:id/active` | `{is_active: 0\|1}` | Toggle visibilité globale |
| POST | `/skills/:id/favorite` | — | Toggle favori |
| POST | `/skills/:id/notes` | `{content}` | Ajouter une note |
| DELETE | `/skills/:id/notes/:noteId` | — | Supprimer une note |
| GET | `/skills/:id/combinations` | — | Combinaisons compatibles |

### Recherche

| Méthode | Endpoint | Paramètres | Description |
|---------|----------|------------|-------------|
| GET | `/search/search` | `q, category, pricing, tags, page, page_size` | FTS5 avec filtres |
| GET | `/search/categories` | — | Catégories distinctes |
| GET | `/search/tags` | — | Tags avec comptage |

### Collections

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/collections` | Toutes les collections |
| GET | `/collections/:id` | Collection avec skills inclus |
| POST | `/collections` | Créer `{name, description}` |
| PUT | `/collections/:id` | Modifier |
| DELETE | `/collections/:id` | Supprimer |
| POST | `/collections/:id/skills/:skillId` | Ajouter un skill |
| DELETE | `/collections/:id/skills/:skillId` | Retirer un skill |
| GET | `/collections/favorites/list` | Skills favoris |

### Goals (Décomposition de but)

| Méthode | Endpoint | Corps | Description |
|---------|----------|-------|-------------|
| POST | `/goals/decompose` | `{goal, source: "sqlite"\|"sqlite-vector"}` | Décomposition IA |
| GET | `/goals/logs` | — | Historique en mémoire |
| DELETE | `/goals/logs` | — | Vider le log |
| POST | `/goals/explain` | `{goal, tool_name, tool_description, step_title}` | Explication streaming |

**Réponse `/goals/decompose` :**
```json
{
  "summary": "Vue d'ensemble de l'approche",
  "architecture": "Description de l'architecture cible",
  "tech_stack": ["React", "Node.js", "PostgreSQL"],
  "analyst_notes": "Risques, décisions critiques, alternatives",
  "runtime_tools": [{"name": "Redis", "purpose": "Cache sessions", "category": "cache", "in_db": false}],
  "steps": [{
    "step": 1,
    "title": "Initialiser le projet",
    "role": "dev",
    "dev_tools": ["Claude Code CLI", "Vite"],
    "user_tools": [],
    "tools": [{
      "name": "Claude Code CLI",
      "description": "Génère la structure de base du projet",
      "type": "dev",
      "purpose": "Scaffolding initial",
      "install_hint": "npm install -g @anthropic-ai/claude-code",
      "integration_notes": "Utiliser /init pour créer CLAUDE.md",
      "in_db": true
    }]
  }],
  "method": "claude",
  "runtime_ms": 2340
}
```

### Comparateur

| Méthode | Endpoint | Corps | Description |
|---------|----------|-------|-------------|
| POST | `/comparator` | `{skill_ids: [1, 2, 3]}` | Matrices de comparaison |

### Scraper

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/scraper/configs` | Liste des configs |
| POST | `/scraper/configs` | Créer `{name, url, type, category}` |
| PUT | `/scraper/configs/:id` | Modifier |
| DELETE | `/scraper/configs/:id` | Supprimer |
| GET | `/scraper/sessions` | 100 dernières sessions |
| GET | `/scraper/sessions/:id` | Détail avec logs JSON |
| POST | `/scraper/sessions` | Démarrer `{config_id}` |
| POST | `/scraper/sessions/:id/pause` | Mettre en pause |
| POST | `/scraper/sessions/:id/resume` | Reprendre |
| POST | `/scraper/sessions/:id/stop` | Stopper |
| DELETE | `/scraper/sessions/:id` | Supprimer |
| POST | `/scraper/sessions/clear-all` | Vider les sessions terminées |

### Recherche sémantique

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/semantic-search/objective` | `{objective, top_k}` → résultats par similarité |
| GET | `/semantic-search/objective` | `?q=...&top_k=10` |
| POST | `/semantic-search/sync` | Vectorise les skills manquants |

### Admin

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/admin/db-info` | Chemin, taille, version SQLite, comptages |
| GET | `/admin/tables/:table` | Vue paginée `?page=&size=&search=` |
| POST | `/admin/purge-sessions` | Supprime skills crawlés + sessions |
| GET | `/admin/status` | PID, uptime, mémoire, managed |
| POST | `/admin/restart` | `{target: "api"\|"frontend"\|"all"}` |
| GET | `/health` | `{status: "ok", version: "2.0.0"}` |

---

## Schéma de base de données

### `skills.db` (base principale)

```sql
CREATE TABLE skills (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT UNIQUE NOT NULL,
  description          TEXT,
  category             TEXT,           -- voir valeurs autorisées ci-dessous
  source_url           TEXT,
  source_name          TEXT,
  pricing              TEXT DEFAULT 'free',  -- "free"|"freemium"|"paid"
  features             TEXT,           -- JSON array de strings (étapes ou fonctionnalités)
  install_instructions TEXT,           -- texte libre ou JSON (voir web-segment)
  version              TEXT,
  popularity_score     REAL DEFAULT 0, -- 0.0 à 9.9
  is_active            INTEGER DEFAULT 1,  -- 0 = masqué dans search/goals/vecteurs
  is_favorite          INTEGER DEFAULT 0,
  readme               TEXT,           -- contenu markdown brut
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now'))
);

-- Taxonomie
CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE skill_tags (skill_id INTEGER, tag_id INTEGER, PRIMARY KEY(skill_id, tag_id));

-- FTS5 — sync via triggers INSERT/UPDATE/DELETE
CREATE VIRTUAL TABLE skills_fts USING fts5(
  name, description, features,
  content='skills', content_rowid='id'
);

-- Organisation
CREATE TABLE collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE collection_skills (
  collection_id INTEGER, skill_id INTEGER,
  PRIMARY KEY(collection_id, skill_id)
);
CREATE TABLE favorites (skill_id INTEGER PRIMARY KEY, created_at TEXT);
CREATE TABLE user_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL, content TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE skill_combinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id_1 INTEGER, skill_id_2 INTEGER,
  use_case TEXT, description TEXT
);

-- Scraper
CREATE TABLE scraper_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, url TEXT, type TEXT,
  category TEXT DEFAULT 'AI Coding Tool',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE scraper_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, source TEXT,
  status TEXT DEFAULT 'pending',  -- pending|running|paused|completed|failed|stopped
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  found INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  logs TEXT DEFAULT '[]',         -- JSON array {ts, msg, level}
  started_at TEXT, paused_at TEXT, finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Catégories valides :** `"Claude Code Skill"` · `"MCP Server"` · `"AI Coding Tool"` · `"AI Productivity Tool"` · `"Software"`

### `skills_vectors.db` (base vectorielle)

```sql
CREATE TABLE skill_embeddings (
  skill_id   INTEGER PRIMARY KEY,
  tfidf_vec  TEXT,       -- JSON: {"term": score, ...} (sparse)
  cap_vec    TEXT,       -- JSON: [float × 40] (espace de capacités)
  text_snip  TEXT,
  embedded_at TEXT
);
CREATE TABLE corpus_vocab (term TEXT PRIMARY KEY, doc_freq INTEGER);
CREATE TABLE corpus_meta  (key TEXT PRIMARY KEY, value TEXT);  -- doc_count
```

**Score de similarité :** `0.65 × cosine_tfidf + 0.35 × cosine_cap`

**Types de correspondance :** `"direct"` (≥ 70 % du max) · `"building_block"` (30–70 %) · `"enhancement"` (< 30 %)

---

## Crawlers — Détail technique

### `web-segment.js` — Segmentation IA (Claude Haiku)
Pipeline en deux étapes pour analyser n'importe quelle page web :
1. `CheerioCrawler` charge la page (1 requête max, 30 s timeout)
2. Suppression des blocs non-content : `nav, header, footer, aside, script, style`
3. Extraction des sections par headings `h2/h3/h4` (fallback : `article/section`)
4. Calcul d'un **score heuristique** : mots-clés (how to, steps, install…) + listes numérotées + blocs de code → seuil ≥ 2
5. Pour chaque section au-dessus du seuil : appel **Claude Haiku** → JSON `{is_skill, confidence, name, description, inputs, steps, output, ...}`
6. Seuil de confiance ≥ 0.65 pour accepter
7. Sélecteur CSS calculé : `#id` propre → `#id` ancêtre → `tag:nth-of-type(n)`
8. Stockage du sélecteur et des métadonnées IA dans `install_instructions` en JSON :
   ```json
   {"type": "web-segment", "selector": "#installation", "confidence": 0.87, "inputs": [...], "steps": [...], "output": "..."}
   ```

### `github-skills.js` — Parseur SKILL.md
- Validation frontmatter YAML (`---`), champs requis : `name`, `description`
- Rejet si `description < 15 chars` ou body `< 30 chars`
- Deux modes de crawl : repo entier via Trees API, ou Code Search GitHub
- Variante agents (`agents.md`)

### `github.js` — Client GitHub API
- Awesome lists : extraction des liens markdown, fetch README en batch de 15
- GitHub Search : requêtes par topic ou mots-clés

### `npm.js` — Registry npm
- `GET /v1/search?text=...` avec filtrage par popularité
- Popularité = npm score × 10, plafonnée à 9.9

### `generic.js` — Crawler HTML générique
- Stratégie 1 : URL blob GitHub → raw markdown → `parseSkillMarkdown()`
- Stratégie 2 : markdown embarqué dans `<pre>`/`<code>` (frontmatter YAML)
- Stratégie 3 : meta tags HTML (`og:title`, `description`, `keywords`)
- Suit les liens internes (même domaine), max 100 pages

---

## Frontend — Pages et composants

### Pages

| Page | Route | Fonctionnement |
|------|-------|----------------|
| `Home.jsx` | `/` | Recherche FTS5 + grille de SkillCards. Toggle favori et ajout au comparateur. |
| `SkillDetail.jsx` | `/skills/:id` | Affiche tous les champs du skill. Notes CRUD. Ajout à une collection. Panneau `web-segment` si `install_instructions.type === "web-segment"` (sélecteur CSS, confiance, lien ancre). |
| `Goals.jsx` | `/goals` | Formulaire objectif + source (FTS5/vecteur). Résultat en liste plate avec ExplainDrawer latéral (streaming SSE). |
| `GoalsLog.jsx` | `/goals/log` | Historique des sessions, polling 2 s, expandable. |
| `Collections.jsx` | `/collections` | Section favoris + collections CRUD. |
| `Comparator.jsx` | `/comparator` | Matrices feature × skill et tag × skill. Max 3 skills. |
| `Scraper.jsx` | `/scraper` | CRUD configs, démarrage sessions, barres de progression, logs filtrables. Type par défaut : `web-segment`. |
| `Crud.jsx` | `/crud` | Vue admin directe sur les tables (hors navbar). Toggle `is_active`, restart services. |

### Composants

| Composant | Rôle |
|-----------|------|
| `Navbar.jsx` | Liens de navigation principaux |
| `SearchBar.jsx` | Input + filtres catégorie/prix/tags |
| `SkillCard.jsx` | Carte avec badge catégorie coloré, tags, toggles favori/comparateur |
| `MarkdownContent.jsx` | Rendu react-markdown + remark-gfm |
| `TagBadge.jsx` | Badge de tag inline |

### Client API (`api.js`)
Client Axios préconfiguré (`baseURL: /api`). Méthodes :
`searchSkills`, `getSkill`, `listSkills`, `toggleFavorite`, `setSkillActive`, `addNote`, `deleteNote`, `getCollections`, `createCollection`, `addToCollection`, `removeFromCollection`, `decomposeGoal`, `compareSkills`, `getConfigs`, `getSessions`, `startSession`, `pauseSession`, `resumeSession`, `stopSession`, `deleteSession`, `getAdminDbInfo`, `getAdminTable`, `purgeSessionData`, `syncVectorDb`

---

## Variables d'environnement

| Variable | Requis | Utilisation |
|----------|--------|-------------|
| `ANTHROPIC_API_KEY` | Pour Goals + web-segment | Décomposition Goals (Claude Opus 4) · segmentation web (Claude Haiku) |
| `GITHUB_TOKEN` | Recommandé | Rate limit API GitHub × 10 (5 000 req/h au lieu de 60) |
| `BRAVE_API_KEY` | Optionnel | Futur : recherche web dans Goals |
| `PORT` | Optionnel | Port de l'API (défaut : 8000) |

---

## Process Manager (`scripts/manager.js`)

Lance et supervise les deux processus Node en développement :
- **API** : `node src/server.js` depuis `api/`
- **Frontend** : `npm run dev` depuis `frontend/`
- **Restart IPC** : l'API peut envoyer `{action: 'restart', target: 'api'|'frontend'|'all'}` via `process.send()` → manager relance le(s) processus ciblé(s)
- **Auto-restart** : code de sortie 0 ou 75 → relance après 1 s ; code 1 → arrêt définitif
- **Logs** : préfixés `[HH:MM:SS] [api]` / `[HH:MM:SS] [frontend]`

---

## Seed data

**8 skills de démarrage** (chargés seulement si la table `skills` est vide) :

| Skill | Catégorie | Pricing | Score |
|-------|-----------|---------|-------|
| Claude Code CLI | AI Coding Tool | freemium | 9.9 |
| Claude.ai | AI Productivity Tool | freemium | 9.8 |
| sequential-thinking MCP | MCP Server | free | 8.5 |
| brave-search MCP | MCP Server | freemium | 8.2 |
| filesystem MCP | MCP Server | free | 8.7 |
| github MCP | MCP Server | free | 8.8 |
| Cursor | AI Coding Tool | freemium | 9.3 |
| Aider | AI Coding Tool | free | 8.9 |

**12 configs de crawl pré-chargées** : `anthropics/skills` repo, GitHub Code Search `skill.md` / `SKILL.md`, Awesome MCP Servers, topics `mcp-server` / `model-context-protocol`, npm `@modelcontextprotocol` / `mcp-server`, GitHub AI agents search.

---

## Roadmap

### Priorité haute

- [ ] **Workflows** — Séquences ordonnées de skills pour accomplir un but
  ```sql
  CREATE TABLE workflows (id, name, description, goal, created_at);
  CREATE TABLE workflow_steps (id, workflow_id, skill_id, step_order, instructions);
  ```
  - Page `/workflows` : liste, création, édition
  - Bouton "Sauvegarder comme Workflow" dans Goals
  - Workflows suggérés dans SkillDetail

- [ ] **Export** — `GET /api/export?ids=1,2,3&format=json|csv|markdown`
  - Bouton dans Collections et Search

### Priorité moyenne

- [ ] **Score de popularité dynamique** — Sync GitHub stars (token disponible dans `.env`)
- [ ] **Affichage champs riches Goals** — `architecture`, `tech_stack`, `analyst_notes` dans Goals.jsx
- [ ] **Pagination vectorielle** — offset + total dans semantic-search

---

## Conventions de développement

- **Backend ESM** : `import`/`export` uniquement (pas de `require`)
- **better-sqlite3** : API synchrone (pas d'`await` sur les requêtes DB)
- **Hono routes** : `async (c) =>` avec `c.json()` / `c.body(null, 204)`
- **FTS5** : `WHERE skills_fts MATCH ?` avec paramètre `term + " *"` pour préfixe
- **Thème dark** : `bg-gray-900` base, `bg-gray-800` cards, `border-gray-700`, `text-gray-300`
- **Catégories** : valeurs exactes avec majuscules (ex. `"MCP Server"`, pas `"mcp server"`)
- **Pricing** : `"free"`, `"freemium"`, `"paid"` uniquement
- **is_active** : filtre global — `is_active=0` exclut le skill de search, goals ET vecteurs
- **install_instructions web-segment** : JSON avec `type: "web-segment"` permet à SkillDetail de détecter et afficher le panneau source

---

## Branche active

`claude/skills-vector-db-sqlite-Ymz10` sur `do4fun/copilot-custom-app-base`
