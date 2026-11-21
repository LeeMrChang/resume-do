export const RESUME_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
.resume-export { margin: 0; padding: 0; background: #fff; color: #22303a; }

.r-page {
  position: relative;
  width: 210mm;
  height: 297mm;
  padding: var(--r-margin);
  background: var(--r-page-bg, #fff);
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
  overflow: hidden;
  color: var(--r-ink);
  font-size: var(--r-font-size);
  line-height: var(--r-line-height);
  break-after: page;
  page-break-after: always;
}
.r-page:last-child { break-after: auto; page-break-after: auto; }
.r-content { height: var(--r-content-height); overflow: hidden; }
.r-footer {
  position: absolute;
  left: var(--r-margin);
  right: var(--r-margin);
  bottom: 12px;
  text-align: right;
  font-size: 11px;
  line-height: 1;
  color: #9aa4ad;
  font-variant-numeric: tabular-nums;
}
.r-measure { background: #fff; }
.r-block { width: 100%; display: flow-root; }

.r-intro {
  display: flex;
  align-items: center;
  gap: 18px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--r-accent);
}
.r-intro-main { flex: 1; min-width: 0; }
.r-intro h1 {
  margin: 0 0 6px;
  font-size: 2.1em;
  line-height: 1.26;
  color: var(--r-ink);
  font-weight: 800;
}
.r-intro .r-intent { margin: 0; color: var(--r-accent); font-size: 0.98em; font-weight: 600; }
.r-intro .r-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 14px;
  margin-top: 7px;
  font-size: 0.88em;
  color: #5f6b75;
}
.r-intro .r-meta span { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.r-intro .r-meta .r-contact { display: inline-flex; align-items: baseline; gap: 5px; }
.r-intro .r-meta .r-contact em { font-style: normal; }
.r-intro .r-meta .r-contact em::after { content: '：'; }
.r-contact-icon { width: 1em; height: 1em; flex: none; align-self: baseline; position: relative; top: 0.12em; color: var(--r-accent); }
.hdr-band .r-contact-icon { color: inherit; }
.r-intro h1, .r-intent, .r-record-title, .r-role, .r-section-title { overflow-wrap: anywhere; }
.r-record-title { min-width: 0; }
.r-sidebar .r-record { flex-wrap: wrap; gap: 2px 8px; }
.r-intro-photo {
  flex: none;
  width: 76px;
  height: 92px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--r-tint);
  color: var(--r-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0, 0, 0, 0.05);
}
.r-intro-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.r-intro-photo .r-initial { font-size: 2em; font-weight: 700; line-height: 1; }

.hdr-photo-right .r-intro-photo { order: 2; }
.hdr-photo-left .r-intro-photo { order: 0; }
.hdr-centered .r-intro { flex-direction: column; text-align: center; align-items: center; }
.hdr-centered .r-intro .r-meta { justify-content: center; }
.hdr-centered .r-intro-photo { order: 0; }

.hdr-band .r-intro {
  padding: 26px 22px 24px;
  background: var(--r-accent);
  border: 0;
  color: #fff;
}
.hdr-band .r-intro h1 { color: #fff; }
.hdr-band .r-intro .r-intent { color: rgba(255, 255, 255, 0.94); }
.hdr-band .r-intro .r-meta { color: rgba(255, 255, 255, 0.84); }
.hdr-band .r-intro-photo {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.hdr-band-light .r-intro {
  padding: 24px 22px 20px;
  background: var(--r-tint);
  border-bottom: 2px solid var(--r-accent);
}
.hdr-band-light .r-intro .r-meta { color: #53616c; }

.hdr-block .r-intro {
  padding: 16px 18px;
  background: var(--r-tint);
  border: 0;
  border-left: 5px solid var(--r-accent);
  border-radius: 4px;
}

.hdr-art .r-intro {
  position: relative;
  overflow: hidden;
  padding: 22px 20px;
  border: 0;
  border-radius: 6px;
  background: linear-gradient(120deg, var(--r-tint), #fff);
}
.hdr-art .r-intro::before,
.hdr-art .r-intro::after { content: ''; position: absolute; border-radius: 50%; }
.hdr-art .r-intro::before {
  width: 170px;
  height: 170px;
  right: -48px;
  top: -68px;
  background: var(--r-accent-2);
  opacity: 0.24;
}
.hdr-art .r-intro::after {
  width: 96px;
  height: 96px;
  left: -34px;
  bottom: -56px;
  background: var(--r-accent);
  opacity: 0.16;
}

.r-section { padding-top: var(--r-gap); }
.r-section-title {
  margin: 0 0 8px;
  font-size: 1.14em;
  line-height: 1.35;
  font-weight: 700;
  color: var(--r-ink);
}
.sec-rule .r-section-title { padding-bottom: 5px; border-bottom: 1px solid #dde5ea; }
.sec-short .r-section-title { position: relative; padding-bottom: 6px; border-bottom: 1px solid #dde5ea; }
.sec-short .r-section-title::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 44px;
  height: 2px;
  background: var(--r-accent);
}
.sec-bar .r-section-title { padding: 5px 10px; border-left: 4px solid var(--r-accent); background: var(--r-tint); }
.sec-fill .r-section-title { padding: 5px 11px; border-radius: 3px; background: var(--r-tint); color: var(--r-accent); }
.sec-caps .r-section-title {
  padding: 5px 10px;
  border-radius: 1px;
  background: var(--r-accent);
  color: #fff;
  letter-spacing: 0.04em;
}
.sec-ribbon .r-section-title {
  display: inline-block;
  padding: 5px 22px 5px 12px;
  background: var(--r-accent);
  color: #fff;
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%);
  letter-spacing: 0.05em;
}
.sec-icon .r-section-title { padding-bottom: 5px; border-bottom: 1px solid #dde5ea; }
.sec-icon .r-section-title::before {
  content: '◆';
  margin-right: 8px;
  color: var(--r-accent);
  font-size: 0.78em;
  vertical-align: 0.08em;
}
.sec-pill .r-section-title {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 999px;
  background: var(--r-tint);
  color: var(--r-accent);
}
.sec-dots .r-section-title { padding-bottom: 6px; border-bottom: 2px dotted var(--r-accent-2); }
.sec-dots .r-section-title::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--r-accent);
  vertical-align: middle;
}
.sec-timeline .r-section-title { position: relative; padding-left: 22px; padding-bottom: 4px; }
.sec-timeline .r-section-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.38em;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: var(--r-accent);
}

.r-record {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  padding-bottom: var(--r-record-gap, 4px);
  font-weight: 700;
  color: var(--r-ink);
}
.r-record .r-record-date {
  font-weight: 400;
  color: #74808a;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.r-role { margin: 0; padding: 2px 0 3px; color: var(--r-accent); font-size: 0.94em; font-weight: 600; }
.r-paragraph { margin: 0; padding-bottom: 5px; white-space: pre-wrap; overflow-wrap: anywhere; }
.r-bullet { position: relative; margin: 0; padding: 0 0 5px 14px; overflow-wrap: anywhere; }
.r-bullet .r-mark { position: absolute; left: 0; color: var(--r-accent); }
.r-paragraph a,
.r-bullet a { color: inherit; text-decoration: underline; }
.r-paragraph img,
.r-bullet img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 4px 0;
  border-radius: 3px;
}
.r-block[data-section='honor'] .r-bullet,
.r-block[data-section='hobby'] .r-bullet {
  padding: 3px 8px 3px 20px;
  margin-bottom: 4px;
  border-radius: 3px;
  background: var(--r-tint);
}

.layout-timeline .r-block:not(.r-section) { position: relative; padding-left: 24px; }
.layout-timeline .r-block:not(.r-section)::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--r-accent-2);
  opacity: 0.55;
}
.layout-timeline .r-record-head::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 13px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--r-accent);
  z-index: 1;
}
.layout-timeline .r-bullet { padding-left: 38px; }
.layout-timeline .r-role { padding-left: 24px; }
.layout-timeline .r-paragraph { padding-left: 24px; }

