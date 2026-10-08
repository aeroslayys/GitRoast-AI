import { isIP } from 'node:net';
// Honor forwarded IPs only when the deployment operator knows how many trusted
// proxy hops appended addresses. Never trust the leftmost user-supplied XFF value.
export function requestIdentity(req) {
  const socketIP = req.socket?.remoteAddress || 'unknown';
  const hops = Number(process.env.TRUSTED_PROXY_HOPS || 0);
  if (!Number.isSafeInteger(hops) || hops < 1 || hops > 5) return socketIP;
  const header = req.headers?.['x-forwarded-for'];
  if (typeof header !== 'string' || header.length > 512) return socketIP;
  const chain = header.split(',').map(part => part.trim());
  if (chain.length < hops || chain.length > 20) return socketIP;
  const candidate = chain[chain.length - hops];
  return isIP(candidate) ? candidate : socketIP;
}

