/**
 * SSRF Prevention Guard
 * Blocks requests to internal networks, localhost, private IPs, metadata endpoints.
 */

const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./, // AWS metadata
  /^metadata\.google\.internal$/,
  /^::1$/,
  /^fe80:/i,
];

export function isSSRFAttempt(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return BLOCKED_PATTERNS.some(pattern => pattern.test(host)) || 
         url.protocol === 'file:' ||
         url.port === '22' || url.port === '3306'; // Block common internal ports
}
