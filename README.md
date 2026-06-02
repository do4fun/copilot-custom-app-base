# SkillsHub — AI Skills Discovery

Web app pour **découvrir, rechercher et gérer** les skills IA, serveurs MCP, et outils de développement. Propulsé par Claude AI.

## Fonctionnalités

- **Recherche full-text** (SQLite FTS5) par nom, description, features et tags
- **Filtres** par catégorie, prix (free / freemium / paid) et tags
- **Décomposition de but** — décris ton objectif, Claude le découpe en tâches et suggère les meilleurs outils pour chacune
- **Comparateur** — compare 2–3 skills côte à côte (features, prix, tags, popularité)
- **Favoris & Collections** — organise tes skills par projet ou cas d'usage
- **Notes personnelles** — annote chaque skill avec tes propres observations
- **Combinaisons de skills** — découvre quels outils fonctionnent bien ensemble

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | FastAPI + Python 3.11+ |
| Base de données | SQLite + FTS5 (full-text search) |
| Frontend | React 18 + Vite + TailwindCSS |
| IA (décomposition) | Claude API (`claude-opus-4-8`) |
| ORM async | aiosqlite |

## Structure du projet

```
skills-discovery/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, démarrage, CORS
│   │   ├── database.py          # SQLite init, FTS5, triggers
│   │   ├── models.py            # Schémas Pydantic
│   │   ├── routers/
│   │   │   ├── skills.py        # CRUD skills, favoris, notes
│   │   │   ├── search.py        # Recherche FTS5 + filtres
│   │   │   ├── collections.py   # Collections + favoris
│   │   │   ├── goals.py         # Décomposition de but (Claude API)
│   │   │   └── comparator.py    # Comparaison de skills
│   │   └── scraper/
│   │       ├── seed_data.py     # 50+ skills pré-chargés
│   │       ├── claude_skills.py # Scraper Claude Code skills
│   │       └── mcp_servers.py   # Scraper MCP servers
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx         # Recherche principale
│   │   │   ├── SkillDetail.jsx  # Détail + notes + collections
│   │   │   ├── Goals.jsx        # Décomposition de but
│   │   │   ├── Collections.jsx  # Favoris + collections
│   │   │   └── Comparator.jsx   # Tableau de comparaison
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── SearchBar.jsx
│   │   │   ├── SkillCard.jsx
│   │   │   └── TagBadge.jsx
│   │   └── api.js               # Client Axios
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## Installation et lancement

### Prérequis

- Python 3.11+
- Node.js 18+
- (Optionnel) Clé API Anthropic pour la décomposition IA

## Installation
### Clone le repo source
```bash
git clone <https://github.com/do4fun/copilot-custom-app-base.git>
cd copilot-custom-app-base
git checkout claude/skills-discovery-search-URep2
```
### Copie le dossier et initialise le nouveau repo
```bash
cp -r skills-discovery /tmp/skills-discovery
cd /tmp/skills-discovery
git init
git checkout -b dev
git add .
git commit -m "feat: initial skills-discovery project - FastAPI + React + SQLite FTS5"
git remote add origin <https://github.com/do4fun/skills-discovery.git>
git push -u origin dev
```
### Backend

```bash
cd skills-discovery/backend
pip install -r requirements.txt

# Optionnel — activer la décomposition IA avec Claude
export ANTHROPIC_API_KEY=sk-ant-...

python run.py
# → http://localhost:8000
# → Swagger UI : http://localhost:8000/docs
```

La base de données `skills.db` est créée automatiquement au premier démarrage avec **50+ skills** pré-chargés.

### Frontend (développement)

```bash
cd skills-discovery/frontend
npm install
npm run dev
# → http://localhost:5173
```

### Frontend (production — servi par FastAPI)

```bash
cd skills-discovery/frontend
npm run build
# Les fichiers sont dans frontend/dist/
# FastAPI les sert automatiquement sur http://localhost:8000
```

## Skills pré-chargés (seed data)

| Catégorie | Nombre | Exemples |
|---|---|---|
| Claude Code Skill | 14 | `/deep-research`, `/code-review`, `/security-review` |
| MCP Server | 12 | `filesystem`, `github`, `brave-search`, `memory` |
| AI Coding Tool | 16 | Claude Code CLI, Cursor, Aider, Windsurf, v0 |
| AI Productivity Tool | 8 | Claude.ai, Perplexity, NotebookLM, Phind |

## API — Endpoints principaux

```
GET  /api/search/search?q=...&category=...&pricing=...&tags=...
GET  /api/search/categories
GET  /api/search/tags

GET  /api/skills              # liste paginée
GET  /api/skills/{id}         # détail + notes + combinaisons
POST /api/skills/{id}/favorite
POST /api/skills/{id}/notes

POST /api/goals/decompose     # {"goal": "..."} → tâches + skills
POST /api/comparator          # {"skill_ids": [1, 2, 3]}

GET  /api/collections
POST /api/collections
POST /api/collections/{id}/skills/{skill_id}
GET  /api/collections/favorites/list

GET  /api/health
```

## Décomposition de but

Avec une clé API Anthropic, la décomposition utilise **Claude** (`claude-opus-4-8`) pour :
1. Analyser le but et identifier 3–5 sous-tâches
2. Suggérer les skills les plus pertinents de la base locale pour chaque tâche

Sans clé API, un fallback rule-based prend le relais (détection par mots-clés).

**Exemple :**
> "Construire une API REST avec authentification et base de données PostgreSQL"

→ Tâches générées :
1. Design API structure → **Claude Code CLI**, Claude.ai, claude-api
2. Implement backend logic → **Claude Code CLI**, Cursor, Continue.dev
3. Set up database → **postgres MCP**, Claude Code CLI
4. Write tests → **Claude Code CLI**, code-review
5. Document and deploy → **Claude Code CLI**, fetch MCP

## Variables d'environnement

| Variable | Requis | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Non | Active la décomposition de but par Claude |

## Roadmap

- [ ] Entité **Workflow** — séquences ordonnées de skills sauvegardables
- [ ] **Software** comme catégorie (VS Code, Docker, Postman…)
- [ ] Mise à jour automatique via re-crawl périodique
- [ ] Export JSON/CSV d'une sélection de skills
- [ ] Score de popularité enrichi (GitHub stars, Reddit mentions)
