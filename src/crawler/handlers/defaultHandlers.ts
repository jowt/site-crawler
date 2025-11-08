import { CrawlHandlers, OutputFormat, PageResult } from '../../types.js';
import { writePage } from '../../util/output.js';

export function createDefaultHandlers(format: OutputFormat): CrawlHandlers {
  return {
    onPage: (result: PageResult) => writePage(result, format),
  };
}
