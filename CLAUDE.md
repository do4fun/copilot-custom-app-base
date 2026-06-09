# CLAUDE.md — SkillsHub

## Projet

Web app de découverte et gestion de skills IA (Claude Code skills, MCP servers, outils IA).
Backend Node.js/Hono + SQLite FTS5. Frontend React/Vite/TailwindCSS. Thème dark.

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

# Variable requise pour activer la décomposition IA et le scraping
# Créer skills-discovery/api/.env avec :
# ANTHROPIC_API_KEY=sk-ant-...
# GITHUB_TOKEN=ghp_...
# BRAVE_API_KEY=...
```

## Architecture

```
skills-discovery/
├── api/src/
│   ├── app.js               # Hono app, CORS, montage des routes
│   ├── server.js            # Entrée, init DB + vecteurs, serve static
│   ├── db.js                # SQLite init, FTS5, seed data, upsertSkill
│   ├── vector-db.js         # Embeddings TF-IDF + recherche sémantique
│   ├── routes/
│   │   ├── skills.js        # CRUD + /favorite + /notes + /active + /combinations
│   │   ├── search.js        # FTS5 search + /categories + /tags
│   │   ├── collections.js   # Collections CRUD + /favorites/list
│   │   ├── goals.js         # POST /decompose (Claude API) + GET /logs + POST /explain
│   │   ├── comparator.js    # POST / → feature_matrix + tag_matrix
│   │   ├── scraper.js       # Configs + sessions de crawl (Crawlee)
│   │   ├── semantic-search.js # POST / + POST /sync
│   │   └── admin.js         # GET /db-info + GET /tables/:t + POST /purge-sessions
│   └── crawlers/
│       ├── generic.js       # Crawler générique (GitHub tree/blob + SKILL.md)
│       ├── github-skills.js # Scraper Claude Code skills GitHub
│       ├── github.js        # Client GitHub API
│       └── npm.js           # Scraper NPM packages
├── frontend/src/
│   ├── pages/
│   │   ├── Home.jsx         # Recherche + grille de résultats
│   │   ├── SkillDetail.jsx  # Détail + notes + collections + comparateur
│   │   ├── Goals.jsx        # Décomposition de but (liste plate + ExplainDrawer)
│   │   ├── GoalsLog.jsx     # Log de session — skills envoyés au LLM
│   │   ├── Collections.jsx  # Favoris + collections
│   │   ├── Comparator.jsx   # Tableau comparatif (2-3 skills)
│   │   ├── Scraper.jsx      # Config crawlers + suivi des sessions
│   │   └── Crud.jsx         # Admin — vue directe sur la DB (hors navbar)
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── SearchBar.jsx
│   │   ├── SkillCard.jsx
│   │   ├── MarkdownContent.jsx
│   │   └── TagBadge.jsx
│   └── api.js               # Client Axios → /api/*
├── scripts/manager.js       # Process manager (API + Frontend, restart auto)
├── skills.db                # Base SQLite principale (FTS5, à la racine)
├── skills_vectors.db        # Base vectorielle (TF-IDF + capability space)
└── CLAUDE.md                # Prompt système expert pour goals/decompose
```

## Conventions

- **Backend** : ESM (`import`/`export`), `better-sqlite3` (synchrone), routes Hono avec `async (c) =>`
- **Frontend** : composants fonctionnels React, TailwindCSS dark (`bg-gray-900` base, `bg-gray-800` cards)
- **Catégories** : `"Claude Code Skill"`, `"MCP Server"`, `"AI Coding Tool"`, `"AI Productivity Tool"`, `"Software"`
- **Pricing** : `"free"`, `"freemium"`, `"paid"` uniquement
- **FTS5** : requêtes via `skills_fts MATCH ?` avec terme `+ "*"` pour préfixe
- **Comparateur** : IDs stockés dans `localStorage` clé `skillsHub_comparator`
- **is_active** : filtre global — les skills avec `is_active=0` n'apparaissent pas dans search, goals, vecteurs
- **Claude en priorité** : pour toute suggestion d'outil, préférer Claude Code CLI, Claude.ai, claude-api avant les alternatives

## État actuel (fonctionnel)

- [x] Base SQLite avec FTS5 et triggers de sync
- [x] Base vectorielle SQLite (TF-IDF + 40D capability space)
- [x] 6 600+ skills crawlés (Crawlee — GitHub tree/blob + SKILL.md)
- [x] API REST complète (skills, search, collections, goals, comparator, scraper, admin, semantic-search)
- [x] Frontend 8 pages, thème dark, responsive
- [x] Décomposition de but Claude API (persona expert IT) + fallback rule-based
- [x] Favoris, collections, notes persistants
- [x] Comparateur avec feature_matrix et tag_matrix
- [x] Scraper avec configs, sessions, pause/resume/stop
- [x] Toggle is_active par skill (Admin DB)
- [x] Log de session Goals (skills proposés au LLM)
- [x] Recherche SQLite-vector comme source alternative pour la décomposition

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

La décomposition retourne `architecture`, `tech_stack`, `analyst_notes` mais Goals.jsx ne les affiche pas encore.

## Points d'attention

- Les bases de données (`skills.db`, `skills_vectors.db`) sont à la racine de `skills-discovery/`, pas dans `api/`.
- La seed data ne se charge **qu'une fois** (si `COUNT(*) == 0`). Pour re-seeder : supprimer `skills.db`.
- Le fallback rule-based dans `goals.js` utilise des noms exacts de skills — si un skill est renommé, mettre à jour les templates.
- `skills-discovery/CLAUDE.md` est le **prompt système** envoyé à Claude pour la décomposition — ne pas confondre avec ce fichier.
- `package-lock.json` est commité — ne pas supprimer.
- Branche active : `claude/skills-vector-db-sqlite-Ymz10` sur `do4fun/copilot-custom-app-base`.
