import { z } from 'zod';

export const SCHEMA_VERSION = 1;
export const MAX_SECTION_BODY = 20_000;
export const MAX_TOTAL_BODY = 100_000;

const monthPattern = /^$|^\d{4}-(0[1-9]|1[0-2])$/;
const sectionIdPattern = /^[a-z][a-z0-9-]{0,31}$/;
const colorPattern = /^#[0-9a-fA-F]{6}$/;
const photoPattern = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const richTextSchema = z.string().max(MAX_SECTION_BODY);
const monthSchema = z.string().regex(monthPattern, '年月格式应为 YYYY-MM');

export const TEMPLATE_IDS = [
  '1045',
  '1015',
  '1004',
  '1044',
  '1054',
  '1057',
  '1012',
  '1005',
  '1046',
  '1019',
  '1058',
  '1056',
  '1008',
  '1011',
  '1023',
  '1041',
  '1035',
  '1034',
  '1016',
  '1040',
  '1020',
  '1033',
  '1022',
  '1002',
  '1055',
  '1050',
  '1039',
  '1043',
  '1038',
  '1051',
  '1047',
  '1030',
  '1032',
  '1042',
  '1014',
  '1027',
  '1003',
  '1053',
  '1037',
  '1048',
  '1025',
  '1021',
  '1036',
  '1006',
  '1007',
  '1029',
  '1049',
  '1031',
  '1013',
  '1024',
  '1028',
  '1001',
  '1018',
  '1052',
  '1026',
  '1009',
  '1000',
  '1010',
  '1017',
] as const;

export const LEGACY_TEMPLATE_IDS = ['clean', 'classic', 'elegant', 'sidebar'] as const;

/** Not part of the 59 reference skins: compact layout that mirrors an imported file. */
export const IMPORTED_TEMPLATE_ID = 'imported' as const;

export const ALL_TEMPLATE_IDS = [...TEMPLATE_IDS, IMPORTED_TEMPLATE_ID, ...LEGACY_TEMPLATE_IDS] as const;

export type TemplateId = (typeof ALL_TEMPLATE_IDS)[number];

/** Age is computed only when a real birth month exists; source-reported age is a fallback. */
export function ageFromBirthMonth(month: string | undefined, now = new Date()): string {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return '';
  const [year, m] = month.split('-').map(Number);
  const age = now.getFullYear() - year - (now.getMonth() + 1 < m ? 1 : 0);
  return age >= 0 && age <= 150 ? `${age}岁` : '';
}

export const basicSchema = z.object({
  birthMonth: z.string().regex(/^$|^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  age: z.string().max(30).optional(),
  nativePlace: z.string().max(50).optional(),
  ethnicity: z.string().max(50).optional(),
  maritalStatus: z.string().max(50).optional(),
  politicalStatus: z.string().max(50).optional(),
  height: z.string().max(50).optional(),
  weight: z.string().max(50).optional(),
  showPhoto: z.boolean().optional(),
  customFields: z.array(z.object({ label: z.string().max(30), value: z.string().max(100) })).max(20).optional(),
  name: z.string().max(50).default(''),
  gender: z.string().max(10).default(''),
  city: z.string().max(50).default(''),
  phone: z.string().max(30).default(''),
  email: z.union([z.literal(''), z.string().email().max(120)]).default(''),
  experienceYears: z.string().max(30).default(''),
  photo: z
    .union([z.literal(''), z.string().max(400_000).regex(photoPattern, '照片格式不正确')])
    .default(''),
});

export const intentSchema = z.object({
  role: z.string().max(100).default(''),
  city: z.string().max(50).default(''),
  salary: z.string().max(50).default(''),
  arrival: z.string().max(50).default(''),
});

export const recordItemSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().max(100).default(''),
    role: z.string().max(100).default(''),
    startMonth: monthSchema.default(''),
    endMonth: monthSchema.default(''),
    ongoing: z.boolean().default(false),
    body: richTextSchema.default(''),
  })
  .superRefine((item, ctx) => {
    if (item.startMonth && item.endMonth && !item.ongoing && item.startMonth > item.endMonth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endMonth'],
        message: '开始年月不能晚于结束年月',
      });
    }
  });

export const sectionSchema = z
  .object({
    id: z.string().regex(sectionIdPattern, '模块 ID 只能使用小写字母、数字和连字符'),
    type: z.enum(['records', 'rich']),
    title: z.string().min(1, '模块名称不能为空').max(20, '模块名称最多 20 个字符'),
    visible: z.boolean().default(true),
    items: z.array(recordItemSchema).max(30).default([]),
  })
  .superRefine((section, ctx) => {
    if (section.type === 'rich' && section.items.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: '纯正文模块只能包含一个正文条目',
      });
    }
  });

