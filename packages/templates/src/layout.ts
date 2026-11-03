import { getTemplateSpec } from './catalog';
import type { BlockSplit, ResumeBlock } from './types';

export const SIDEBAR_PADDING_PX = 20;

export interface TemplateLayout {
  kind: 'single' | 'timeline' | 'sidebar' | 'split';
  sidebarWidthPx: number;
  mainGapPx: number;
  asideSections: string[];
  asideTone: 'dark' | 'light';
  asideSide: 'left' | 'right';
  headerInAside: boolean;
  hasAside: boolean;
}

const MM_TO_PX = 96 / 25.4;

export function getTemplateLayout(templateId: string): TemplateLayout {
  const spec = getTemplateSpec(templateId);
  if (spec.layout !== 'sidebar' && spec.layout !== 'split') {
    return {
      kind: spec.layout,
      sidebarWidthPx: 0,
      mainGapPx: 0,
      asideSections: [],
      asideTone: 'light',
      asideSide: 'left',
      headerInAside: true,
      hasAside: false,
    };
  }
  const widthMm = spec.sidebarWidthMm ?? (spec.layout === 'split' ? 70 : 58);
  return {
    kind: spec.layout,
    sidebarWidthPx: Math.round(widthMm * MM_TO_PX),
    mainGapPx: spec.layout === 'split' ? 22 : 26,
    asideSections: spec.asideSections ?? [],
    asideTone: spec.sidebarTone ?? 'light',
    asideSide: spec.asideSide ?? 'left',
    headerInAside: spec.headerInAside !== false,
    hasAside: true,
  };
}

export function splitBlocks(blocks: ResumeBlock[], layout: TemplateLayout): BlockSplit {
  if (!layout.hasAside) return { aside: [], main: blocks };
  const asideSections = new Set(layout.asideSections);
  const aside: ResumeBlock[] = [];
  const main: ResumeBlock[] = [];
  for (const block of blocks) {
    const inHeader = block.kind === 'header' && layout.headerInAside;
    if (inHeader || (block.kind !== 'header' && block.sectionId && asideSections.has(block.sectionId))) {
      aside.push(block);
    } else {
      main.push(block);
    }
  }
  return { aside, main };
}
