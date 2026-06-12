# SkillsHub — AI Skills Discovery

Application web de **découverte, recherche et gestion** de skills IA, serveurs MCP et outils de développement. Recréée from scratch à partir de la spécification technique du projet.

## Vue d'ensemble

SkillsHub indexe des outils IA (Claude Code Skills, serveurs MCP, outils de coding IA) crawlés depuis GitHub, npm et des pages web. Elle propose une interface de recherche, une décomposition d'objectifs par LLM, un comparateur, des collections et un scraper configurable.

**Deux processus :**
- `api/` — Backend **Node.js 20+ / Hono** sur le port 8000
- `frontend/` — Frontend **React 18 / Vite / TailwindCSS** sur le port 5173 (dev), ou servi par Hono en production

## Démarrage rapide

```bash
# 1. Dépendances
cd api && npm install
cd ../frontend && npm install

# 2. Variables d'environnement (optionnel mais recommandé)
cp api/.env.example api/.env   # puis renseigner ANTHROPIC_API_KEY, GITHUB_TOKEN

# 3. Lancer les deux processus (recommandé)
cd ..
node scripts/manager.js
# API      → http://localhost:8000  (health : /api/health)
# Frontend → http://localhost:5173  (proxy /api → :8000)

# Ou séparément :
cd api && npm run dev
cd frontend && npm run dev

# 4. Build production (frontend servi par l'API)
cd frontend && npm run build   # → dist/ chargé automatiquement par server.js
```

La base `skills.db` est créée automatiquement au premier démarrage avec **8 skills** de seed et **12 configs de crawl** pré-chargées. Les bases (`skills.db`, `skills_vectors.db`) vivent à la racine de `skills-discovery/`.

## Fonctionnalités

- **Recherche FTS5** (préfixe) + filtres catégorie / pricing / tags, pagination 20/page
- **Recherche sémantique vectorielle** : TF-IDF sparse + espace de capacités 40D, score `0.65 × cosine_tfidf + 0.35 × cosine_cap`
- **Goals** : décomposition d'objectif par Claude Opus 4 (persona expert IT chargé depuis `CLAUDE.md`), source FTS5 ou vectorielle, fallback rule-based sans clé API, ExplainDrawer en streaming, log de session
- **Collections, favoris, notes** persistants
- **Comparateur** 2-3 skills (feature matrix + tag matrix, `localStorage` clé `skillsHub_comparator`)
- **Scraper** 9 types de sources (GitHub Trees/Code Search/Awesome/Search, npm, generic, web-segment IA via Claude Haiku) avec sessions pause/resume/stop et logs temps réel
- **Admin DB** (`/crud`, hors navbar) : vue directe sur les tables, toggle `is_active`, purge, restart IPC

## Architecture

```
skills-discovery/
├── api/src/
│   ├── app.js               # Hono app, CORS, montage des routes /api/*
│   ├── server.js            # Entrée : init DB + vecteurs + sync, static, port 8000
│   ├── db.js                # Schéma SQLite, FTS5 + triggers, seed, upsertSkill, appendLog
│   ├── vector-db.js         # TF-IDF + 40D capability space, semanticSearch, sync
│   ├── routes/
│   │   ├── skills.js        # CRUD + /active + /favorite + /notes + /combinations
│   │   ├── search.js        # FTS5 MATCH préfixe + /categories + /tags
│   │   ├── collections.js   # Collections CRUD + /favorites/list
│   │   ├── goals.js         # /decompose (Claude Opus 4) + /logs + /explain (stream)
│   │   ├── comparator.js    # POST / → {skills, feature_matrix, tag_matrix}
│   │   ├── scraper.js       # Configs CRUD + sessions lifecycle + runner async
│   │   ├── semantic-search.js # /objective + /sync
│   │   └── admin.js         # db-info, tables/:t, purge, status, restart
│   └── crawlers/
│       ├── github.js        # crawlGithubAwesome + crawlGithubSearch
│       ├── github-skills.js # parseSkillMarkdown + Trees API + Code Search (skill.md / agents.md)
│       ├── npm.js           # registry npm /v1/search
│       ├── generic.js       # CheerioCrawler, 3 stratégies, 100 pages max
│       └── web-segment.js   # 1 page, heuristique + Claude Haiku, sélecteur CSS
├── frontend/src/
│   ├── pages/               # Home, SkillDetail, Goals, GoalsLog, Collections, Comparator, Scraper, Crud
│   ├── components/          # Navbar, SearchBar, SkillCard, MarkdownContent, TagBadge
│   └── api.js               # Client Axios (baseURL: /api)
├── scripts/manager.js       # Process manager (IPC restart, codes 0/75 → relance)
├── CLAUDE.md                # Prompt système LLM (persona expert IT) — chargé par goals.js
├── skills.db                # Base SQLite principale (créée au runtime)
└── skills_vectors.db        # Base vectorielle (créée au runtime)
```

