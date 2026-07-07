-- Qfold Identity Platform - Initial D1 Schema
-- Run with: wrangler d1 migrations apply qfold-db --env production

-- Core users / identities (high level records, actual state is in per-user DO SQLite)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  pairwise_sub TEXT UNIQUE,
  email TEXT,
  display_name TEXT,
  webauthn_credential_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_pairwise ON users(pairwise_sub);

-- OIDC Clients (relying parties that use this IdP)
CREATE TABLE IF NOT EXISTS oidc_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT,
  redirect_uris TEXT,           -- JSON array
  allowed_scopes TEXT,          -- space separated
  is_trusted INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Audit / compliance logs (as per architecture)
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  actor_sub TEXT,
  target TEXT,
  details TEXT,                 -- JSON
  ip_hash TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_sub);

-- Sessions / rate limit auxiliary (main sessions in KV)
CREATE TABLE IF NOT EXISTS sessions_meta (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  expires_at INTEGER,
  metadata TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Optional: token revocation list (for logout / security)
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti TEXT PRIMARY KEY,
  revoked_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER
);