.r-page.layout-sidebar,
.r-page.layout-split { display: flex; padding: 0; }
.r-sidebar {
  flex: 0 0 var(--r-sidebar-width);
  width: var(--r-sidebar-width);
  height: 100%;
  padding: var(--r-margin) var(--r-side-pad);
  overflow: hidden;
  background: var(--r-sidebar-bg);
  color: var(--r-sidebar-ink);
}
.r-main { flex: 1; min-width: 0; padding: var(--r-margin) var(--r-margin) 0 var(--r-main-gap); }
.r-page.layout-sidebar .r-footer,
.r-page.layout-split .r-footer {
  left: calc(var(--r-sidebar-width) + var(--r-main-gap));
  right: var(--r-margin);
}
.layout-split .r-sidebar { border-right: 1px solid rgba(0, 0, 0, 0.07); }

.r-sidebar .r-intro {
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--r-side-line);
}
.r-sidebar .r-intro-photo { width: 88px; height: 88px; border-radius: 50%; }
.r-sidebar .r-intro-main { width: 100%; }
.r-sidebar .r-intro h1 {
  color: var(--r-side-heading);
  font-size: 1.85em;
  letter-spacing: 0.03em;
  margin-bottom: 8px;
}
.r-sidebar .r-intro .r-intent { color: var(--r-side-accent); font-weight: 600; }
.r-sidebar .r-contact-icon { color: var(--r-side-accent); }
.r-sidebar .r-intro .r-meta {
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
  color: var(--r-side-muted);
  line-height: 1.75;
}
.r-sidebar .r-block.r-section { padding-top: var(--r-gap); }
.r-sidebar .r-section-title {
  padding: 0 0 5px;
  border: 0;
  border-bottom: 1px solid var(--r-side-line);
  border-radius: 0;
  background: none;
  color: var(--r-side-heading);
  font-size: 1.02em;
  letter-spacing: 0.06em;
}
.r-sidebar .r-section-title::before,
.r-sidebar .r-section-title::after { display: none; }
.r-sidebar .r-record-title { color: var(--r-side-heading); }
.r-sidebar .r-record-date { color: var(--r-side-muted); }
.r-sidebar .r-role { color: var(--r-side-accent); }
.r-sidebar .r-paragraph,
.r-sidebar .r-bullet { color: var(--r-side-heading); }
.r-sidebar .r-bullet .r-mark { color: var(--r-side-accent); }
.r-sidebar .r-block[data-section='honor'] .r-bullet,
.r-sidebar .r-block[data-section='hobby'] .r-bullet {
  background: rgba(255, 255, 255, 0.1);
}

