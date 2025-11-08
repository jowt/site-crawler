import { CrawlQueueItem } from '../../types.js';

const COMPACT_THRESHOLD = 32;

export class CrawlQueue {
  private queue: CrawlQueueItem[] = [];
  private head = 0;
  private readonly seen = new Set<string>();

  constructor(initialUrl: string) {
    this.markVisited(initialUrl);
    this.queue.push({ url: initialUrl, depth: 0, attempt: 0 });
  }

  enqueue(item: CrawlQueueItem): void {
    this.queue.push(item);
  }

  enqueueIfNew(url: string, depth: number): boolean {
    if (this.seen.has(url)) {
      return false;
    }

    this.markVisited(url);
    this.queue.push({ url, depth, attempt: 0 });
    return true;
  }

  dequeue(): CrawlQueueItem | undefined {
    const next = this.queue[this.head];
    if (!next) {
      return undefined;
    }

    this.head += 1;

    if (this.head >= COMPACT_THRESHOLD && this.head * 2 >= this.queue.length) {
      this.queue.splice(0, this.head);
      this.head = 0;
    }

    return next;
  }

  markVisited(url: string): void {
    this.seen.add(url);
  }

  get pending(): number {
    return this.queue.length - this.head;
  }

  get uniqueCount(): number {
    return this.seen.size;
  }
}
