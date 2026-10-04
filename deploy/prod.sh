#!/bin/sh
# Deploy Kanto Descent to PRODUCTION (https://kanto-descent.stephenjayakar.chatgpt.site):
# Convex functions (prod), the asset packs (Convex storage), the static site (ChatGPT Sites, via the codex CLI's
# Sites connector). Needs: `npx convex` logged in (~/.convex/config.json), codex logged in to the ChatGPT account
# that owns the site. The site is pushed from git, so commit first.
set -e
[ -d "$HOME/.local/node/bin" ] && PATH="$HOME/.local/node/bin:$PATH" # this Mac keeps Node 22 there
cd "$(dirname "$0")/.."
[ "$(git rev-parse --abbrev-ref HEAD)" = master ] || { echo "check out master first"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "commit your changes first (the site is pushed from git)"; exit 1; }
npx convex deploy -y
node tools/upload_packs.mjs --prod
node tools/build_site.mjs
codex exec --dangerously-bypass-approvals-and-sandbox -C "$PWD" - < deploy/prod_sites_prompt.txt | tail -n 12
echo "live: $(curl -s https://kanto-descent.stephenjayakar.chatgpt.site/src/game/version.js | grep -o "VERSION = '[^']*'")"