.r-measure-aside {
  width: var(--r-aside-content-width);
  height: auto;
  padding: 0;
  overflow: visible;
}

/* 原样还原：贴靠导入原件的紧凑版式，主题色由导入检测写入 */
.hdr-classic .r-intro {
  align-items: flex-start;
  gap: 60px;
  padding: 0 0 4px;
  border: 0;
}
.hdr-classic .r-intro-photo {
  order: 0;
  width: 122px;
  height: 145px;
  border-radius: 0;
}
.hdr-classic .r-intro h1 {
  margin: 0 0 10px;
  color: var(--r-accent);
  font-size: 1.75em;
  letter-spacing: 0.16em;
  font-weight: 700;
}
.hdr-classic .r-intro .r-intent {
  margin: 0 0 12px;
  color: #333;
  font-weight: 700;
  font-size: 0.86em;
}
.hdr-classic .r-meta-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 3px 24px;
  margin-top: 0;
  color: #333;
  font-size: 0.86em;
  line-height: 1.9;
}
.hdr-classic .r-meta-grid .r-contact {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.hdr-classic .r-meta-grid em {
  font-style: normal;
}
.hdr-classic .r-meta-grid em::after {
  content: '：';
}

.sec-classic .r-section-title {
  margin: 0 0 2px;
  padding: 3px 13px;
  color: var(--r-accent);
  background: var(--r-tint);
  border-left: 4px solid var(--r-accent);
  border-radius: 0;
  font-size: 1em;
  font-weight: 700;
}
.tpl-imported .r-content > .r-block.r-section:first-child { padding-top: 0; }
.tpl-imported .r-intro-center { flex-direction: column; align-items: center; text-align: center; }
.tpl-imported .r-intro-center .r-intro-main { flex: none; width: 100%; }
.tpl-imported .r-intro-center .r-meta { justify-content: center; }
.tpl-imported .r-meta-inline { display: block; }
/* The source prints 求职意向 on its own line above the two-column detail grid. */
.tpl-imported .r-meta-grid .r-intent-row { grid-column: 1 / -1; }

.tpl-imported .r-record {
  align-items: baseline;
  padding-top: 9px;
}
.tpl-imported .r-record-inline {
  display: flex;
  align-items: baseline;
  gap: 12px;
  line-height: 1.45;
  font-weight: 700;
}
.tpl-imported .r-record-inline .r-record-date {
  margin-left: auto;
  color: #333;
  font-weight: 700;
  white-space: nowrap;
}
.tpl-imported .r-record-inline .r-record-title {
  min-width: 0;
}
.tpl-imported .r-record-inline .r-record-role {
  white-space: nowrap;
}
.tpl-imported .r-paragraph,
.tpl-imported .r-bullet {
  color: #333;
  padding-bottom: 0;
  text-align: justify;
}
/* The rich text may already carry r-paragraph on its <p>, so indent only the block wrapper. */
.tpl-imported .r-block.r-paragraph {
  padding-left: var(--r-import-body-indent, 0);
  text-indent: var(--r-import-body-text-indent, 0);
}
/* The source opens a new paragraph on a wider pitch than its own line pitch.
   Padding, not margin: the paginator measures block heights and would miss a margin. */
.tpl-imported .r-block.r-paragraph + .r-block.r-paragraph {
  padding-top: var(--r-import-paragraph-gap, 0);
}
/* The bullet list also keeps the gap the source leaves after the paragraph introducing it. */
.tpl-imported .r-block.r-paragraph + .r-block.r-bullet {
  padding-top: var(--r-import-bullet-gap, 0);
}
/* Sources leave about half a line between a heading and the first body line. */
.tpl-imported .r-block.r-section + .r-block.r-paragraph,
.tpl-imported .r-block.r-section + .r-block.r-bullet,
.tpl-imported .r-block.r-record-head + .r-block.r-paragraph,
.tpl-imported .r-block.r-record-head + .r-block.r-bullet {
  padding-top: 8px;
}
/* Entries keep the source's own indent instead of being stretched to the page margin. */
.tpl-imported .r-block.r-record-head,
.tpl-imported .r-block.r-role {
  padding-left: var(--r-import-record-indent, 0);
}
.tpl-imported .r-block.r-record-head { position: relative; }
/* Sources that print a small square beside each entry get it back in the same gutter. */
.tpl-imported .r-block.r-record-head::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 1em;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: var(--r-import-record-mark, transparent);
}
/* renderBlockHtml already carries the bullet class, so only the inner list row may add indentation. */
.tpl-imported .r-block.r-bullet {
  padding: 0;
}
.tpl-imported .r-block > .r-bullet {
  padding-left: var(--r-import-bullet-indent, 18px);
  padding-bottom: var(--r-import-bullet-gap, 0);
}
.tpl-imported .r-block > .r-bullet .r-mark {
  left: var(--r-import-bullet-mark, 6px);
  color: #333;
}

