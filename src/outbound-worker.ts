/**
 * Outbound Worker for Twin-User Agents (Production)
 * 
 * Responsibilities per architecture:
 * - Egress control (whitelist)
 * - SSRF prevention
 * - Header + payload sanitization
 * - Approved MCP tool validation via KV
 * - Dispatch integration for per-user isolation + audit
 */

import { validateMCPToolCall } from './mcp-registry';
import { sanitizeRequest, sanitizeResponse } from './security-sanitizer';
import { isSSRFAttempt } from './ssrf-guard';
import { dispatchOutbound } from './dispatch-integration';
import type { Env } from './types';

// Default safe egress list if not provided via vars
const DEFAULT_ALLOWED = ['api.openai.com', 'api.anthropic.com', 'api.groq.com'];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // 1. SSRF Prevention (critical)
    if (isSSRFAttempt(url)) {
      return new Response(JSON.stringify({ error: 'SSRF attempt blocked' }), { 
        status: 403, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 2. Egress allowlist from binding or default
    const allowedRaw = env.ALLOWED_EGRESS_DOMAINS || DEFAULT_ALLOWED.join(',');
    const allowedDomains = allowedRaw.split(',').map(d => d.trim().toLowerCase());
    const hostname = url.hostname.toLowerCase();

    const isAllowed = allowedDomains.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Egress not permitted to this domain', hostname }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 3. MCP tool approval check (if applicable)
    if (url.pathname.startsWith('/mcp/') || url.pathname.includes('/tool/')) {
      const isApproved = await validateMCPToolCall(request, env.RATE_LIMITS); // reuse RATE_LIMITS or dedicated KV
      if (!isApproved) {
        return new Response(JSON.stringify({ error: 'Unapproved MCP tool call' }), { 
          status: 403,
          headers: { 'Content-Type': 'application/json' } 
        });
      }
    }

    // 4. Sanitize
    const sanitizedReq = await sanitizeRequest(request);

    // 5. Route through dispatch for per-Twin-User isolation + logging
    const dispatchedResponse = await dispatchOutbound(sanitizedReq, env.DISPATCHER, ctx);

    return sanitizeResponse(dispatchedResponse);
  }
};
