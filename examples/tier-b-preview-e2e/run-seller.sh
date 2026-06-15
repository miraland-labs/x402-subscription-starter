#!/usr/bin/env bash
# Start x402-subscription-starter in Tier B mode using example env only.
# Does not modify repo-root .env or package.json.
set -euo pipefail

EXAMPLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STARTER_ROOT="$(cd "${EXAMPLE_DIR}/../.." && pwd)"
ENV_FILE="${EXAMPLE_DIR}/.env.local"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "  cp ${EXAMPLE_DIR}/.env.example ${ENV_FILE}"
  echo "  Set SUBSCRIPTION_AUTH_MERCHANT_SECRET_KEY (see README)"
  exit 1
fi

cd "${STARTER_ROOT}"

if [[ ! -d node_modules ]]; then
  echo "Installing starter dependencies..."
  npm install
fi

if [[ ! -f dist/server.js ]]; then
  echo "Building starter..."
  npm run build
fi

echo "Starting seller (Tier B) with env from examples/tier-b-preview-e2e/.env.local ..."
export DOTENV_CONFIG_PATH="${ENV_FILE}"
exec npm run dev
