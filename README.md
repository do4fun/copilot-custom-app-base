# SkillsHub — AI Skills Discovery

Application web de **découverte, recherche et gestion** de skills IA, serveurs MCP et outils de développement. Propulsée par Claude AI (Anthropic).

> Application recréée from scratch à partir de la spécification technique (`README.md` + `CLAUDE.md` racine et `skills-discovery/` de la branche `dev`).

Le projet principal vit dans **[`skills-discovery/`](skills-discovery/README.md)** :
- `skills-discovery/api/` — Backend **Node.js 20+ / Hono** (port 8000)
- `skills-discovery/frontend/` — Frontend **React 18 / Vite / TailwindCSS** (port 5173)

## Fonctionnalités

- **Recherche full-text SQLite FTS5** (préfixe) sur nom, description, features et tags + filtres catégorie / prix / tags
- **Recherche sémantique vectorielle** : TF-IDF sparse + espace de capacités 40D (score 65 % / 35 %)
- **Décomposition de but (Goals)** : Claude Opus 4 avec persona expert IT (analyste, architecte, développeur), réponse structurée (`summary`, `architecture`, `tech_stack`, `analyst_notes`, `runtime_tools`, `steps[]`), fallback rule-based sans clé API, ExplainDrawer streaming, log de session
- **Favoris, collections, notes personnelles** persistants
- **Comparateur** 2-3 skills : feature matrix + tag matrix, état en `localStorage`
- **Scraper configurable** — 9 types de sources : GitHub Trees API / Code Search (skill.md, agents.md) / Awesome lists / Search, npm registry, crawler générique, segmentation web IA (Claude Haiku) ; sessions pause / resume / stop avec logs temps réel
- **Admin DB** : vue directe sur les tables SQLite, toggle `is_active`, purge, restart IPC

## Démarrage rapide

```bash
cd skills-discovery
(cd api && npm install)
(cd frontend && npm install)
cp api/.env.example api/.env       # renseigner ANTHROPIC_API_KEY, GITHUB_TOKEN
node scripts/manager.js            # API :8000 + Frontend :5173
```

Documentation complète (API, schéma DB, crawlers, conventions) : [`skills-discovery/README.md`](skills-discovery/README.md)

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Backend | Node.js 20+ · Hono 4.6 · @hono/node-server |
| Base de données | SQLite + FTS5 (better-sqlite3, synchrone) |
| Base vectorielle | SQLite custom (TF-IDF + 40D capability space) |
| Crawlers | Crawlee (CheerioCrawler) + API GitHub / npm |
| IA décomposition | Claude Opus 4 (`claude-opus-4-8`) |
| IA segmentation web | Claude Haiku (`claude-haiku-4-5-20251001`) |
| Frontend | React 18 · Vite 5 · TailwindCSS 3 · react-router-dom 6 |

## Branche active

`claude/new-app-from-scratch-1byn46` sur `do4fun/copilot-custom-app-base`
