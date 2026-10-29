export const RESUME_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
.resume-export { margin: 0; padding: 0; background: #fff; color: #22303a; }

.r-page {
  position: relative;
  width: 210mm;
  height: 297mm;
  padding: var(--r-margin);
  background: #fff;
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

.font-sans {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", sans-serif;
}
.font-serif { font-family: "Songti SC", "Noto Serif CJK SC", "Times New Roman", serif; }
.font-arial { font-family: Arial, "PingFang SC", sans-serif; }
`;