export const resumeDocumentSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    importWarning: z.string().max(500).optional(),
    /** Set once default modules have been merged, so deleted modules stay deleted. */
    moduleDefaultsApplied: z.boolean().optional(),
    basic: basicSchema,
    intent: intentSchema,
    sections: z.array(sectionSchema).max(30),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    for (const section of doc.sections) {
      if (ids.has(section.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sections'],
          message: `模块 ID 重复：${section.id}`,
        });
      }
      ids.add(section.id);
    }
    if (totalTextLength(doc) > MAX_TOTAL_BODY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sections'],
        message: `简历正文总长度不能超过 ${MAX_TOTAL_BODY} 个字符`,
      });
    }
  });

export const appearanceSchema = z.object({
  templateId: z.enum(ALL_TEMPLATE_IDS).default('1045'),
  fontId: z.enum(['sans', 'serif', 'arial']).default('sans'),
  fontSize: z.number().int().min(12).max(16).default(14),
  lineHeight: z.number().min(1.2).max(2.2).default(1.5),
  sectionGap: z.number().int().min(5).max(50).default(18),
  pageMargin: z.number().int().min(24).max(60).default(42),
  themeColor: z.string().regex(colorPattern).default('#1f5aa6'),
});

export type ResumeBasic = z.infer<typeof basicSchema>;
export type ResumeIntent = z.infer<typeof intentSchema>;
export type ResumeRecordItem = z.infer<typeof recordItemSchema>;
export type ResumeSection = z.infer<typeof sectionSchema>;
export type ResumeDocument = z.infer<typeof resumeDocumentSchema>;
export type ResumeAppearance = z.infer<typeof appearanceSchema>;
export type SectionType = ResumeSection['type'];

