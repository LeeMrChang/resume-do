import type { ResumeAppearance, ResumeDocument } from '@resume-do/schema';

export type BlockKind = 'header' | 'section' | 'record-head' | 'role' | 'paragraph' | 'bullet';

export interface ResumeBlock {
  id: string;
  kind: BlockKind;
  keepWithNext: boolean;
  html: string;
  plainText: string;
  sectionId?: string;
}

export interface RenderInput {
  document: ResumeDocument;
  appearance: ResumeAppearance;
}

export interface PageMetrics {
  pageWidthPx: number;
  pageHeightPx: number;
  contentWidthPx: number;
  contentHeightPx: number;
  marginPx: number;
  footerReservePx: number;
  asideWidthPx: number;
  asideContentWidthPx: number;
  asideContentHeightPx: number;
  mainGapPx: number;
  hasAside: boolean;
}

export interface BlockSplit {
  aside: ResumeBlock[];
  main: ResumeBlock[];
}
