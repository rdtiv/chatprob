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
