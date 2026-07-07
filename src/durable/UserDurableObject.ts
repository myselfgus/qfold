import { DurableObject } from 'cloudflare:workers';

/**
 * Legacy / thin User DO wrapper.
 * Primary per-user agent is now McpAgent (see architecture).
 * Kept for migration compatibility.
 */
export class UserDurableObject extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sub = url.searchParams.get('sub') || this.ctx.id.name;

    // Delegate to the real McpAgent implementation
    const stub = (this.env as any).MCP_AGENT?.getByName?.(sub);
    if (stub) {
      return stub.fetch(request);
    }

    return new Response(JSON.stringify({
      twinUser: this.ctx.id.name,
      status: 'active',
      note: 'Delegating to McpAgent DO'
    }), { headers: { 'Content-Type': 'application/json' } });
  }
}
