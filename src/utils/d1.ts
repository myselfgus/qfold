/**
 * D1 schema utilities for Qfold (production)
 * Idempotent table creation for the shared D1 databases.
 */

import type { Env } from '../types';

export async function ensureD1Schema(env: Env) {
  // Main DB schema
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      pairwise_sub TEXT UNIQUE,
      email TEXT,
      display_name TEXT,
      webauthn_credential_id TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER
    );
  `);

  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_users_pairwise ON users(pairwise_sub);`);

  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS oidc_clients (
      client_id TEXT PRIMARY KEY,
      client_name TEXT,
      redirect_uris TEXT,
      allowed_scopes TEXT,
      is_trusted INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      actor_sub TEXT,
      target TEXT,
      details TEXT,
      ip_hash TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);`);

  // Audit DB (separate for compliance isolation)
  await env.AUDIT_DB.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      sub TEXT,
      payload TEXT,
      ts INTEGER DEFAULT (unixepoch())
    );
  `);
}

export async function logAudit(env: Env, eventType: string, actorSub: string | null, details: any) {
  try {
    await env.AUDIT_DB.prepare(
      `INSERT INTO events (type, sub, payload) VALUES (?, ?, ?)`
    ).bind(eventType, actorSub, JSON.stringify(details)).run();

    // Also to main DB audit_logs for convenience
    await env.DB.prepare(
      `INSERT INTO audit_logs (event_type, actor_sub, details) VALUES (?, ?, ?)`
    ).bind(eventType, actorSub, JSON.stringify(details)).run();
  } catch (e) {
    console.error('Audit log failed:', e);
  }
}
