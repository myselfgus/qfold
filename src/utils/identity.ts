/**
 * Identity provisioning helpers for Qfold
 */

import type { Env } from '../types';
import { createPairwiseSubject } from './pairwise';

/**
 * Create a new Qfold identity.
 * In production this is called after successful WebAuthn registration.
 */
export async function provisionTwinUser(
  env: Env,
  userId: string,
  metadata?: Record<string, any>
): Promise<{ sub: string; doId: string }> {
  const pairwiseSub = await createPairwiseSubject(userId, 'qfold-internal', env.JWT_SECRET);

  // Instantiate the McpAgent DO for this user (named DO)
  const stub = env.MCP_AGENT.getByName(pairwiseSub);

  // Bootstrap initial user record inside the DO
  const initRequest = new Request('https://internal/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ userId, metadata }),
    headers: { 'Content-Type': 'application/json' }
  });

  await stub.fetch(initRequest);

  return {
    sub: pairwiseSub,
    doId: pairwiseSub
  };
}
