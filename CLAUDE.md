# CLAUDE.md — SkillsHub

## Projet

Web app de découverte et gestion de skills IA (Claude Code skills, MCP servers, outils IA).
Backend **Node.js/Hono** + SQLite FTS5 + base vectorielle TF-IDF. Frontend **React/Vite/TailwindCSS**. Thème dark.

## Commandes essentielles

```bash
# API backend (depuis skills-discovery/api/)
npm install
npm run dev                          # → http://localhost:8000
# Health check : http://localhost:8000/api/health

# Frontend dev (depuis skills-discovery/frontend/)
npm install && npm run dev            # → http://localhost:5173
# Proxy /api → :8000 configuré dans vite.config.js

# Frontend prod (servi par l'API Hono)
npm run build                         # → frontend/dist/ chargé automatiquement par server.js

# Process manager (lance les deux depuis skills-discovery/)
node scripts/manager.js

# Variables requises — créer skills-discovery/api/.env :
# ANTHROPIC_API_KEY=sk-ant-...   (décomposition Goals + crawler web-segment)
# GITHUB_TOKEN=ghp_...           (rate limit GitHub × 10)
# BRAVE_API_KEY=...              (optionnel)
```

## Architecture

```
skills-discovery/
├── api/src/
│   ├── app.js               # Hono app, CORS ('*'), montage des routes /api/*
│   ├── server.js            # Entrée : init DB + vecteurs + sync, serve static, port 8000
│   ├── db.js                # SQLite : schéma, FTS5, triggers, seed 8 skills + 12 configs, upsertSkill
│   ├── vector-db.js         # TF-IDF sparse + espace 40D capability, cosine similarity, semanticSearch
│   ├── routes/
│   │   ├── skills.js        # GET/POST/PUT/DELETE + PATCH /active + POST /favorite + /notes + /combinations
│   │   ├── search.js        # FTS5 MATCH avec préfixe + /categories + /tags
│   │   ├── collections.js   # Collections CRUD + /favorites/list
│   │   ├── goals.js         # POST /decompose (Claude Opus 4) + GET/DELETE /logs + POST /explain (stream)
│   │   ├── comparator.js    # POST / → {skills, feature_matrix, tag_matrix}
│   │   ├── scraper.js       # Configs CRUD + Sessions lifecycle + runner async
│   │   ├── semantic-search.js # POST /objective + POST /sync
│   │   └── admin.js         # db-info + tables/:t + purge + status + restart (IPC)
│   └── crawlers/
│       ├── github.js        # crawlGithubAwesome + crawlGithubSearch (API REST GitHub)
│       ├── github-skills.js # parseSkillMarkdown + crawlGithubSkill/AgentFiles/Repo
│       ├── npm.js           # crawlNpm (npm /v1/search)
│       ├── generic.js       # crawlGeneric (CheerioCrawler, 3 stratégies, 100 req max)
│       └── web-segment.js   # crawlWebSegment (1 page, heuristique score + Claude Haiku)
├── frontend/src/
│   ├── pages/
│   │   ├── Home.jsx         # Recherche FTS5 + grille + favori toggle + comparateur localStorage
│   │   ├── SkillDetail.jsx  # Détail + notes CRUD + collections + panneau web-segment meta
│   │   ├── Goals.jsx        # Décomposition + source toggle (FTS5/vector) + ExplainDrawer streaming
│   │   ├── GoalsLog.jsx     # Historique sessions Goals (polling 2 s)
│   │   ├── Collections.jsx  # Favoris + collections CRUD
│   │   ├── Comparator.jsx   # feature_matrix + tag_matrix (2-3 skills)
│   │   ├── Scraper.jsx      # CRAWLER_TYPES (9) + config CRUD + sessions monitoring temps réel
│   │   └── Crud.jsx         # Admin DB — hors navbar, toggle is_active, restart services
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── SearchBar.jsx
│   │   ├── SkillCard.jsx
│   │   ├── MarkdownContent.jsx
│   │   └── TagBadge.jsx
│   └── api.js               # Client Axios (baseURL: /api)
├── scripts/manager.js       # Process manager (API + Frontend, IPC restart, code 0/75 → relance)
├── skills.db                # Base SQLite principale (FTS5) — racine de skills-discovery/
├── skills_vectors.db        # Base vectorielle TF-IDF + 40D — racine de skills-discovery/
└── CLAUDE.md                # Prompt système LLM (persona expert IT) — chargé par goals.js
```

## Schéma DB (résumé rapide)

**skills** : `id`, `name` (UNIQUE), `description`, `category`, `source_url`, `source_name`, `pricing`, `features` (JSON), `install_instructions`, `version`, `popularity_score`, `is_active`, `is_favorite`, `readme`

**tags** + **skill_tags** (many-to-many)

**skills_fts** : table virtuelle FTS5, synchronisée via triggers `INSERT/UPDATE/DELETE`

**collections** + **collection_skills** + **favorites** + **user_notes** + **skill_combinations**

**scraper_configs** + **scraper_sessions** (`logs` = JSON array `[{ts, msg, level}]`)

**skill_embeddings** dans `skills_vectors.db` : `tfidf_vec` (JSON sparse), `cap_vec` (JSON 40 floats)

## Conventions

