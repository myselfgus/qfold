/**
 * Dispatch integration for Qfold outbound + per-user isolation.
 * Works with Workers for Platforms (untrusted dispatch namespaces).
 */

export async function dispatchOutbound(
  request: Request, 
  dispatchNs: any, 
  _ctx: ExecutionContext
): Promise<Response> {
  const dispatchKey = request.headers.get('x-qfold-id') || 
                      request.headers.get('x-qfold-sub') || 
                      'default-qfold';

  try {
    const worker = dispatchNs.get(dispatchKey);
    const resp = await worker.fetch(request);
    return resp;
  } catch (err: any) {
    console.error('[TwinUser] Dispatch failed:', err?.message || err);

    // Secure fallback: never allow raw external fetch from inside untrusted context
    return new Response(JSON.stringify({
      error: 'Dispatch failed - egress blocked',
      detail: 'All external traffic must go through approved outbound worker'
    }), { 
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
