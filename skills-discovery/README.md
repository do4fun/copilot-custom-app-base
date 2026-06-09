# SkillsHub — AI Skills Discovery

Web app pour **découvrir, rechercher et gérer** les skills IA, serveurs MCP, et outils de développement. Propulsé par Claude AI.

## Fonctionnalités

- **Recherche full-text** (SQLite FTS5) par nom, description, features, tags
- **Filtres** par catégorie, prix (free / freemium / paid) et tags
- **Décomposition de but** — décris ton objectif, Claude le découpe en étapes et suggère les meilleurs outils pour chacune
- **Comparateur** — compare 2–3 skills côte à côte (features, prix, tags, popularité)
- **Favoris & Collections** — organise tes skills par projet ou cas d'usage
- **Notes personnelles** — annote chaque skill avec tes propres observations
- **Scraper intégré** — crawle GitHub et d'autres sources pour découvrir de nouveaux skills
- **Recherche vectorielle** — similarité sémantique TF-IDF + espace de capacités

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Node.js + Hono (port 8000) |
| Base de données | SQLite + FTS5 (full-text) + SQLite vectorielle |
| Scraping | Crawlee (Cheerio crawler) |
| Frontend | React 18 + Vite + TailwindCSS (port 5173) |
| IA (décomposition) | Claude API (`claude-opus-4-8`) |

## Structure du projet

```
skills-discovery/
├── api/
│   ├── src/
│   │   ├── app.js               # Hono app, CORS, montage des routes
│   │   ├── server.js            # Entrée, init DB, serve static
│   │   ├── db.js                # SQLite init, seed data, upsertSkill
│   │   ├── vector-db.js         # Embeddings TF-IDF + recherche vectorielle
│   │   ├── routes/
│   │   │   ├── skills.js        # CRUD skills, favoris, notes, is_active
│   │   │   ├── search.js        # Recherche FTS5 + filtres + tags
│   │   │   ├── collections.js   # Collections + favoris
│   │   │   ├── goals.js         # Décomposition de but (Claude API)
│   │   │   ├── comparator.js    # Comparaison de skills
│   │   │   ├── scraper.js       # Sessions de scraping
│   │   │   ├── semantic-search.js # Recherche vectorielle + sync
│   │   │   └── admin.js         # DB info, purge, restart services
│   │   └── crawlers/
│   │       ├── generic.js       # Crawler générique (GitHub tree/blob)
│   │       ├── github-skills.js # Scraper Claude Code skills GitHub
│   │       ├── github.js        # Client GitHub API
│   │       └── npm.js           # Scraper NPM packages
│   ├── .env                     # ANTHROPIC_API_KEY, GITHUB_TOKEN, BRAVE_API_KEY
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx         # Recherche principale
│   │   │   ├── SkillDetail.jsx  # Détail + notes + collections
│   │   │   ├── Goals.jsx        # Décomposition de but
│   │   │   ├── GoalsLog.jsx     # Log de session (skills envoyés au LLM)
│   │   │   ├── Collections.jsx  # Favoris + collections
│   │   │   ├── Comparator.jsx   # Tableau de comparaison
│   │   │   ├── Scraper.jsx      # Config + sessions de scraping
│   │   │   └── Crud.jsx         # Admin — vue directe sur la DB
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── SearchBar.jsx
│   │   │   ├── SkillCard.jsx
│   │   │   ├── MarkdownContent.jsx
│   │   │   └── TagBadge.jsx
│   │   └── api.js               # Client Axios → /api/*
│   └── vite.config.js           # Proxy /api → localhost:8000
├── scripts/
│   └── manager.js               # Process manager (API + Frontend)
├── skills.db                    # Base SQLite principale (FTS5)
├── skills_vectors.db            # Base vectorielle (embeddings)
├── CLAUDE.md                    # Persona expert pour la décomposition IA
├── start.bat                    # Lance API + Frontend
└── start-frontend.bat           # Lance Frontend uniquement
```

## Installation et lancement

### Prérequis

- Node.js 18+
- (Optionnel) Clé API Anthropic pour la décomposition IA

### API (backend)

```bash
cd api
npm install

# Créer api/.env avec les clés nécessaires :
# ANTHROPIC_API_KEY=sk-ant-...   (décomposition IA)
# GITHUB_TOKEN=ghp_...           (scraping GitHub)
# BRAVE_API_KEY=...              (optionnel)

npm run dev
# → http://localhost:8000
# → Health check : http://localhost:8000/api/health
```

La base de données `skills.db` est créée automatiquement au premier démarrage avec **50+ skills** pré-chargés.

### Frontend (développement)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173 (proxy /api → :8000)
```

### Frontend (production — servi par l'API)

```bash
cd frontend
npm run build
# Les fichiers dist/ sont servis automatiquement par Hono sur http://localhost:8000
```

### Lancement rapide (Windows)

```bat
start.bat
```

## API — Endpoints principaux

```http
GET  /api/search/search?q=...&category=...&pricing=...&tags=...
GET  /api/search/categories
GET  /api/search/tags

GET  /api/skills              # liste paginée
GET  /api/skills/{id}         # détail + notes + combinaisons
POST /api/skills/{id}/favorite
POST /api/skills/{id}/notes
PATCH /api/skills/{id}/active  # activer/désactiver

POST /api/goals/decompose     # {"goal": "...", "source": "sqlite|sqlite-vector"}
GET  /api/goals/logs          # log de session (skills envoyés au LLM)
POST /api/comparator          # {"skill_ids": [1, 2, 3]}

GET  /api/collections
POST /api/collections
POST /api/collections/{id}/skills/{skill_id}

POST /api/semantic-search/sync  # synchronise la DB vectorielle
POST /api/semantic-search       # {"query": "...", "top_k": 10}

GET  /api/scraper/configs
POST /api/scraper/sessions
GET  /api/admin/db-info

GET  /api/health
```

## Variables d'environnement

| Variable | Requis | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Non | Active la décomposition de but par Claude |
| `GITHUB_TOKEN` | Non | Augmente la limite de taux GitHub (scraping) |
| `BRAVE_API_KEY` | Non | Active la recherche Brave dans les goals |
