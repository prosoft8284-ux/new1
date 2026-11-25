// سرور استاتیک بدون وابستگی برای اپلیکیشن بانک سوال
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const ALLOWED = ['app', 'data'];

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const segments = urlPath.split('/').filter(Boolean);
  if (!segments.length || segments.some((s) => s === '..' || s.startsWith('.'))) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }

  const top = segments[0];
  const base = ALLOWED.includes(top) ? path.join(ROOT, top, ...segments.slice(1)) : path.join(ROOT, 'app', ...segments);

  fs.readFile(base, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('یافت نشد: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(base)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(buf);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`soalat-bank-4000 روی http://${HOST}:${PORT} بالا آمد`);
});
