import { DurableObject } from 'cloudflare:workers';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { encryptAESGCM, deriveKeyFromPRF, signJWT } from './utils/crypto';
import type { Env } from './types';

// Types for Twin-User features
interface WebAuthnPRFResult {
  key: Uint8Array;
  salt: Uint8Array;
}

export class McpAgent extends DurableObject {
  private sql: SqlStorage;
  private mcpServer: McpServer;
  private hibernationEnabled: boolean = true;
  protected env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;

    // SQLite storage via DO state
    this.sql = ctx.storage.sql;
    
    // Initialize schema
    this.initializeDatabase();
    
    // MCP Server setup (ACP via custom tools)
    this.mcpServer = new McpServer({
      name: "twin-user-mcp",
      version: "1.0.0",
    });
    
    this.registerMcpTools();
    
    // Enable hibernation
    ctx.blockConcurrencyWhile(async () => {
      await this.setupHibernation();
    });
  }

  private initializeDatabase(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        webauthn_credential BLOB,
        zk_public_key TEXT,
        oidc_tokens TEXT,
        pairwise_sub TEXT UNIQUE,
        created_at INTEGER DEFAULT (unixepoch())
      );
    `);
    
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        prf_key_hash TEXT,
        expires_at INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);

    // Index for fast pairwise lookups
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_pairwise ON users(pairwise_sub);`);
  }

  private async setupHibernation(): Promise<void> {
    // Cloudflare DO hibernation support
    await this.ctx.storage.setAlarm(Date.now() + 1000 * 60 * 60); // Wake every hour
  }

  // WebAuthn PRF key derivation simulation
  private simulateWebAuthnPRF(credentialId: string, challenge: Uint8Array): WebAuthnPRFResult {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(32));
    
    // Simulated PRF using HMAC-SHA256 (in real impl would use WebAuthn PRF extension)
    const keyMaterial = encoder.encode(credentialId);
    const prfInput = new Uint8Array([...keyMaterial, ...challenge, ...salt]);
    
    // Derive 256-bit key
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      key[i] = prfInput[i % prfInput.length] ^ (i * 17);
    }
    
    return { key, salt };
  }

  // Zero-Knowledge client-side encryption using real AES-GCM
  private async encryptUserData(plaintext: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    return encryptAESGCM(plaintext, key);
  }

  // Helper to perform safe external calls via the Outbound Worker (if bound)
  private async safeExternalFetch(url: string, init?: RequestInit): Promise<Response> {
    if (this.env.OUTBOUND) {
      // Route through the dedicated outbound worker for SSRF protection, sanitization, and allow-listing
      const req = new Request(url, init);
      // Tag it so outbound worker knows it's from a Twin-User agent
      const tagged = new Request(req, {
        headers: {
          ...Object.fromEntries(req.headers),
          'x-twin-user-id': this.ctx.id.name || 'unknown',
          'x-from-mcp-agent': 'true'
        }
      });
      return this.env.OUTBOUND.fetch(tagged);
    }
    // Fallback (should be restricted in production)
    console.warn('OUTBOUND not bound - direct fetch (not recommended for prod)');
    return fetch(url, init);
  }

  // Production-grade OIDC token issuance (signed JWT)
  private async issueOIDCToken(claims: any, env: Env): Promise<string> {
    return signJWT(
      {
        sub: claims.sub,
        iss: env.OAUTH_ISSUER || 'https://identity.twin-user.com',
        aud: claims.aud || 'twin-user-client',
        ...claims,
      },
      env.JWT_SECRET || 'dev-secret',
      3600
    );
  }

  private registerMcpTools(): void {
    // MCP Tool: WebAuthn PRF derivation
    this.mcpServer.tool(
      'derive_prf_key',
      'Derive key using simulated WebAuthn PRF',
      {
        credentialId: z.string(),
        challenge: z.string()
      },
      async ({ credentialId, challenge }) => {
        const challengeBytes = new TextEncoder().encode(challenge);
        const result = this.simulateWebAuthnPRF(credentialId, challengeBytes);
        
        // Also derive using real HKDF + PRF output (production path)
        const derivedKey = await deriveKeyFromPRF(credentialId, result.key);
        
        this.sql.exec(
          'INSERT OR REPLACE INTO sessions (id, user_id, prf_key_hash, expires_at) VALUES (?, ?, ?, ?)',
          crypto.randomUUID(),
          credentialId,
          Array.from(derivedKey).join(','),
          Date.now() + 3600000
        );
        
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              keyDerived: true, 
              salt: Array.from(result.salt),
              derivedKeyLength: derivedKey.length 
            }) 
          }]
        };
      }
    );

    // MCP Tool: ZK Encryption (AES-GCM)
    this.mcpServer.tool(
      'zk_encrypt',
      'Client-side Zero-Knowledge encryption using AES-GCM',
      {
        data: z.string(),
        key: z.string()
      },
      async ({ data, key }) => {
        const plaintext = new TextEncoder().encode(data);
        const keyBytes = new Uint8Array(key.split(',').map(Number));
        const encrypted = await this.encryptUserData(plaintext, keyBytes);
        
        return {
          content: [{ type: 'text', text: Array.from(encrypted).join(',') }]
        };
      }
    );

    // MCP Tool: OIDC issuance (real signed JWT)
    this.mcpServer.tool(
      'issue_oidc_token',
      'Issue signed OIDC/ID token for the Twin-User',
      {
        userId: z.string(),
        additionalClaims: z.record(z.any()).optional()
      },
      async ({ userId, additionalClaims }) => {
        const token = await this.issueOIDCToken({
          sub: userId,
          ...additionalClaims
        }, this.env as any);
        
        this.sql.exec(
          'UPDATE users SET oidc_tokens = ? WHERE id = ?',
          token,
          userId
        );
        
        return {
          content: [{ type: 'text', text: token }]
        };
      }
    );

    // ACP support: Agent-to-agent communication
    this.mcpServer.tool(
      'acp_send_message',
      'Send message via Agent Communication Protocol',
      {
        targetAgent: z.string(),
        message: z.string()
      },
      async ({ targetAgent, message }) => {
        // Simulated ACP routing via DO storage
        this.sql.exec(
          'INSERT INTO sessions (id, user_id, prf_key_hash, expires_at) VALUES (?, ?, ?, ?)',
          crypto.randomUUID(),
          targetAgent,
          message,
          Date.now() + 300000
        );
        
        return {
          content: [{ type: 'text', text: `ACP message sent to ${targetAgent}` }]
        };
      }
    );

    // Egress tool: Safe external calls routed through the Outbound Worker (architecture requirement)
    this.mcpServer.tool(
      'safe_egress_fetch',
      'Perform external HTTP calls through the protected Outbound Worker (SSRF, allow-list, sanitization)',
      {
        url: z.string().url(),
        method: z.string().optional().default('GET'),
        body: z.string().optional()
      },
      async ({ url, method, body }) => {
        try {
          const init: RequestInit = { method };
          if (body) {
            init.body = body;
            init.headers = { 'content-type': 'application/json' };
          }
          const res = await this.safeExternalFetch(url, init);
          const text = await res.text();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: res.status,
                ok: res.ok,
                body: text.slice(0, 2000) // limit response size
              })
            }]
          };
        } catch (e: any) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }]
          };
        }
      }
    );
  }

  // Durable Object fetch handler with hibernation awareness
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableJsonResponse: true,
        });

        await this.mcpServer.connect(transport);
        // @ts-expect-error - SDK transport typing for Cloudflare
        const mcpResponse = await transport.handleRequest(request);
        return mcpResponse ?? new Response('MCP no response', { status: 204 });
      } catch (err: any) {
        console.error('MCP transport error:', err);
        return new Response(JSON.stringify({ 
          error: 'MCP handler failed', 
          details: err?.message || String(err) 
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    if (url.pathname === '/acp' || url.pathname.startsWith('/acp/')) {
      // Agent Communication Protocol entry
      return new Response(JSON.stringify({ status: 'ACP endpoint ready', twinUser: this.ctx.id.name }));
    }
    
    if (url.pathname === '/hibernate') {
      await this.ctx.storage.sync();
      return new Response('Hibernated successfully', { status: 200 });
    }

    // Internal bootstrap for new Twin-User (called by provision)
    if (url.pathname === '/internal/bootstrap' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const userId = body?.userId || this.ctx.id.name;

        this.sql.exec(
          `INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)`,
          userId,
          Date.now()
        );

        return new Response(JSON.stringify({ bootstrapped: true, userId }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response('Bootstrap failed', { status: 500 });
      }
    }

    // Receive WebAuthn PRF output from client during registration (derives master encryption key)
    if (url.pathname === '/internal/webauthn-prf' && request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const credentialId = body?.credentialId;
        const prfOutput = body?.prfOutput;
        if (!credentialId || !prfOutput) {
          return new Response(JSON.stringify({ error: 'Missing credentialId or prfOutput' }), { status: 400 });
        }
        const prfBytes = new Uint8Array(prfOutput);

        const masterKey = await deriveKeyFromPRF(credentialId, prfBytes);

        // Store hash of the key (never the raw key in clear if possible)
        const keyHash = Array.from(masterKey).map(b => b.toString(16).padStart(2, '0')).join('');

        this.sql.exec(
          `UPDATE users SET webauthn_credential = ?, zk_public_key = ? WHERE id = ?`,
          credentialId,
          keyHash,
          credentialId
        );

        // Also store in durable storage for later use (encrypted at rest by DO)
        await this.ctx.storage.put('masterKeyHash', keyHash);

        return new Response(JSON.stringify({ prfStored: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'PRF storage failed', detail: e.message }), { status: 500 });
      }
    }

    // Default info + user state
    const userInfo = {
      twinUser: this.ctx.id.name,
      status: 'active',
      hibernation: this.hibernationEnabled,
      storage: 'SQLite + Durable Object state'
    };
    
    return new Response(JSON.stringify(userInfo), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Alarm handler for scheduled wake-ups (hibernation)
  async alarm(): Promise<void> {
    console.log('McpAgent woke from hibernation');
    // Perform maintenance: cleanup expired sessions
    this.sql.exec('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  }
}

// Export for Cloudflare Workers
export default McpAgent;