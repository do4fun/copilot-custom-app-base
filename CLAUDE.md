# CLAUDE.md — SkillsHub

## Projet

Web app de découverte et gestion de skills IA (Claude Code skills, MCP servers, outils IA).
Backend FastAPI + SQLite FTS5. Frontend React/Vite/TailwindCSS. Thème dark.

## Commandes essentielles

```bash
# Backend (depuis skills-discovery/backend/)
pip install -r requirements.txt
python run.py                        # → http://localhost:8000
# Swagger : http://localhost:8000/docs

# Frontend dev (depuis skills-discovery/frontend/)
npm install && npm run dev            # → http://localhost:5173

# Frontend prod (servi par FastAPI)
npm run build                         # → frontend/dist/ chargé automatiquement

# Variable optionnelle pour activer la décomposition IA
export ANTHROPIC_API_KEY=sk-ant-...
```

## Architecture

```
skills-discovery/
├── backend/app/
│   ├── main.py          # FastAPI, CORS, startup seed, static files
│   ├── database.py      # SQLite + FTS5 + triggers de sync
│   ├── models.py        # Pydantic : SkillOut, GoalDecomposeResponse, etc.
│   ├── routers/
│   │   ├── skills.py    # CRUD + /favorite + /notes + /combinations
│   │   ├── search.py    # FTS5 search + /categories + /tags
│   │   ├── collections.py  # Collections CRUD + /favorites/list
│   │   ├── goals.py     # POST /decompose → Claude API + fallback rule-based
│   │   └── comparator.py   # POST / → feature_matrix + tag_matrix
│   └── scraper/
│       └── seed_data.py # 50+ skills chargés au 1er démarrage si DB vide
└── frontend/src/
    ├── pages/Home.jsx         # Recherche + grille de résultats
    ├── pages/SkillDetail.jsx  # Détail + notes + collections + comparateur
    ├── pages/Goals.jsx        # Décomposition de but
    ├── pages/Collections.jsx  # Favoris + collections
    ├── pages/Comparator.jsx   # Tableau comparatif (2-3 skills)
    ├── components/SearchBar.jsx  # Debounce 300ms + filtres + tag pills
    ├── components/SkillCard.jsx  # Card avec catégorie, prix, favoris, compare
    └── api.js                 # Client Axios → /api/*
```

## Conventions

- **Backend** : async/await partout (aiosqlite), `get_db()` comme dépendance FastAPI
- **Frontend** : composants fonctionnels React, TailwindCSS classes dark (bg-gray-900 base, bg-gray-800 cards)
- **Catégories** : `"Claude Code Skill"`, `"MCP Server"`, `"AI Coding Tool"`, `"AI Productivity Tool"`, `"Software"`
- **Pricing** : `"free"`, `"freemium"`, `"paid"` uniquement
- **FTS5** : requêtes via `skills_fts MATCH ?` avec terme `+ "*"` pour préfixe
- **Comparateur** : IDs stockés dans `localStorage` clé `skillsHub_comparator`
- **Claude en priorité** : pour toute suggestion d'outil, préférer Claude Code CLI, Claude.ai, claude-api avant les alternatives

## État actuel (fonctionnel)

- [x] Base SQLite avec FTS5 et triggers de sync
- [x] 50+ skills en seed data (Claude Code, MCP, AI tools)
- [x] API REST complète (skills, search, collections, goals, comparator)
- [x] Frontend 5 pages, thème dark, responsive
- [x] Décomposition de but Claude API + fallback rule-based
- [x] Favoris, collections, notes persistants
- [x] Comparateur avec feature_matrix et tag_matrix

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

### 2. Catégorie Software
Ajouter `"Software"` dans les catégories valides (VS Code, Docker, Postman, Figma...).
Pas de changement de schéma nécessaire — juste enrichir la seed data et les filtres UI.

### 3. Re-crawl automatique
- Endpoint `POST /api/scraper/run` pour déclencher un scrape à la demande
- Scraper GitHub (awesome-mcp-servers, claude-code topics)
- Scraper VS Code marketplace (tag: ai, copilot, llm)
- Champ `last_checked` et badge "outdated" si > 30 jours

### 4. Export
- `GET /api/export?ids=1,2,3&format=json|csv|markdown`
- Bouton "Export selection" dans Collections et Search

### 5. Score de popularité dynamique
- Récupérer GitHub stars via `fetch MCP` ou API GitHub
- Mettre à jour `popularity_score` lors du re-crawl

## Points d'attention

- La seed data ne se charge **qu'une fois** (si `COUNT(*) == 0`). Pour re-seeder : supprimer `skills.db`.
- Le fallback rule-based dans `goals.py` utilise des noms exacts de skills — si un skill est renommé, mettre à jour les templates.
- `package-lock.json` est commité — ne pas supprimer.
- Le repo `do4fun/skills-discovery` (branche `dev`) est la destination finale du projet ; en attendant tout est sur `do4fun/copilot-custom-app-base` branche `claude/skills-discovery-search-URep2`.