/* 原样还原：页底背景、抬头横线、左侧虚线、标题底色都取自原件 */
.r-page.tpl-imported::before {
  content: '';
  position: absolute;
  left: calc(var(--r-margin) + 6px);
  top: var(--r-margin);
  bottom: var(--r-margin);
  border-left: var(--r-import-left-rule, 0);
  pointer-events: none;
}
.tpl-imported .r-intro {
  border-bottom: var(--r-import-header-rule, 0);
  border-radius: 0;
  padding-bottom: 6px;
  margin-left: var(--r-import-header-indent, 0);
}
.tpl-imported .r-intro h1 {
  color: var(--r-import-name, var(--r-accent));
  font-size: var(--r-import-name-size, 1.75em);
  letter-spacing: 0.02em;
}
.tpl-imported .r-intro .r-intent {
  color: var(--r-import-intent, #333);
  font-size: var(--r-import-intent-size, 0.98em);
}
.tpl-imported .r-intro .r-meta { font-size: var(--r-import-meta-size, 0.88em); }
.tpl-imported .r-intro .r-meta,
.tpl-imported .r-meta { color: var(--r-import-meta, #5f6b75); }
.tpl-imported .r-contact-icon { display: none; }
.tpl-imported .r-section-title {
  position: relative;
  padding: 3px 0;
  border-left: 0;
  border-radius: 0;
  background: none;
  border-bottom: var(--r-import-title-rule, 0);
  color: var(--r-import-title, var(--r-accent));
  font-size: var(--r-import-title-size, 1.15em);
}
.tpl-imported.title-tint .r-content .r-section-title,
.tpl-imported.title-tint.r-measure .r-section-title {
  margin-left: 0;
  padding: 3px 0;
  border-radius: 0;
  background: var(--r-title-tint);
  color: var(--r-import-title, var(--r-ink));
}
.tpl-imported .r-record-date-first {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: baseline;
  gap: 12px;
}
.tpl-imported .r-record-date-first .r-record-date { margin-left: 0; justify-self: start; }
.tpl-imported .r-record-date-first .r-record-title { justify-self: center; }
.tpl-imported .r-record-date-first .r-record-role { justify-self: end; }

/* A 经典单栏 / E 衬线极简：居中且不描边的抬头 */
.hdr-centered-plain .r-intro {
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 2px 0 14px;
  border: 0;
  border-bottom: 1px solid #dfe4e8;
}
.hdr-centered-plain .r-intro-photo { display: none; }
.hdr-centered-plain .r-intro h1 {
  margin: 0 0 4px;
  font-size: 2.5em;
  font-weight: 800;
  letter-spacing: 0.06em;
}
.hdr-centered-plain .r-intro .r-intent { color: #4a5560; font-weight: 500; }
.hdr-centered-plain .r-intro .r-meta { justify-content: center; gap: 3px 18px; }

/* C 顶部Banner：整幅色块贴靠页面顶边，纵向偏移由同高内边距抵消，分页高度不变 */
.hdr-band-bleed .r-content { overflow: visible; }
.hdr-band-bleed .r-intro {
  margin: calc(var(--r-margin) * -1) calc(var(--r-margin) * -1) 0;
  padding: calc(var(--r-margin) + 28px) calc(var(--r-margin) + 6px) 24px;
  background: var(--r-accent);
  border: 0;
  border-radius: 0;
  color: #fff;
}
.hdr-band-bleed .r-intro h1 { color: #fff; font-size: 2.28em; letter-spacing: 0.04em; }
.hdr-band-bleed .r-intro .r-intent { color: rgba(255, 255, 255, 0.92); }
.hdr-band-bleed .r-intro .r-meta { color: rgba(255, 255, 255, 0.82); }
.hdr-band-bleed .r-contact-icon { color: inherit; }

/* F 活力标签：右上角圆形头像 */
.hdr-corner .r-intro {
  position: relative;
  align-items: flex-start;
  padding: 2px 92px 8px 0;
  border: 0;
}
.hdr-corner .r-intro-photo {
  position: absolute;
  right: 0;
  top: 2px;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  border: 0;
  background: var(--r-tint);
  color: var(--r-accent);
}
.hdr-corner .r-intro h1 { font-size: 2.28em; letter-spacing: 0.03em; }
.hdr-corner .r-intro .r-intent { color: #4a5560; font-weight: 500; }
.hdr-corner .r-intro .r-meta { color: #6b7a85; }

/* B / D：方形小节标记，标题下不加长线 */
.sec-square .r-section-title { padding-bottom: 4px; border-bottom: 0; }
.sec-square .r-section-title::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 1px;
  background: var(--r-accent);
  vertical-align: 0.06em;
}

/* A / C：标题取主题色，右侧接一条细线到页边 */
.sec-side .r-section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--r-accent);
}
.sec-side .r-section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #dfe4e8;
}

/* B：方形标记 + 右侧细线 */
.sec-square-rule .r-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
  border-bottom: 0;
}
.sec-square-rule .r-section-title::before {
  content: '';
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 1px;
  background: var(--r-accent);
}
.sec-square-rule .r-section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #dfe4e8;
}
.layout-sidebar .r-sidebar .sec-square-rule .r-section-title {
  display: block;
  border-bottom: 1px solid var(--r-side-line);
}
.layout-sidebar .r-sidebar .sec-square-rule .r-section-title::before,
.layout-sidebar .r-sidebar .sec-square-rule .r-section-title::after { display: none; }

/* D：右栏沿用方形标记，但标题下不加线 */
.layout-split .r-sidebar .sec-square .r-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 0;
}
.layout-split .r-sidebar .sec-square .r-section-title::before {
  content: '';
  display: inline-block;
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 1px;
  background: var(--r-accent);
}
.layout-split .r-sidebar .sec-square .r-section-title::after { display: none; }

