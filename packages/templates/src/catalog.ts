import type { FontId, TemplateId } from '@resume-do/schema';
import { CATALOG_170 } from './catalog170';

export type TemplateLayoutKind = 'single' | 'timeline' | 'sidebar' | 'split';

export type TemplateHeaderStyle =
  | 'technical'
  | 'plain'
  | 'centered'
  | 'centered-plain'
  | 'photo-right'
  | 'photo-left'
  | 'band'
  | 'band-bleed'
  | 'band-light'
  | 'band-light-bleed'
  | 'block'
  | 'block-fill'
  | 'art'
  | 'classic'
  | 'corner'
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
  | 'timeline'
  | 'square'
  | 'square-rule'
  | 'side'
  | 'center'
  | 'tag'
  | 'mark'
  | 'blockline'
  | 'classic';

export type TemplateGroup =
  | '原样还原'
  | '极简黑白'
  | '蓝色商务'
  | '深色横幅'
  | '彩色横幅'
  | '侧栏双栏'
  | '时间线'
  | '图标标题'
  | '经典单栏'
  | '左侧栏'
  | '顶部Banner'
  | '双栏分割'
  | '衬线极简'
  | '活力标签'
  | '极客单栏'
  | '技术侧栏'
  | '迭代时间线'
  | '终端头条'
  | '精英单栏'
  | '职场侧栏'
  | '履历时间线'
  | '沉稳头条'
  | '活力单栏'
  | '运营侧栏'
  | '战绩时间线'
  | '促销头条';

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
  /** Time, organisation and role share one row instead of stacking the role. */
  recordInline?: boolean;
  /** Title and role share one line with a middot, date right (A/B/C/D/E/F skins). */
  inlineRole?: boolean;
  /** Contact rows print as plain text separated by middots, no icons. */
  plainContacts?: boolean;
  /** The imported reference page has no page numbers, so no footer space is reserved. */
  showFooter?: boolean;
  /** Reference files print `2024-03 ~ 2026-03`; catalogue skins keep the dotted style. */
  isoDates?: boolean;
  /** Split layouts place the aside column on the right (D 双栏分割). */
  asideSide?: 'left' | 'right';
  /** Split layouts keep the name block in the main column instead of the aside. */
  headerInAside?: boolean;
  /** Force a typeface regardless of the user appearance, e.g. the serif-only skins. */
  font?: FontId;
  /** Wrap each section body in a tinted rounded panel (F 活力标签). */
  cards?: boolean;
  cardBg?: string;
  /** Tinted sheet colour; unset leaves the page white. */
  pageBg?: string;
  /** Band headers print the portrait on the right in the 170 design set. */
  photoRight?: boolean;
  /** 170 art headers need the two corner discs at full strength. */
  artBold?: boolean;
  /** 170 timeline skins use square rail nodes instead of rings. */
  squareNodes?: boolean;
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
    inlineRole: extra.inlineRole ?? INLINE_ROLE_GROUPS.has(group),
    plainContacts: extra.plainContacts ?? INLINE_ROLE_GROUPS.has(group),
    ...extra,
  };
}

const SIDEBAR_ASIDE = ['skills', 'honor', 'hobby'];
const SPLIT_ASIDE = ['education', 'skills', 'honor', 'hobby'];

/** The six A–F families all print `title · role` on one line. */
const INLINE_ROLE_GROUPS = new Set<TemplateGroup>([
  '经典单栏',
  '左侧栏',
  '顶部Banner',
  '双栏分割',
  '衬线极简',
  '活力标签',
]);

