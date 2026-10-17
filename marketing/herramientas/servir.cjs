// Sirve solo la landing; investigación y tarifas internas quedan fuera del sitio.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.resolve(__dirname, '../12-landing-page');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const puerto = Number(process.env.PUERTO_MARKETING || 8790);
http.createServer((req, res) => {
  let nombre;
  try { nombre = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  // Vista previa aislada: sin API ni proxy hacia datos del negocio.
  if(nombre==='/api/v1/comercial/planes' && req.method==='GET'){res.writeHead(204,{'Cache-Control':'no-store'}).end();return;}
  const archivo = path.resolve(raiz, '.' + (nombre === '/' ? '/index.html' : nombre));
  if (!archivo.startsWith(raiz + path.sep) || !['GET', 'HEAD'].includes(req.method) || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) { res.writeHead(404).end('No encontrado'); return; }
  res.setHeader('Content-Type', mime[path.extname(archivo)] || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(archivo).pipe(res);
}).listen(puerto, '127.0.0.1', () => console.log(`Landing comercial: http://127.0.0.1:${puerto} — solo lectura, sin publicación externa.`));