## API — Référence

Base URL : `http://localhost:8000/api`

| Domaine | Endpoints |
|---------|-----------|
| Skills | `GET/POST /skills` · `GET/PUT/DELETE /skills/:id` · `PATCH /skills/:id/active` · `POST /skills/:id/favorite` · `POST /skills/:id/notes` · `DELETE /skills/:id/notes/:noteId` · `GET /skills/:id/combinations` |
| Recherche | `GET /search/search?q=&category=&pricing=&tags=&page=` · `GET /search/categories` · `GET /search/tags` |
| Collections | `GET/POST /collections` · `GET/PUT/DELETE /collections/:id` · `POST/DELETE /collections/:id/skills/:skillId` · `GET /collections/favorites/list` |
| Goals | `POST /goals/decompose {goal, source}` · `GET/DELETE /goals/logs` · `POST /goals/explain` (stream) |
| Comparateur | `POST /comparator {skill_ids: [..]}` |
| Scraper | `GET/POST/PUT/DELETE /scraper/configs[/:id]` · `GET/POST /scraper/sessions` · `POST /scraper/sessions/:id/pause\|resume\|stop` · `DELETE /scraper/sessions/:id` · `POST /scraper/sessions/clear-all` |
| Sémantique | `POST/GET /semantic-search/objective` · `POST /semantic-search/sync` |
| Admin | `GET /admin/db-info` · `GET /admin/tables/:table` · `POST /admin/purge-sessions` · `GET /admin/status` · `POST /admin/restart` |
| Santé | `GET /health` → `{status: "ok", version: "2.0.0"}` |

## Variables d'environnement (`api/.env`)

| Variable | Requis | Usage |
|----------|--------|-------|
| `ANTHROPIC_API_KEY` | Pour Goals + web-segment | Claude Opus 4 (décomposition) · Claude Haiku (segmentation web) |
| `GITHUB_TOKEN` | Recommandé | Rate limit GitHub × 10 (5 000 req/h) ; requis pour le Code Search |
| `BRAVE_API_KEY` | Optionnel | Usage futur dans Goals |
| `PORT` | Optionnel | Port de l'API (défaut 8000) |

## Conventions

- **Backend ESM** : `import`/`export` uniquement ; `better-sqlite3` synchrone (pas d'`await` sur les requêtes DB) ; routes Hono `async (c) =>`
- **Catégories** (casse exacte) : `"Claude Code Skill"` · `"MCP Server"` · `"AI Coding Tool"` · `"AI Productivity Tool"` · `"Software"`
- **Pricing** : `"free"`, `"freemium"`, `"paid"` uniquement
- **is_active** : filtre global — `is_active=0` exclut le skill de search, goals ET vecteurs
- **Thème dark** : `bg-gray-900` base, `bg-gray-800` cards, `border-gray-700`
- **install_instructions dual-usage** : texte libre OU JSON `{type:"web-segment", selector, confidence, inputs, steps, output}` — SkillDetail gère les deux cas

## Points d'attention

- La seed data ne se charge qu'une fois (`COUNT(*) = 0`) — pour re-seeder, supprimer `skills.db`.
- Le fallback rule-based de `goals.js` utilise les noms exacts des skills seed.
- `web-segment` traite **1 seule page** et s'arrête si `ANTHROPIC_API_KEY` est absente ; `generic` suit les liens internes (max 100 pages).
- Le log de session Goals est en mémoire uniquement (perdu au redémarrage).
- `process.send` (restart IPC) n'existe que lancé via `scripts/manager.js`.
- Les shadow tables FTS5 (`skills_fts_*`) ne sont pas exposées dans l'admin.

## Roadmap

- **Workflows** (haute priorité) : tables `workflows` + `workflow_steps`, page `/workflows`, bouton "Sauvegarder comme Workflow" dans Goals, suggestions dans SkillDetail
- **Export** : `GET /api/export?ids=1,2,3&format=json|csv|markdown`
- **Score de popularité dynamique** : sync GitHub stars au re-crawl
- **Pagination vectorielle** : `offset` + `total` dans semantic-search
