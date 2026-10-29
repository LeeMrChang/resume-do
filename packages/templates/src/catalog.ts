import type { TemplateId } from '@resume-do/schema';

export type TemplateLayoutKind = 'single' | 'timeline' | 'sidebar' | 'split';

export type TemplateHeaderStyle =
  | 'plain'
  | 'centered'
  | 'photo-right'
  | 'photo-left'
  | 'band'
  | 'band-light'
  | 'block'
  | 'art'
  | 'side';

export type TemplateSectionStyle =
  | 'rule'
  | 'short'
  | 'bar'
  | 'fill'
  | 'caps'
  | 'ribbon'
  | 'icon'
  | 'pill'
  | 'dots'
  | 'timeline';

export type TemplateGroup =
  | '极简黑白'
  | '蓝色商务'
  | '深色横幅'
  | '彩色横幅'
  | '侧栏双栏'
  | '时间线'
  | '图标标题';

export interface TemplateSpec {
  id: TemplateId;
  referenceId: string;
  name: string;
  group: TemplateGroup;
  layout: TemplateLayoutKind;
  header: TemplateHeaderStyle;
  section: TemplateSectionStyle;
  accent: string;
  accent2: string;
  tint: string;
  ink: string;
  photo?: boolean;
  sidebarTone?: 'dark' | 'light';
  sidebarBg?: string;
  sidebarInk?: string;
  sidebarWidthMm?: number;
  asideSections?: string[];
}

function make(
  id: TemplateId,
  name: string,
  group: TemplateGroup,
  layout: TemplateLayoutKind,
  header: TemplateHeaderStyle,
  section: TemplateSectionStyle,
  accent: string,
  accent2: string,
  tint: string,
  ink: string,
  extra: Partial<TemplateSpec> = {},
): TemplateSpec {
  return {
    id,
    referenceId: id,
    name,
    group,
    layout,
    header,
    section,
    accent,
    accent2,
    tint,
    ink,
    ...extra,
  };
}

const SIDEBAR_ASIDE = ['skills', 'honor', 'hobby'];
const SPLIT_ASIDE = ['education', 'skills', 'honor', 'hobby'];

