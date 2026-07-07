# Twin-User Identity — Production Deployment on Cloudflare

This is the production implementation of the architecture described in "Arquitetura Identidade Cloudflare AI.pdf".

## Architecture Highlights Implemented
- Per-user `McpAgent` Durable Objects (state + SQLite + hibernation)
- Workers for Platforms Dispatch Namespace in **untrusted** mode
- Pairwise subject identifiers (privacy preserving OIDC)
- OIDC Provider endpoints (discovery, authorize, token, userinfo, jwks)
- MCP + ACP tool support inside each user's agent
- Real AES-GCM Zero-Knowledge encryption hooks
- WebAuthn PRF key derivation (simulation + real HKDF)
- Secure Outbound Worker (SSRF guard + sanitization + allowlist)
- KV, R2, D1 bindings for sessions, assets, audit

## Prerequisites
- Cloudflare account with Workers, D1, KV, R2, Durable Objects enabled
- wrangler authenticated (`wrangler login`)
- Domain (optional): identity.twin-user.com

## Step 1: Create Cloudflare Resources (Production)

Run the helper script (recommended):

```bash
./scripts/create-cloudflare-resources.sh production
```

It creates the Dispatch Namespace (untrusted), KVs, R2 buckets and D1 databases.
```

## Step 2: Update wrangler.jsonc

Replace the `PROD_*_PLACEHOLDER` values with the real IDs returned by the commands above.

Also set secrets:

```bash
wrangler secret put JWT_SECRET --env production
wrangler secret put OAUTH_ISSUER --env production   # optional override
```

**Note:** Durable Objects and migrations are now declared inside `env.production` for correct inheritance.

## Step 3: Apply D1 Migrations

```bash
npm run d1:migrate:prod
npm run d1:migrate:audit:prod
```

This creates the core tables (users, oidc_clients, audit_logs, etc.).

## Step 4: Deploy

```bash
npm install
npm run typecheck
npm run deploy
```

## Step 4: (Optional) Deploy dedicated Outbound Worker

```bash
wrangler deploy src/outbound-worker.ts --name twin-user-outbound --env production
```

Then bind it in wrangler.jsonc under the production env.

## Important Production Notes
- All per-user state lives inside `McpAgent` DOs (hibernates automatically)
- Never store raw user encryption keys in Cloudflare — they are derived client-side via WebAuthn PRF
- Use Pairwise subjects for all third-party SaaS logins
- Route all external tool calls from agents through the Outbound Worker

## Current Limitations vs Full Architecture (PDF)
- Workers for Platforms + untrusted Dispatch Namespace requires enabling Workers for Platforms on the account.
- When enabled, uncomment the dispatch_namespaces section, recreate the namespace, and redeploy.
- Custom domain `identity.twin-user.com` needs to be added to the zone and the route re-enabled.

## Live Production Deployment (current)

- Main Worker: https://twin-user-identity-prod.voither.workers.dev
- Outbound Worker: https://twin-user-outbound.voither.workers.dev

## Endpoints (after deploy)
- `GET /.well-known/openid-configuration`
- `POST /token`
- `GET /userinfo`
- `GET /mcp` (per Twin-User)
- `POST /agent/{userId}` (via Dispatch Namespace - requires Workers for Platforms)
- `POST /webauthn/challenge`
- `POST /webauthn/register`
- `POST /provision`
