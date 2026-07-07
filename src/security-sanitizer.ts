/**
 * Security Sanitization for requests/responses
 * Removes auth tokens, cookies, internal headers, etc.
 */

const SENSITIVE_HEADERS = [
  'authorization', 'cookie', 'x-api-key', 'x-auth-token',
  'cf-connecting-ip', 'x-forwarded-for', 'x-real-ip'
];

export async function sanitizeRequest(req: Request): Promise<Request> {
  const headers = new Headers(req.headers);
  SENSITIVE_HEADERS.forEach(h => headers.delete(h));
  
  // Additional payload sanitization if JSON
  if (req.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = await req.json() as any;
      // Remove any internal fields
      if (body) {
        delete body._internal;
        delete body.twinUserSecrets;
      }
      return new Request(req.url, {
        method: req.method,
        headers,
        body: JSON.stringify(body)
      });
    } catch {}
  }
  
  return new Request(req.url, { method: req.method, headers, body: req.body });
}

export function sanitizeResponse(res: Response): Response {
  const headers = new Headers(res.headers);
  // Remove server identification etc.
  headers.delete('server');
  headers.delete('x-powered-by');
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
}
