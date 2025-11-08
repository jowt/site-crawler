import { load } from 'cheerio';
import type { Element as CheerioElement } from 'domhandler';

import { createParseError } from '../errors.js';

export function parseLinks(html: string): string[] {
  try {
    const $ = load(html);
    const hrefs = new Set<string>();

    $('a[href]').each((_idx: number, element: CheerioElement) => {
      const href = $(element).attr('href');
      if (!href) {
        return;
      }

      const trimmed = href.trim();
      if (trimmed.length === 0) {
        return;
      }

      hrefs.add(trimmed);
    });

    return [...hrefs];
  } catch (error) {
    throw createParseError('Failed to parse links from HTML', { htmlLength: html.length }, { cause: error });
  }
}
