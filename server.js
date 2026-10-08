// Minimal HTTP entrypoint: response headers, route dispatch and startup.
import http from 'node:http';
import { json } from './http/response.js';
import { serveAsset } from './http/assets.js';
import { handleProfileRoute } from './http/profile-routes.js';
import { handleImprovementRoute } from './http/improvement-routes.js';
export { requestIdentity } from './http/request-identity.js';

export async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://avatars.githubusercontent.com data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'");
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  if (url.pathname === '/health') return json(res, 200, { ok: true });
  if (url.pathname === '/api/progress' || url.pathname === '/api/analyze')
    return handleProfileRoute(url, req, res);
  if (['/api/repo-evidence', '/api/readme-doctor', '/api/fixit'].includes(url.pathname))
    return handleImprovementRoute(url, req, res);
  return serveAsset(url.pathname, res);
}
export function createApp() {
  return http.createServer((req, res) => handle(req, res).catch(error => {
    console.error('Unhandled error:', error);
    if (!res.headersSent) json(res, 500, { error: 'Server error.' });
    else res.end();
  }));
}
if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT) || 8080;
  createApp().listen(port, '0.0.0.0', () => console.log('GitRoast AI listening on ' + port));
}
