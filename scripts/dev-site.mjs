#!/usr/bin/env node
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 3001);

const routes = new Map([
  [
    '/',
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Dev Site</title>
  </head>
  <body>
    <h1>Welcome</h1>
    <nav>
      <a href="/about">About</a>
      <a href="/help/faq">FAQ</a>
      <a href="/blog">Blog</a>
      <a href="/same-page#section">Self Link</a>
      <a href="https://example.com/external">External</a>
    </nav>
  </body>
</html>`,
  ],
  [
    '/about',
    `<!doctype html>
<html lang="en">
  <body>
    <h1>About</h1>
    <a href="/">Home</a>
    <a href="/team">Team</a>
  </body>
</html>`,
  ],
  [
    '/help/faq',
    `<!doctype html>
<html lang="en">
  <body>
    <h1>FAQ</h1>
    <a href="/help/contact">Contact</a>
    <a href="/">Home</a>
    <a href="/help/faq?utm_source=newsletter">Tracking</a>
  </body>
</html>`,
  ],
  [
    '/help/contact',
    `<!doctype html>
<html lang="en">
  <body>
    <h1>Contact</h1>
    <a href="/help/faq">Back to FAQ</a>
  </body>
</html>`,
  ],
  [
    '/team',
    `<!doctype html>
<html lang="en">
  <body>
    <h1>Team</h1>
    <a href="/team/engineering">Engineering</a>
    <a href="/team#leadership">Leadership</a>
  </body>
</html>`,
  ],
  [
    '/team/engineering',
    `<!doctype html>
<html lang="en">
  <body>
    <h1>Engineering</h1>
    <a href="/">Home</a>
  </body>
</html>`,
  ],
  [
    '/blog',
    `<!doctype html>
<html lang="en">
  <body>
    <h1>Blog</h1>
    <a href="/blog/post-1">Post 1</a>
    <a href="/blog/post-2/">Post 2</a>
  </body>
</html>`,
  ],
  [
    '/blog/post-1',
    `<!doctype html>
<html lang="en">
  <body>
    <h1>Post 1</h1>
    <a href="/blog">Back</a>
  </body>
</html>`,
  ],
  [
    '/blog/post-2',
    `<!doctype html>
<html lang="en">
  <body>
    <h1>Post 2</h1>
    <a href="/blog">Back</a>
  </body>
</html>`,
  ],
]);

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${PORT}`}`);
  const path = url.pathname.endsWith('/') && url.pathname !== '/' ? url.pathname.slice(0, -1) : url.pathname;
  const html = routes.get(path);

  if (!html) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html');
    res.end('<h1>Not Found</h1>');
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`Dev site listening on http://localhost:${PORT}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
