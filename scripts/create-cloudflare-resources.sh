#!/bin/bash
set -e

echo "=== Qfold Cloudflare Production Resource Creator ==="
echo "This script creates the required namespaces, buckets, DBs and dispatch."
echo "Run it once. It is mostly idempotent."
echo ""

ENV=${1:-production}
NPX="npx wrangler"

echo "Creating Dispatch Namespace (untrusted)..."
$NPX dispatch-namespace create qfold-dispatch || true

echo "Creating KV namespaces..."
$NPX kv namespace create QFOLD_SESSIONS --env $ENV || true
$NPX kv namespace create QFOLD_PROFILES --env $ENV || true
$NPX kv namespace create QFOLD_RATE_LIMITS --env $ENV || true

echo "Creating R2 buckets..."
$NPX r2 bucket create qfold-assets --env $ENV || true
$NPX r2 bucket create qfold-backups --env $ENV || true

echo "Creating D1 databases..."
$NPX d1 create qfold-db --env $ENV || true
$NPX d1 create qfold-audit --env $ENV || true

echo ""
echo "=== IMPORTANT ==="
echo "1. Copy the IDs printed above into wrangler.jsonc"
echo "2. Run: npx wrangler secret put JWT_SECRET --env $ENV"
echo "3. Run: npm run d1:migrate:prod && npm run d1:migrate:audit:prod"
echo "4. Then: npm run deploy"
echo ""
echo "Done with resource creation phase."