- **Backend** : ESM (`import`/`export`), `better-sqlite3` (synchrone — pas d'`await` sur les requêtes DB), routes Hono `async (c) =>`
- **Frontend** : composants fonctionnels React, TailwindCSS dark (`bg-gray-900` base, `bg-gray-800` cards, `border-gray-700`)
- **Catégories** : `"Claude Code Skill"`, `"MCP Server"`, `"AI Coding Tool"`, `"AI Productivity Tool"`, `"Software"` — casse exacte obligatoire
- **Pricing** : `"free"`, `"freemium"`, `"paid"` uniquement
- **FTS5** : requêtes `skills_fts MATCH ?` avec paramètre `terme + " *"` pour préfixe
- **Comparateur** : IDs stockés dans `localStorage` clé `skillsHub_comparator` (tableau de 0 à 3 IDs)
- **is_active** : filtre global — `is_active=0` exclut le skill de search, goals ET vecteurs
- **web-segment** : `install_instructions` contient JSON `{type:"web-segment", selector, confidence, inputs, steps, output}` — SkillDetail détecte ce champ pour afficher le panneau source
- **Score vectoriel** : `0.65 × cosine_tfidf + 0.35 × cosine_cap`
- **Claude en priorité** : pour toute suggestion d'outil, préférer Claude Code CLI, Claude.ai, claude-api avant les alternatives

## Crawlers — Types disponibles

| Type config | Fonction appelée | Particularité |
|-------------|-----------------|---------------|
| `github-skill-repo` | `crawlGithubSkillRepo` | Trees API, parse SKILL.md |
| `github-skill-files` | `crawlGithubSkillFiles` | Code Search GitHub |
| `github-agent-repo` | `crawlGithubAgentRepo` | Trees API, parse agents.md |
| `github-agent-files` | `crawlGithubAgentFiles` | Code Search GitHub |
| `github-awesome` | `crawlGithubAwesome` | Extraction liens markdown |
| `github-search` | `crawlGithubSearch` | Topic/keyword search |
| `npm` | `crawlNpm` | /v1/search, score npm × 10 |
| `web-segment` | `crawlWebSegment` | **1 page max**, heuristique + Claude Haiku, requiert `ANTHROPIC_API_KEY` |
| `generic` | `crawlGeneric` | 100 pages max, même domaine |

## État actuel (fonctionnel)

- [x] Base SQLite avec FTS5 et triggers de sync
- [x] Base vectorielle SQLite (TF-IDF + 40D capability space)
- [x] 6 600+ skills crawlés (Crawlee — GitHub tree/blob + SKILL.md)
- [x] API REST complète (skills, search, collections, goals, comparator, scraper, admin, semantic-search)
- [x] Frontend 8 pages, thème dark, responsive
- [x] Décomposition de but Claude API (persona expert IT) + fallback rule-based
- [x] Favoris, collections, notes persistants
- [x] Comparateur avec feature_matrix et tag_matrix
- [x] Scraper 9 types de sources avec pause/resume/stop et logs temps réel
- [x] Toggle is_active par skill (Admin DB)
- [x] Log de session Goals (skills proposés au LLM)
- [x] Recherche SQLite-vector comme source alternative pour la décomposition
- [x] Crawler web-segment (heuristique + Claude Haiku, sélecteur CSS, panneau SkillDetail)

## Prochains développements prioritaires

### 1. Workflows (haute valeur)
Nouvelle entité : séquence ordonnée de skills pour accomplir un but.

```sql
CREATE TABLE workflows (id, name, description, goal, created_at);
CREATE TABLE workflow_steps (id, workflow_id, skill_id, step_order, instructions);
```

- Page `/workflows` : liste, création, édition
- La page Goals doit pouvoir **sauvegarder** le résultat comme Workflow
- Afficher les workflows suggérés dans SkillDetail

### 2. Export
- `GET /api/export?ids=1,2,3&format=json|csv|markdown`
- Bouton "Export selection" dans Collections et Search

### 3. Score de popularité dynamique
- Récupérer GitHub stars via API GitHub (token déjà disponible dans `.env`)
- Mettre à jour `popularity_score` lors du re-crawl

### 4. Affichage des champs riches de Goals dans l'UI
- `architecture`, `tech_stack`, `analyst_notes` retournés par `/goals/decompose` mais non affichés dans Goals.jsx

## Points d'attention

- Les bases de données (`skills.db`, `skills_vectors.db`) sont à la racine de `skills-discovery/`, **pas** dans `api/`.
- La seed data ne se charge **qu'une fois** (si `COUNT(*) = 0`). Pour re-seeder : supprimer `skills.db`.
- Le fallback rule-based dans `goals.js` utilise des noms exacts de skills — si un skill est renommé, mettre à jour les templates.
- `skills-discovery/CLAUDE.md` est le **prompt système LLM** envoyé à Claude pour la décomposition (chargé par `goals.js`) — ne pas confondre avec ce fichier.
- `package-lock.json` est commité — ne pas supprimer.
- Le crawler `web-segment` s'arrête silencieusement si `ANTHROPIC_API_KEY` est absente.
- `generic.js` suit les liens internes (max 100 req). `web-segment.js` ne traite qu'**une seule page**.
- Branche active : `claude/skills-vector-db-sqlite-Ymz10` sur `do4fun/copilot-custom-app-base`.