export const TEMPLATE_CATALOG: TemplateSpec[] = [
  make('1045', '极简蓝线', '极简黑白', 'single', 'photo-right', 'rule', '#1f5aa6', '#7f9dc4', '#f2f5f9', '#1f2a37'),
  make('1015', '深海侧栏', '侧栏双栏', 'sidebar', 'side', 'rule', '#3aa39a', '#7fcac3', '#e8f5f3', '#22303a', {
    sidebarTone: 'dark',
    sidebarBg: '#263c4e',
    sidebarInk: '#eef4f7',
    asideSections: SIDEBAR_ASIDE,
  }),
  make('1004', '蓝调履历', '蓝色商务', 'single', 'photo-left', 'bar', '#2f6fb0', '#8fb6dc', '#eaf2fa', '#20303f'),
  make('1044', '藏青头条', '深色横幅', 'single', 'band', 'caps', '#24405c', '#c9a227', '#e8edf3', '#1c2a38'),
  make('1054', '清凉蓝页', '蓝色商务', 'single', 'photo-right', 'short', '#2f6fb0', '#9cc0e2', '#eef5fb', '#22303a'),
  make('1057', '麦穗便签', '蓝色商务', 'single', 'band-light', 'icon', '#2f6fb0', '#e0a63c', '#f6f1e6', '#2a2f36'),
  make('1012', '晴空蓝', '蓝色商务', 'single', 'band-light', 'icon', '#2f6fb0', '#8fb6dc', '#e9f1f9', '#20303f'),
  make('1005', '海蓝信笺', '蓝色商务', 'single', 'band', 'bar', '#2f6fb0', '#9cc0e2', '#eaf2fa', '#1d2b3a'),
  make('1046', '蓝海圆影', '蓝色商务', 'single', 'band', 'rule', '#2f6fb0', '#9cc0e2', '#edf4fb', '#1f2a37'),
  make('1019', '深蓝格调', '深色横幅', 'single', 'band', 'caps', '#23384f', '#c9a227', '#e9edf2', '#1b2733'),
  make('1058', '青野', '彩色横幅', 'single', 'band', 'bar', '#3f8f7a', '#9fd0c2', '#e9f4ef', '#1f302b'),
  make('1056', '生长笔记', '图标标题', 'single', 'plain', 'icon', '#2f8f5b', '#9ed3b5', '#eef6f1', '#21362b', { photo: false }),
  make('1008', '新绿名片', '彩色横幅', 'single', 'block', 'fill', '#3f9a5f', '#a9d6b8', '#eaf5ed', '#1f3125'),
  make('1011', '森语', '图标标题', 'single', 'photo-left', 'icon', '#4f8f4f', '#a9cfa9', '#eef5ee', '#22322a'),
  make('1023', '墨金', '深色横幅', 'single', 'band', 'caps', '#2b3a4a', '#c9a227', '#edf0f3', '#1b2631'),
  make('1041', '蓝标', '蓝色商务', 'single', 'photo-left', 'bar', '#2f6fb0', '#9cc0e2', '#eaf2fa', '#20303f'),
  make('1035', '素蓝', '极简黑白', 'single', 'photo-right', 'rule', '#2d5f8f', '#93b4cd', '#f2f5f8', '#22303a'),
  make('1034', '彩签', '彩色横幅', 'single', 'photo-right', 'dots', '#2f8f8f', '#b08fb8', '#edf5f5', '#22303a'),
  make('1016', '蓝点', '极简黑白', 'single', 'photo-right', 'rule', '#2f6fb0', '#9cc0e2', '#f2f5f9', '#22303a'),
  make('1040', '蓝格', '蓝色商务', 'single', 'plain', 'bar', '#2f6fb0', '#9cc0e2', '#eaf2fa', '#20303f', { photo: false }),
  make('1020', '绛红', '彩色横幅', 'single', 'photo-left', 'bar', '#b03c4e', '#dda3ad', '#fbeeef', '#3a2226'),
  make('1033', '暖橙', '图标标题', 'single', 'photo-right', 'icon', '#d98a3d', '#eec49b', '#fdf3e9', '#3a2a1c'),
  make('1022', '青绿标签', '彩色横幅', 'single', 'photo-right', 'pill', '#3f8f6a', '#a3d0bb', '#eaf5ef', '#1f3129'),
  make('1002', '赤焰', '彩色横幅', 'single', 'band', 'caps', '#d94b4b', '#f0b3a8', '#fbeeee', '#3a1f1f'),
  make('1055', '深蓝线', '深色横幅', 'single', 'band', 'rule', '#2c3e57', '#8fa3ba', '#eaedf1', '#1c2836'),
  make('1050', '蓝帆', '蓝色商务', 'single', 'band-light', 'bar', '#2f6fb0', '#9cc0e2', '#eaf2fa', '#1d2b3a'),
  make('1039', '砖红', '彩色横幅', 'single', 'photo-left', 'bar', '#a33b3b', '#d6a3a0', '#f9eeed', '#382323'),
  make('1043', '蓝片', '蓝色商务', 'single', 'photo-right', 'fill', '#2f6fb0', '#9cc0e2', '#e8f1fa', '#20303f'),
  make('1038', '蓝白格', '蓝色商务', 'single', 'photo-left', 'fill', '#2f6fb0', '#9cc0e2', '#eaf2fa', '#20303f'),
  make('1051', '蓝标尺', '蓝色商务', 'single', 'photo-left', 'icon', '#2f6fb0', '#9cc0e2', '#eaf2fa', '#20303f'),
  make('1047', '绿野', '极简黑白', 'single', 'photo-right', 'rule', '#3f8f7a', '#a3d0c2', '#f0f6f3', '#20312b'),
  make('1030', '青崖侧栏', '侧栏双栏', 'sidebar', 'side', 'rule', '#3f8f7a', '#a3d0c2', '#e8f4ef', '#20312b', {
    sidebarTone: 'dark',
    sidebarBg: '#3f8f7a',
    sidebarInk: '#f2fbf7',
    asideSections: SIDEBAR_ASIDE,
  }),
  make('1032', '棕红头条', '彩色横幅', 'single', 'photo-right', 'caps', '#8f2f2f', '#c9a227', '#f6ecea', '#382222'),
  make('1042', '夜航侧栏', '侧栏双栏', 'sidebar', 'side', 'rule', '#2f6fb0', '#9cc0e2', '#e9f1f9', '#20303f', {
    sidebarTone: 'dark',
    sidebarBg: '#24354a',
    sidebarInk: '#eef3f8',
    asideSections: SIDEBAR_ASIDE,
  }),
  make('1014', '蓝阶', '蓝色商务', 'single', 'photo-right', 'bar', '#2f6fb0', '#9cc0e2', '#eaf2fa', '#20303f'),
  make('1027', '深蓝块', '深色横幅', 'single', 'photo-right', 'caps', '#2f4f7f', '#9fb8d6', '#ebeff6', '#1c2a3a'),
  make('1003', '蓝胶囊', '蓝色商务', 'single', 'photo-right', 'pill', '#2f6fb0', '#9cc0e2', '#eaf2fa', '#20303f'),
  make('1053', '蓝点线', '极简黑白', 'single', 'plain', 'dots', '#2f6fb0', '#9cc0e2', '#f3f6f9', '#22303a', { photo: false }),
  make('1037', '蓝图标', '图标标题', 'single', 'photo-right', 'icon', '#2f6fb0', '#9cc0e2', '#eef4fa', '#20303f'),
  make('1048', '青线', '极简黑白', 'single', 'photo-right', 'rule', '#3f8f7a', '#a3d0c2', '#f1f6f4', '#20312b'),
  make('1025', '绿轴', '时间线', 'timeline', 'photo-left', 'timeline', '#3f8f6a', '#a3d0bb', '#eef6f1', '#20312b'),
  make('1021', '时间蓝轴', '时间线', 'timeline', 'plain', 'timeline', '#2f6fb0', '#9cc0e2', '#eef4fa', '#20303f', { photo: false }),
  make('1036', '墨点', '极简黑白', 'single', 'photo-right', 'dots', '#2f4f4f', '#93b0b0', '#f1f5f5', '#20302f'),
  make('1006', '蓝轨', '时间线', 'timeline', 'photo-right', 'timeline', '#2f6fb0', '#9cc0e2', '#eef4fa', '#20303f'),
  make('1007', '夜蓝头条', '深色横幅', 'single', 'band', 'caps', '#2c3e57', '#8fa3ba', '#e9edf1', '#1c2836'),
  make('1029', '缤纷', '彩色横幅', 'single', 'art', 'pill', '#b04a6a', '#3f8f9f', '#f9edf0', '#3a2330'),
  make('1049', '蓝徽', '蓝色商务', 'single', 'photo-left', 'icon', '#3867a6', '#9cc0e2', '#eef4fa', '#20303f'),
  make('1031', '赤徽', '彩色横幅', 'single', 'photo-right', 'icon', '#a33b3b', '#d6a3a0', '#f8eeec', '#382323'),
  make('1013', '墨蓝块', '深色横幅', 'single', 'photo-right', 'caps', '#2b3a4a', '#9fb0bf', '#edf0f3', '#1b2631'),
  make('1024', '蓝规', '极简黑白', 'single', 'photo-right', 'short', '#2f6fb0', '#9cc0e2', '#f2f5f9', '#22303a'),
  make('1028', '浅侧栏', '侧栏双栏', 'sidebar', 'side', 'pill', '#2f6fb0', '#9cc0e2', '#eef4fa', '#20303f', {
    sidebarTone: 'light',
    asideSections: SIDEBAR_ASIDE,
  }),
  make('1001', '红规', '极简黑白', 'single', 'photo-right', 'rule', '#a33b3b', '#d6a3a0', '#f8f1f0', '#2f2626'),
  make('1018', '双栏笔记', '侧栏双栏', 'split', 'side', 'bar', '#2f6fb0', '#9cc0e2', '#e9f0f7', '#20303f', {
    sidebarTone: 'light',
    sidebarWidthMm: 70,
    asideSections: SPLIT_ASIDE,
  }),
  make('1052', '蓝点', '极简黑白', 'single', 'photo-right', 'dots', '#2f6fb0', '#9cc0e2', '#f2f5f9', '#22303a'),
  make('1026', '蓝框', '极简黑白', 'single', 'photo-right', 'bar', '#2f6fb0', '#9cc0e2', '#f2f5f9', '#22303a'),
  make('1009', '浅灰侧栏', '侧栏双栏', 'sidebar', 'side', 'bar', '#2f6fb0', '#9cc0e2', '#eef2f6', '#20303f', {
    sidebarTone: 'light',
    asideSections: SIDEBAR_ASIDE,
  }),
  make('1000', '孔雀蓝', '彩色横幅', 'single', 'band', 'icon', '#2f8f9f', '#a3d3dc', '#e9f5f7', '#1d3036'),
  make('1010', '蓝色时间线', '时间线', 'timeline', 'centered', 'timeline', '#2f6fb0', '#9cc0e2', '#eef4fa', '#20303f'),
  make('1017', '深蓝缎带', '深色横幅', 'single', 'band-light', 'ribbon', '#2f4f7f', '#c9a227', '#e9eef6', '#1d2a3a'),
];

const BY_ID = new Map<string, TemplateSpec>(TEMPLATE_CATALOG.map((spec) => [spec.id, spec]));

export const LEGACY_TEMPLATE_MAP: Record<string, string> = {
  clean: '1045',
  classic: '1033',
  elegant: '1017',
  sidebar: '1030',
};

export function normalizeTemplateId(templateId: string): string {
  return LEGACY_TEMPLATE_MAP[templateId] ?? templateId;
}

export function getTemplateSpec(templateId: string): TemplateSpec {
  const spec = BY_ID.get(normalizeTemplateId(templateId));
  if (!spec) throw new Error(`未知模板：${templateId}`);
  return spec;
}

export const TEMPLATE_GROUPS: TemplateGroup[] = [
  '极简黑白',
  '蓝色商务',
  '深色横幅',
  '彩色横幅',
  '侧栏双栏',
  '时间线',
  '图标标题',
];
