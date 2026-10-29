import type { ResumeBlock } from './types';

export interface PaginationResult {
  pages: number[][];
  overflow: number[];
}

export function paginateBlocks(
  blocks: ResumeBlock[],
  heights: number[],
  contentHeight: number,
): PaginationResult {
  if (blocks.length === 0) return { pages: [[]], overflow: [] };
  const pages: number[][] = [];
  const overflow: number[] = [];
  let current: number[] = [];
  let used = 0;

  // Place a heading chain as a unit. If even an empty page cannot hold it,
  // report overflow rather than silently exporting isolated heading pages.
  for (let start = 0; start < blocks.length;) {
    let end = start;
    while (end + 1 < blocks.length && blocks[end].keepWithNext) end += 1;
    const group = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
    const height = group.reduce((sum, index) => sum + Math.max(0, heights[index] ?? 0), 0);
    if (current.length && used + height > contentHeight) {
      pages.push(current);
      current = [];
      used = 0;
    }
    if (height > contentHeight + 1) overflow.push(start);
    current.push(...group);
    used += height;
    start = end + 1;
  }
  if (current.length) pages.push(current);
  return { pages, overflow };
}

export function blocksForPage(blocks: ResumeBlock[], page: number[]): ResumeBlock[] {
  return page.map(index => blocks[index]).filter(Boolean);
}