export function newId(prefix = 'id'): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random.slice(0, 20)}`;
}

export function emptyRecordItem(): ResumeRecordItem {
  return {
    id: newId('item'),
    title: '',
    role: '',
    startMonth: '',
    endMonth: '',
    ongoing: false,
    body: '',
  };
}

export function emptyRichItem(): ResumeRecordItem {
  return { ...emptyRecordItem(), id: newId('body') };
}

export function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function totalTextLength(doc: ResumeDocument): number {
  const { photo: _photo, customFields = [], ...basic } = doc.basic;
  const basicLength = Object.values(basic).filter(value => typeof value === 'string').join('').length
    + customFields.reduce((total, pair) => total + pair.label.length + pair.value.length, 0);
  const intent = Object.values(doc.intent).join('').length;
  let body = 0;
  for (const section of doc.sections) {
    for (const item of section.items) {
      body += stripTags(item.body).length;
    }
  }
  return basicLength + intent + body;
}

type CanonicalSectionSpec = Pick<ResumeSection, 'id' | 'type' | 'title' | 'visible'>;

/** Editor tab order and default visibility; `application` is new in v2.3 and hidden by default. */
export const CANONICAL_SECTIONS: readonly CanonicalSectionSpec[] = [
  { id: 'application', type: 'rich', title: '报考信息', visible: false },
  { id: 'education', type: 'records', title: '教育背景', visible: true },
  { id: 'work', type: 'records', title: '工作经验', visible: true },
  { id: 'skills', type: 'rich', title: '专业技能', visible: true },
  { id: 'project', type: 'records', title: '项目经验', visible: true },
  { id: 'intern', type: 'records', title: '实习经验', visible: false },
  { id: 'campus', type: 'records', title: '校园经历', visible: false },
  { id: 'honor', type: 'rich', title: '荣誉证书', visible: false },
  { id: 'evaluation', type: 'rich', title: '自我评价', visible: true },
  { id: 'hobby', type: 'rich', title: '兴趣爱好', visible: false },
  { id: 'custom', type: 'rich', title: '自定义模块', visible: false },
];

export const CANONICAL_SECTION_IDS = CANONICAL_SECTIONS.map((section) => section.id);

function canonicalSection(spec: CanonicalSectionSpec): ResumeSection {
  return {
    ...spec,
    items: spec.type === 'records' ? [emptyRecordItem()] : [emptyRichItem()],
  };
}

/** Adds canonical modules once to older or imported resumes without touching existing order. */
export function ensureCanonicalSections(doc: ResumeDocument): ResumeDocument {
  if (doc.moduleDefaultsApplied) return doc;
  const sections = [...doc.sections];
  CANONICAL_SECTIONS.forEach((spec, canonicalIndex) => {
    if (sections.some((section) => section.id === spec.id)) return;
    const nextCanonical = CANONICAL_SECTIONS.slice(canonicalIndex + 1)
      .map((entry) => sections.findIndex((section) => section.id === entry.id))
      .find((index) => index >= 0);
    const insertAt = nextCanonical === undefined ? sections.length : nextCanonical;
    sections.splice(insertAt, 0, canonicalSection(spec));
  });
  return { ...doc, moduleDefaultsApplied: true, sections };
}

function defaultSections(): ResumeSection[] {
  return CANONICAL_SECTIONS.map(canonicalSection);
}

export function createDefaultDocument(): ResumeDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    moduleDefaultsApplied: true,
    basic: {
      name: '',
      gender: '',
      city: '',
      phone: '',
      email: '',
      experienceYears: '',
      photo: '',
      showPhoto: true,
      customFields: [],
      birthMonth: '',
      age: '',
      nativePlace: '',
      ethnicity: '',
      maritalStatus: '',
      politicalStatus: '',
      height: '',
      weight: '',

    },
    intent: { role: '', city: '', salary: '', arrival: '' },
    sections: defaultSections(),
  };
}

export function createDefaultAppearance(): ResumeAppearance {
  return {
    templateId: '1045',
    fontId: 'sans',
    fontSize: 14,
    lineHeight: 1.5,
    sectionGap: 18,
    pageMargin: 42,
    themeColor: '#1f5aa6',
  };
}

export const SAMPLE_APPEARANCE: ResumeAppearance = createDefaultAppearance();

export const SAMPLE_DOCUMENT: ResumeDocument = {
  schemaVersion: SCHEMA_VERSION,
  basic: {
    name: '林晓',
    gender: '女',
    city: '深圳',
    phone: '13800000000',
    email: 'linxiao@example.com',
    experienceYears: '5 年经验',
    photo: '',
  },
  intent: { role: 'Java 开发工程师', city: '深圳', salary: '面议', arrival: '一个月内到岗' },
  sections: [
    {
      id: 'education',
      type: 'records',
      title: '教育背景',
      visible: true,
      items: [
        {
          id: 'edu-1',
          title: '南方示例大学',
          role: '计算机科学与技术 · 本科',
          startMonth: '2016-09',
          endMonth: '2020-06',
          ongoing: false,
          body: '<p>学习计算机系统、数据库与软件工程，完成校园服务系统课程项目。</p>',
        },
      ],
    },
    {
      id: 'work',
      type: 'records',
      title: '工作经验',
      visible: true,
      items: [
        {
          id: 'work-1',
          title: '青禾信息科技有限公司',
          role: 'Java 开发工程师',
          startMonth: '2022-04',
          endMonth: '',
          ongoing: true,
          body: '<ul><li>负责订单与库存服务，完成需求分析、接口设计与上线交付。</li><li>优化慢查询和缓存访问，将核心接口响应时间从 320ms 降至 110ms。</li><li>补充监控与自动化测试，提升发布后问题发现效率。</li></ul>',
        },
        {
          id: 'work-2',
          title: '远山软件有限公司',
          role: '后端开发工程师',
          startMonth: '2020-07',
          endMonth: '2022-03',
          ongoing: false,
          body: '<p>参与客户管理与数据报表模块的开发，维护服务稳定性。</p>',
        },
      ],
    },
    {
      id: 'skills',
      type: 'rich',
      title: '专业技能',
      visible: true,
      items: [
        {
          id: 'skills-1',
          title: '',
          role: '',
          startMonth: '',
          endMonth: '',
          ongoing: false,
          body: '<ul><li>熟悉 Java、Spring Boot、MyBatis，具备微服务开发经验。</li><li>掌握 MySQL 索引优化、Redis 缓存与消息队列的使用。</li><li>熟悉 Docker、Linux 与持续集成流程。</li></ul>',
        },
      ],
    },
    {
      id: 'project',
      type: 'records',
      title: '项目经验',
      visible: true,
      items: [
        {
          id: 'project-1',
          title: '商户运营平台',
          role: '后端负责人',
          startMonth: '2023-03',
          endMonth: '2024-11',
          ongoing: false,
          body: '<p>面向线下商户提供订单、会员和活动运营能力。</p><ul><li>完成订单状态机与幂等接口设计，保障重复请求下的数据一致性。</li><li>设计异步通知与失败重试机制，提升跨服务协作可靠性。</li></ul>',
        },
      ],
    },
    {
      id: 'evaluation',
      type: 'rich',
      title: '自我评价',
      visible: true,
      items: [
        {
          id: 'evaluation-1',
          title: '',
          role: '',
          startMonth: '',
          endMonth: '',
          ongoing: false,
          body: '<p>注重交付质量，善于把复杂业务拆分为可执行任务；持续学习并分享技术经验。</p>',
        },
      ],
    },
    { id: 'intern', type: 'records', title: '实习经验', visible: false, items: [emptyRecordItem()] },
    { id: 'campus', type: 'records', title: '校园经历', visible: false, items: [emptyRecordItem()] },
    { id: 'honor', type: 'rich', title: '荣誉证书', visible: false, items: [emptyRichItem()] },
    { id: 'hobby', type: 'rich', title: '兴趣爱好', visible: false, items: [emptyRichItem()] },
    { id: 'custom', type: 'rich', title: '自定义模块', visible: false, items: [emptyRichItem()] },
  ],
};

export function parseDocument(input: unknown): ResumeDocument {
  return resumeDocumentSchema.parse(input);
}

export function safeParseDocument(input: unknown) {
  return resumeDocumentSchema.safeParse(input);
}

export function parseAppearance(input: unknown): ResumeAppearance {
  return appearanceSchema.parse(input);
}

export function safeParseAppearance(input: unknown) {
  return appearanceSchema.safeParse(input);
}
