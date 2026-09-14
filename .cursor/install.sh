#!/usr/bin/env bash
# Cloud Agent install: pin Node to the major in package.json `engines` (24.x)
# and install dependencies from the committed lockfile.
#
# The Cloud Agent base image ships nvm plus a platform `node` on PATH
# (`/exec-daemon/node`, currently v22) that shadows nvm. We install Node 24 with
# nvm and make sure its bin directory wins on PATH for this script and for the
# interactive/`terminals` shells a future agent will use.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

nvm install 24
nvm alias default 24

# Prepend Node 24 ahead of the platform node for the rest of this script.
export PATH="$(dirname "$(nvm which 24)"):$PATH"

# Make Node 24 win in future login/interactive shells too (idempotent).
MARK="# chatprob-node24"
if ! grep -qF "$MARK" "$HOME/.bashrc" 2>/dev/null; then
  {
    echo ""
    echo "$MARK"
    echo 'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"'
    echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'
    echo 'nvm use 24 >/dev/null 2>&1 || true'
    echo 'export PATH="$(nvm which 24 2>/dev/null | xargs -r dirname):$PATH"'
  } >>"$HOME/.bashrc"
fi

echo "Using node $(node -v) / npm $(npm -v)"
npm ci

# --- Vercel Development env pull (best-effort) ------------------------------
# Pull the ChatProb project's Development env vars (OPENAI_API_KEY, etc.) into
# .env.local when the Cloud Agent secret `Vercel_Token` is present. This is
# strictly best-effort: Node 24 + `npm ci` above are the guaranteed baseline,
# so nothing in this block is allowed to fail the install.
pull_vercel_dev_env() {
  if [ -z "${Vercel_Token:-}" ]; then
    echo "[vercel] Vercel_Token secret not set — skipping Vercel env pull; .env.local not created. (Node 24 + npm ci are unaffected.)"
    return 0
  fi

  echo "[vercel] Vercel_Token detected — installing Vercel CLI and pulling Development env into .env.local"
  export VERCEL_TOKEN="$Vercel_Token"        # CLI reads the token from this env var
  export VERCEL_TELEMETRY_DISABLED=1

  if ! npm install -g vercel; then
    echo "[vercel] WARN: 'npm install -g vercel' failed — skipping env pull. .env.local not created."
    return 0
  fi

  # The repo directory basename is not "chatprob", so the project name must be
  # explicit. Linking writes .vercel/ (gitignored).
  if ! vercel link --yes --project chatprob >/tmp/chatprob-vercel-link.log 2>&1; then
    echo "[vercel] WARN: 'vercel link' failed — skipping env pull. .env.local not created. Details:"
    sed 's/^/[vercel]   /' /tmp/chatprob-vercel-link.log 2>/dev/null || true
    return 0
  fi

  if ! vercel env pull .env.local --environment=development --yes >/tmp/chatprob-vercel-pull.log 2>&1; then
    echo "[vercel] WARN: 'vercel env pull' failed — .env.local not created. Details:"
    sed 's/^/[vercel]   /' /tmp/chatprob-vercel-pull.log 2>/dev/null || true
    return 0
  fi

  local var_count
  var_count="$(grep -cE '^[A-Za-z_]+=' .env.local 2>/dev/null || echo 0)"
  echo "[vercel] Pulled Development env into .env.local (${var_count} variables)."
}

pull_vercel_dev_env
