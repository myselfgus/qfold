import { createPairwiseSubject as createPairwise } from './crypto';

export async function createPairwiseSubject(
  userId: string,
  sectorOrClientId: string,
  secret?: string
): Promise<string> {
  return createPairwise(userId, sectorOrClientId, secret || 'twin-user-pairwise-secret');
}
