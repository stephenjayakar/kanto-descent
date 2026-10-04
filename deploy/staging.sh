#!/bin/sh
# Deploy the current branch to STAGING (https://kanto-descent-staging.stephenjayakar.chatgpt.site), which runs on the
# Convex DEV deployment (neat-kudu-314: its own allowlist and packs; its SITE_URL lists the staging origin).
set -e
[ -d "$HOME/.local/node/bin" ] && PATH="$HOME/.local/node/bin:$PATH" # this Mac keeps Node 22 there
cd "$(dirname "$0")/.."
[ -z "$(git status --porcelain)" ] || { echo "commit your changes first (the site is pushed from git)"; exit 1; }
npx convex dev --once
node tools/upload_packs.mjs
OUT=dist-staging CONVEX_URL_PROD=https://neat-kudu-314.convex.cloud node tools/build_site.mjs
codex exec --dangerously-bypass-approvals-and-sandbox -C "$PWD" - < deploy/staging_sites_prompt.txt | tail -n 12
