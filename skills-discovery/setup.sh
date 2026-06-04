#!/usr/bin/env bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }
info() { echo -e "${BLUE}→${NC} $1"; }

echo ""
echo -e "${BLUE}══════════════════════════════════════${NC}"
echo -e "${BLUE}   SkillsHub — Installation            ${NC}"
echo -e "${BLUE}══════════════════════════════════════${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# ── 1. Python ─────────────────────────────────────────────────────────────────
info "Vérification de Python..."

if ! command -v python3 &>/dev/null; then
    err "Python 3 introuvable. Installe Python 3.11+ depuis https://python.org"
fi

PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)

if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 11 ]; }; then
    err "Python $PY_VERSION détecté — Python 3.11+ requis."
fi
ok "Python $PY_VERSION"

# ── 2. pip ────────────────────────────────────────────────────────────────────
info "Vérification de pip..."
if ! python3 -m pip --version &>/dev/null; then
    err "pip introuvable. Lance : python3 -m ensurepip --upgrade"
fi
ok "pip $(python3 -m pip --version | awk '{print $2}')"

# ── 3. Node.js ────────────────────────────────────────────────────────────────
info "Vérification de Node.js..."

if ! command -v node &>/dev/null; then
    err "Node.js introuvable. Installe Node.js 18+ depuis https://nodejs.org"
fi

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
    err "Node.js v$NODE_VERSION détecté — Node.js 18+ requis."
fi
ok "Node.js v$NODE_VERSION"

# ── 4. npm ────────────────────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
    err "npm introuvable. Installe Node.js 18+ depuis https://nodejs.org"
fi
ok "npm $(npm --version)"

echo ""

# ── 5. Dépendances Python ─────────────────────────────────────────────────────
info "Installation des dépendances Python..."

if [ ! -f "$BACKEND_DIR/requirements.txt" ]; then
    err "Fichier $BACKEND_DIR/requirements.txt introuvable."
fi

# Venv optionnel — utilise le venv existant ou installe globalement
if [ -d "$BACKEND_DIR/.venv" ]; then
    info "Virtual environment existant détecté (.venv), activation..."
    source "$BACKEND_DIR/.venv/bin/activate"
elif command -v python3 -m venv &>/dev/null 2>&1; then
    info "Création d'un virtual environment dans backend/.venv..."
    python3 -m venv "$BACKEND_DIR/.venv"
    source "$BACKEND_DIR/.venv/bin/activate"
    ok "Virtual environment créé"
fi

python3 -m pip install --quiet --upgrade pip
python3 -m pip install --quiet -r "$BACKEND_DIR/requirements.txt"
ok "Dépendances Python installées"

echo ""

# ── 6. Dépendances Node ───────────────────────────────────────────────────────
info "Installation des dépendances Node.js..."

if [ ! -f "$FRONTEND_DIR/package.json" ]; then
    err "Fichier $FRONTEND_DIR/package.json introuvable."
fi

npm install --prefix "$FRONTEND_DIR" --silent
ok "Dépendances Node.js installées"

echo ""

# ── 7. Fichier .env ───────────────────────────────────────────────────────────
ENV_FILE="$BACKEND_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    info "Création du fichier .env..."
    cat > "$ENV_FILE" <<'EOF'
# Clé API Anthropic (optionnel)
# Active la décomposition de but par Claude (claude-opus-4-8)
# Obtenir une clé sur : https://console.anthropic.com
ANTHROPIC_API_KEY=
EOF
    ok "Fichier backend/.env créé (configure ANTHROPIC_API_KEY pour activer l'IA)"
else
    ok "Fichier backend/.env déjà présent"
fi

# ── 8. Vérification ANTHROPIC_API_KEY ─────────────────────────────────────────
if [ -z "${ANTHROPIC_API_KEY}" ]; then
    # Lire depuis .env si présent
    KEY_FROM_ENV=$(grep -E '^ANTHROPIC_API_KEY=.+' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)
    if [ -z "$KEY_FROM_ENV" ]; then
        warn "ANTHROPIC_API_KEY non configurée — la décomposition de but utilisera le fallback rule-based."
        warn "Pour activer Claude : édite skills-discovery/backend/.env et ajoute ta clé."
    else
        ok "ANTHROPIC_API_KEY configurée dans .env"
    fi
else
    ok "ANTHROPIC_API_KEY configurée dans l'environnement"
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}   Installation terminée !             ${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
echo "Pour lancer le projet :"
echo ""
echo -e "  ${BLUE}Backend${NC}  →  cd skills-discovery/backend && python run.py"
echo -e "             →  http://localhost:8000"
echo ""
echo -e "  ${BLUE}Frontend${NC} →  cd skills-discovery/frontend && npm run dev"
echo -e "             →  http://localhost:5173"
echo ""