export const TEMPLATE_CATALOG: TemplateSpec[] = [
  make('2170', '灰阶技术', '极简黑白', 'single', 'technical', 'fill', '#222222', '#666666', '#e8e8e8', '#222222', {
    photo: false,
    inlineRole: true,
    showFooter: false,
  }),
  make('imported', '原样还原', '原样还原', 'single', 'classic', 'classic', '#67a886', '#a8d3b9', '#eef6f1', '#22303a', {
    recordInline: true,
    showFooter: false,
    isoDates: true,
  }),
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

  // 30 套设计稿模板（A1–F5，6 版式 × 5 配色），来源 Ardot「模板版 30 套」
  make('a1', '经典单栏·藏蓝', '经典单栏', 'single', 'centered-plain', 'side', '#2b3a60', '#8f9bb3', '#f4f5f8', '#1a2733', { photo: false }),
  make('a2', '经典单栏·墨绿', '经典单栏', 'single', 'centered-plain', 'side', '#1a5a42', '#86ab9c', '#f2f6f4', '#1a2733', { photo: false }),
  make('a3', '经典单栏·酒红', '经典单栏', 'single', 'centered-plain', 'side', '#8a2a3a', '#c6929c', '#f8f1f2', '#1a2733', { photo: false }),
  make('a4', '经典单栏·石墨', '经典单栏', 'single', 'centered-plain', 'side', '#2a2a32', '#9a9aa3', '#f3f3f5', '#1a2733', { photo: false }),
  make('a5', '经典单栏·靛紫', '经典单栏', 'single', 'centered-plain', 'side', '#4a3a8a', '#a79bcb', '#f4f2fa', '#1a2733', { photo: false }),

  make('b1', '左侧栏·深青', '左侧栏', 'sidebar', 'side', 'square-rule', '#183838', '#78d098', '#eef4f2', '#1a2733', {
    sidebarTone: 'dark', sidebarBg: '#183838', sidebarInk: '#f2f7f6', sidebarWidthMm: 60, asideSections: SIDEBAR_ASIDE,
  }),
  make('b2', '左侧栏·藏蓝', '左侧栏', 'sidebar', 'side', 'square-rule', '#203048', '#78d098', '#eef1f6', '#1a2733', {
    sidebarTone: 'dark', sidebarBg: '#203048', sidebarInk: '#f2f6f9', sidebarWidthMm: 60, asideSections: SIDEBAR_ASIDE,
  }),
  make('b3', '左侧栏·暖棕', '左侧栏', 'sidebar', 'side', 'square-rule', '#483028', '#78d098', '#f5f0ec', '#1a2733', {
    sidebarTone: 'dark', sidebarBg: '#483028', sidebarInk: '#f8f2ee', sidebarWidthMm: 60, asideSections: SIDEBAR_ASIDE,
  }),
  make('b4', '左侧栏·墨绿', '左侧栏', 'sidebar', 'side', 'square-rule', '#184030', '#78d098', '#edf4f0', '#1a2733', {
    sidebarTone: 'dark', sidebarBg: '#184030', sidebarInk: '#f1f8f4', sidebarWidthMm: 60, asideSections: SIDEBAR_ASIDE,
  }),
  make('b5', '左侧栏·炭黑', '左侧栏', 'sidebar', 'side', 'square-rule', '#202028', '#78d098', '#f1f1f3', '#1a2733', {
    sidebarTone: 'dark', sidebarBg: '#202028', sidebarInk: '#f4f4f6', sidebarWidthMm: 60, asideSections: SIDEBAR_ASIDE,
  }),

  make('c1', '顶部Banner·深青', '顶部Banner', 'single', 'band-bleed', 'side', '#115249', '#9fc4bd', '#eef5f3', '#1a2733', { photo: false }),
  make('c2', '顶部Banner·藏蓝', '顶部Banner', 'single', 'band-bleed', 'side', '#223349', '#9aa7bb', '#eef1f5', '#1a2733', { photo: false }),
  make('c3', '顶部Banner·酒红', '顶部Banner', 'single', 'band-bleed', 'side', '#7a2a3a', '#c79aa2', '#f7eff0', '#1a2733', { photo: false }),
  make('c4', '顶部Banner·琥珀', '顶部Banner', 'single', 'band-bleed', 'side', '#8a5a2a', '#d3b18e', '#f8f1e9', '#1a2733', { photo: false }),
  make('c5', '顶部Banner·靛紫', '顶部Banner', 'single', 'band-bleed', 'side', '#423a7a', '#a79ec9', '#f1eff7', '#1a2733', { photo: false }),

  make('d1', '双栏分割·海蓝', '双栏分割', 'split', 'side', 'square', '#2a5a8a', '#9db6d0', '#f5f7fa', '#1a2733', {
    photo: false, asideSide: 'right', headerInAside: false, sidebarWidthMm: 92, sidebarBg: '#ffffff', asideSections: SPLIT_ASIDE,
  }),
  make('d2', '双栏分割·琥珀', '双栏分割', 'split', 'side', 'square', '#b07a2a', '#dcc194', '#faf6ee', '#1a2733', {
    photo: false, asideSide: 'right', headerInAside: false, sidebarWidthMm: 92, sidebarBg: '#ffffff', asideSections: SPLIT_ASIDE,
  }),
  make('d3', '双栏分割·玫红', '双栏分割', 'split', 'side', 'square', '#a23a52', '#d3a1ad', '#faf1f3', '#1a2733', {
    photo: false, asideSide: 'right', headerInAside: false, sidebarWidthMm: 92, sidebarBg: '#ffffff', asideSections: SPLIT_ASIDE,
  }),
  make('d4', '双栏分割·橄榄', '双栏分割', 'split', 'side', 'square', '#6a7232', '#c0c39a', '#f6f7ef', '#1a2733', {
    photo: false, asideSide: 'right', headerInAside: false, sidebarWidthMm: 92, sidebarBg: '#ffffff', asideSections: SPLIT_ASIDE,
  }),
  make('d5', '双栏分割·青碧', '双栏分割', 'split', 'side', 'square', '#2a7a8a', '#9cc7cf', '#f0f7f8', '#1a2733', {
    photo: false, asideSide: 'right', headerInAside: false, sidebarWidthMm: 92, sidebarBg: '#ffffff', asideSections: SPLIT_ASIDE,
  }),

  make('e1', '衬线极简·墨黑', '衬线极简', 'single', 'centered-plain', 'center', '#1a2a33', '#c9c9d1', '#f8f8f9', '#1a2733', { photo: false, font: 'serif' }),
  make('e2', '衬线极简·深棕', '衬线极简', 'single', 'centered-plain', 'center', '#5a3a2a', '#c9c9d1', '#f8f8f9', '#2b2018', { photo: false, font: 'serif' }),
  make('e3', '衬线极简·黛蓝', '衬线极简', 'single', 'centered-plain', 'center', '#32526a', '#c9c9d1', '#f8f8f9', '#1b2832', { photo: false, font: 'serif' }),
  make('e4', '衬线极简·橄榄', '衬线极简', 'single', 'centered-plain', 'center', '#4a5a22', '#c9c9d1', '#f8f8f9', '#242a19', { photo: false, font: 'serif' }),
  make('e5', '衬线极简·梅紫', '衬线极简', 'single', 'centered-plain', 'center', '#6a2a5a', '#c9c9d1', '#f8f8f9', '#2a1a26', { photo: false, font: 'serif' }),

  make('f1', '活力标签·珊瑚', '活力标签', 'single', 'corner', 'tag', '#e86858', '#f3b0a7', '#f9ece9', '#1a2733', { cards: true, cardBg: '#f1f7f7' }),
  make('f2', '活力标签·芒果', '活力标签', 'single', 'corner', 'tag', '#e8a038', '#f4c99a', '#fbf1e3', '#1a2733', { cards: true, cardBg: '#f1f7f7' }),
  make('f3', '活力标签·薄荷', '活力标签', 'single', 'corner', 'tag', '#38a088', '#9bcfc2', '#e8f5f1', '#1a2733', { cards: true, cardBg: '#f1f7f7' }),
  make('f4', '活力标签·天蓝', '活力标签', 'single', 'corner', 'tag', '#4890d8', '#a3c8ee', '#ecf3fb', '#1a2733', { cards: true, cardBg: '#f1f7f7' }),
  make('f5', '活力标签·葡萄', '活力标签', 'single', 'corner', 'tag', '#8858b0', '#c2a7d8', '#f3edf9', '#1a2733', { cards: true, cardBg: '#f1f7f7' }),

  // 170 套设计稿模板（2000–2169，12 版式家族），来源 Ardot「新模板 · IT技术 / 白领通用 / 电商运营」
  ...CATALOG_170,
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
  '原样还原',
  '经典单栏',
  '左侧栏',
  '顶部Banner',
  '双栏分割',
  '衬线极简',
  '活力标签',
  '极简黑白',
  '蓝色商务',
  '深色横幅',
  '彩色横幅',
  '侧栏双栏',
  '时间线',
  '图标标题',
  '极客单栏',
  '技术侧栏',
  '迭代时间线',
  '终端头条',
  '精英单栏',
  '职场侧栏',
  '履历时间线',
  '沉稳头条',
  '活力单栏',
  '运营侧栏',
  '战绩时间线',
  '促销头条',
];
