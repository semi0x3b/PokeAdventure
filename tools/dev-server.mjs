import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import api from '../api/game.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.env.SERVE_DIST === '1' ? path.join(projectRoot, 'dist') : projectRoot;
const port = Number(process.env.PORT || 4173);
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.webmanifest':'application/manifest+json', '.woff':'font/woff', '.woff2':'font/woff2' };
const allowedExtensions = new Set(Object.keys(mimeTypes).filter(ext=>ext!=='.mjs'));
const policy = JSON.parse(await fs.readFile(path.join(projectRoot,'vercel.json'),'utf8')).headers?.[0]?.headers || [];
const server = http.createServer(async (req, res) => {
  for(const {key,value} of policy)res.setHeader(key,value);
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/api/game' || url.pathname === '/api/game.mjs') return api(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  const segments = decoded.split('/');
  if (segments.some(segment => segment.startsWith('.') || ['api', 'lib', 'tools', 'node_modules', 'docs', 'lat.md'].includes(segment))) { res.writeHead(404).end(); return; }
  const file = path.resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
  if (!file.startsWith(`${root}${path.sep}`) || !allowedExtensions.has(path.extname(file))) { res.writeHead(404).end(); return; }
  try {
    const content = await fs.readFile(file);
    res.setHeader('Content-Type', mimeTypes[path.extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(200).end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404).end('파일을 찾을 수 없습니다.'); }
});
server.requestTimeout = 15000;
server.listen(port, '127.0.0.1', () => console.log(`게임 미리보기: http://127.0.0.1:${port}`));
