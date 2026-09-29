#!/usr/bin/env bash
# Safe deploy for MAPL Task Flow: always targets dxlpwnmoohkddkkqoxzt and refuses if the Supabase CLI
# is signed in to an account that can't see it (prevents cross-project deploys).
set -euo pipefail
REF="dxlpwnmoohkddkkqoxzt"
cd "$(dirname "$0")/.."
if ! npx supabase projects list 2>/dev/null | grep -q "$REF"; then
  echo ""
  echo "STOP: the Supabase CLI is not signed in to the MAPL Task Flow account (lingeshmaster25-blip)."
  echo "Run:  npx supabase logout && npx supabase login   (approve in a browser logged in as lingeshmaster25-blip)"
  exit 1
fi
FNS="${*:-admin-create-user admin-update-user admin-delete-user send-email-notification send-push}"
for f in $FNS; do
  echo "== deploying $f to MAPL Task Flow ($REF)"
  npx supabase functions deploy "$f" --project-ref "$REF"
done
echo "Done: MAPL Task Flow functions deployed."
