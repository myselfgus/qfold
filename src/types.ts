/**
 * Central type definitions for Twin-User Identity Platform (Production)
 */

export interface Env {
  // Durable Objects
  USER_DO: DurableObjectNamespace;
  MCP_AGENT: DurableObjectNamespace;

  // Dispatch Namespace (Workers for Platforms - Untrusted)
  // Optional until Workers for Platforms is enabled on the account
  DISPATCHER?: DispatchNamespace;

  // Storage
  SESSIONS: KVNamespace;
  PROFILES: KVNamespace;
  RATE_LIMITS: KVNamespace;

  // Object storage
  ASSETS: R2Bucket;
  BACKUPS: R2Bucket;

  // Databases
  DB: D1Database;
  AUDIT_DB: D1Database;

  // Configuration
  OAUTH_ISSUER: string;           // e.g. "https://identity.twin-user.com"
  OAUTH_CLIENTS: string;          // JSON string of registered clients
  JWT_SECRET: string;             // For signing (in production use private key via secret)
  ALLOWED_EGRESS_DOMAINS: string; // Comma separated

  // Optional outbound worker binding (for secure egress)
  OUTBOUND?: Fetcher;

  // Admin token for one-off operations (set via wrangler secret or var)
  ADMIN_INIT_TOKEN?: string;
}

export interface PairwiseSubject {
  sub: string;
  sector: string;
}

export interface WebAuthnPRFResult {
  key: Uint8Array;
  salt: Uint8Array;
}

export interface ZKEncryptionResult {
  ciphertext: Uint8Array;
  iv: Uint8Array;
}

export interface OIDCClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  [key: string]: any;
}

export interface TwinUserSession {
  id: string;
  userId: string;
  pairwiseSub: string;
  expiresAt: number;
  prfKeyHash?: string;
}