/* A–F：经历标题与角色同一行，日期靠右 */
.r-record-combo {
  justify-content: flex-start;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 6px;
}
.r-record-combo .r-record-title { min-width: 0; }
.r-record-combo .r-record-role { color: inherit; font-weight: 500; }
.r-record-combo .r-record-date { margin-left: auto; padding-left: 12px; }
.r-sidebar .r-record-combo .r-record-role { color: var(--r-side-heading); }

/* E：居中加字距的衬线小节标题，上下各一条细线 */
.sec-center .r-section-title {
  padding: 5px 0;
  border-top: 1px solid var(--r-accent-2);
  border-bottom: 1px solid var(--r-accent-2);
  text-align: center;
  font-weight: 600;
  letter-spacing: 0.42em;
  text-indent: 0.42em;
}
.sec-center .r-block[data-section='education'] .r-record {
  justify-content: center;
  gap: 10px;
}
.sec-center .r-block[data-section='education'] .r-record .r-record-date { color: #5f6b75; }
.sec-center .r-record-combo { gap: 0 8px; }
.sec-center .r-record-combo .r-record-date { margin-left: 0; padding-left: 0; }
.sec-center .r-block[data-section='education'] .r-paragraph,
.sec-center .r-block[data-section='skills'] .r-paragraph,
.sec-center .r-block[data-section='skills'] .r-bullet { text-align: center; }
.sec-center .r-block[data-section='skills'] .r-bullet { padding-left: 0; }
.sec-center .r-block[data-section='skills'] .r-bullet .r-mark { display: none; }

/* F：实心色标签 + 每个小节一块浅色圆角面板 */
.sec-tag .r-section-title {
  display: inline-block;
  margin-bottom: 6px;
  padding: 3px 12px;
  border-radius: 5px;
  background: var(--r-accent);
  color: #fff;
  font-size: 0.98em;
  font-weight: 600;
}
.has-cards .r-card-group {
  background: var(--r-card);
  border-radius: 8px;
}
.has-cards .r-card-group > .r-block { padding-left: 14px; padding-right: 14px; }
.r-measure.has-cards .r-block:not(.r-section) { padding-left: 14px; padding-right: 14px; }

/* D：右侧栏，主栏在左 */
.r-page.layout-split.aside-right { flex-direction: row-reverse; }
.layout-split.aside-right .r-main { padding: var(--r-margin) var(--r-main-gap) 0 var(--r-margin); }
.layout-split.aside-right .r-main .r-intro { border-bottom: 1px solid #dfe4e8; }
.layout-split.aside-right .r-sidebar { border-right: 0; border-left: 1px solid rgba(0, 0, 0, 0.07); }
.layout-split.aside-right .r-footer,
.r-page.layout-split.aside-right .r-footer {
  left: var(--r-margin);
  right: calc(var(--r-sidebar-width) + var(--r-main-gap));
}

/* A–F：联系方式不带图标，用中点分隔（侧栏里的纵向联系方式不参与） */
.plain-contacts .r-contact-icon { display: none; }
.plain-contacts .r-content .r-intro .r-meta,
.plain-contacts .r-main .r-intro .r-meta { gap: 3px 10px; }
.plain-contacts .r-content .r-meta > span + span::before,
.plain-contacts .r-main .r-meta > span + span::before {
  content: '·';
  margin-right: 10px;
  color: #a7b0b8;
}

/* 170 套设计稿：横幅头像右置、浅色通栏横幅、局部色块、双圆装饰 */
.photo-order-right .r-intro-photo { order: 2; }

.hdr-band-light-bleed .r-content { overflow: visible; }
.hdr-band-light-bleed .r-intro {
  margin: calc(var(--r-margin) * -1) calc(var(--r-margin) * -1) 0;
  padding: calc(var(--r-margin) + 26px) calc(var(--r-margin) + 6px) 22px;
  background: var(--r-tint);
  border: 0;
  border-bottom: 2px solid var(--r-accent);
  border-radius: 0;
}
.hdr-band-light-bleed .r-intro h1 { color: var(--r-ink); letter-spacing: 0.03em; }
.hdr-band-light-bleed .r-intro .r-intent { color: var(--r-accent); }
.hdr-band-light-bleed .r-intro .r-meta { color: #53616c; }

.hdr-block-fill .r-intro {
  position: relative;
  width: 64%;
  padding: 22px 20px 20px;
  background: var(--r-accent);
  border: 0;
  border-radius: 6px;
  color: #fff;
}
.hdr-block-fill .r-intro h1 { color: #fff; }
.hdr-block-fill .r-intro .r-intent { color: rgba(255, 255, 255, 0.92); }
.hdr-block-fill .r-intro .r-meta { color: rgba(255, 255, 255, 0.82); }
.hdr-block-fill .r-contact-icon { color: inherit; }
.hdr-block-fill .r-intro::after {
  content: '';
  position: absolute;
  left: calc(100% + 84px);
  top: 30px;
  width: 96px;
  height: 14px;
  border-radius: 999px;
  background: var(--r-accent-2);
  opacity: 0.7;
}

.art-bold.hdr-art .r-intro::before {
  width: 210px;
  height: 210px;
  right: -54px;
  top: -78px;
  background: var(--r-accent);
  opacity: 0.95;
}
.art-bold.hdr-art .r-intro::after {
  width: 150px;
  height: 150px;
  left: auto;
  bottom: auto;
  right: 28px;
  top: 20px;
  background: var(--r-accent-2);
  opacity: 0.5;
}

/* 170 套设计稿：竖条小节标记、实心色块标题接细线、方形时间线节点 */
.sec-mark .r-section-title { display: flex; align-items: center; gap: 9px; }
.sec-mark .r-section-title::before {
  content: '';
  flex: none;
  width: 5px;
  height: 1.05em;
  border-radius: 999px;
  background: var(--r-accent);
}

.sec-blockline .r-section-title { display: flex; align-items: center; gap: 10px; }
.sec-blockline .r-title-text {
  padding: 3px 11px;
  border-radius: 3px;
  background: var(--r-accent);
  color: #fff;
}
.sec-blockline .r-section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--r-accent-2);
}

.layout-timeline.tl-square .r-record-head::before {
  left: 2px;
  top: 12px;
  width: 9px;
  height: 9px;
  border: 0;
  border-radius: 2px;
  background: var(--r-accent);
}

.title-tint .r-content .r-section-title,
.title-tint.r-measure .r-section-title {
  padding: 4px 10px;
  margin-left: -10px;
  border-bottom: 0;
  border-radius: 3px;
  background: var(--r-title-tint);
  color: var(--r-ink);
}

.font-sans {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", sans-serif;
}

/* PDF reference: monochrome, full-width gray headings and three-column personal details. */
.tpl-2170 .r-intro { padding: 0; border: 0; }
.tpl-2170 .r-technical-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 20px;
  padding-bottom: 6px;
}
.tpl-2170 .r-intro h1 { margin: 0; font-size: 2.3em; letter-spacing: 0.18em; }
.tpl-2170 .r-intro .r-intent { margin-left: auto; color: #555; font-weight: 700; text-align: right; }
.tpl-2170 .r-section-title {
  margin: 0 0 3px;
  padding: 4px 8px;
  border: 0;
  border-radius: 0;
  background: var(--r-tint);
  color: var(--r-ink);
  font-size: 1.05em;
}
.tpl-2170 .r-personal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px 16px;
  padding: 0 5px;
}
.tpl-2170 .r-personal-grid .r-contact { min-width: 0; overflow-wrap: anywhere; }
.tpl-2170 .r-personal-grid em { font-style: normal; }
.tpl-2170 .r-personal-grid em::after { content: '：'; }
.tpl-2170 .r-record { padding-top: 5px; gap: 0 6px; }
.tpl-2170 .r-record-date { color: #777; font-size: 0.94em; }
.tpl-2170 .r-paragraph { padding-bottom: 1px; }
.tpl-2170 .r-block.r-bullet { padding: 0; }
.tpl-2170 .r-block > .r-bullet { padding: 0 0 2px 16px; }
.tpl-2170 .r-bullet .r-mark { color: #777; }
.font-serif { font-family: "Songti SC", "Noto Serif CJK SC", "Times New Roman", serif; }
.font-arial { font-family: Arial, "PingFang SC", sans-serif; }
.font-noto-sans {
  font-family: "Noto Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif;
}
.font-noto-serif {
  font-family: "Noto Serif SC", "Noto Serif CJK SC", "Songti SC", "Times New Roman", serif;
}
.font-lxgw-wenkai {
  font-family: "LXGW WenKai", "LXGW WenKai GB", "KaiTi", "STKaiti", serif;
}
`;
