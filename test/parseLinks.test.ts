import { describe, expect, it } from 'vitest';

import { parseLinks } from '../src/crawler/parseLinks.js';

describe('parseLinks', () => {
  it('returns unique href values', () => {
    const html = `
      <html>
        <body>
          <a href="/a">A</a>
          <a href="/a">Duplicate</a>
          <a href="/b">B</a>
        </body>
      </html>
    `;

    const links = parseLinks(html);
    expect(links.sort()).toEqual(['/a', '/b']);
  });

  it('ignores anchors without href attributes', () => {
    const html = `
      <html>
        <body>
          <a>No href</a>
          <a href="">Empty</a>
          <a href="  /c  ">Trimmed</a>
        </body>
      </html>
    `;

    const links = parseLinks(html);
    expect(links).toEqual(['/c']);
  });
});
