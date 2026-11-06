package com.resumedo.importing;

import static org.assertj.core.api.Assertions.assertThat;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class ImportLayoutDetectorTest {
    private static final int WIDTH = 1190;   // 595 pt at 144 dpi
    private static final int HEIGHT = 1684;  // 842 pt at 144 dpi

    private static BufferedImage page() {
        var image = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
        var graphics = image.createGraphics();
        graphics.setColor(Color.WHITE);
        graphics.fillRect(0, 0, WIDTH, HEIGHT);
        graphics.dispose();
        return image;
    }

    private static void fill(BufferedImage image, int left, int top, int right, int bottom, Color color) {
        var graphics = image.createGraphics();
        graphics.setColor(color);
        graphics.fillRect(left, top, right - left, bottom - top);
        graphics.dispose();
    }

    @Test void recognisesCentredHeaderLines() {
        assertThat(ImportLayoutDetector.centered(List.of(
                new ImportLayoutDetector.Line("李昌浩", 274f, 339.6f),
                new ImportLayoutDetector.Line("深圳 · 面议 · 随时到岗 · 资深Java工程师/技术负责人", 186.4f, 426.7f),
                new ImportLayoutDetector.Line("男 · 7年经验 · 13695138043 · 840591418@qq.com", 182.9f, 430.4f)
        ), 595f)).isTrue();
    }

    @Test void rejectsLeftAlignedHeaderLines() {
        assertThat(ImportLayoutDetector.centered(List.of(
                new ImportLayoutDetector.Line("李昌浩", 24f, 89.6f),
                new ImportLayoutDetector.Line("深圳 · 面议 · 随时到岗 · 资深Java工程师/技术负责人", 24f, 264.3f),
                new ImportLayoutDetector.Line("男 · 7年经验 · 13695138043 · 840591418@qq.com", 24f, 271.4f)
        ), 595f)).isFalse();
    }

    @Test void rejectsEqualWidthLeftAlignedLines() {
        assertThat(ImportLayoutDetector.centered(List.of(
                new ImportLayoutDetector.Line("李昌浩", 24f, 60f),
                new ImportLayoutDetector.Line("Java 工程师", 24f, 60f)
        ), 595f)).isFalse();
    }

    @Test void treatsASingleHeaderLineAsNoEvidence() {
        assertThat(ImportLayoutDetector.centered(List.of(
                new ImportLayoutDetector.Line("李昌浩", 274f, 339.6f)
        ), 595f)).isFalse();
    }

    @Test void readsTheHeaderSizeFromItsTextNotFromADecoratingIcon() {
        // The gender icon is printed at 12 pt on a 9.75 pt line; the line's size is the text's.
        var meta = new ImportLayoutDetector.Line("年龄： 31岁性别： \u2642", 182f, 300f, null, 70f, 12f,
                List.of(new ImportLayoutDetector.Fragment(70f, 182f, 280f, "年龄： 31岁性别： ", 9.75f),
                        new ImportLayoutDetector.Fragment(70f, 280f, 300f, "\u2642", 12f)));

        assertThat(ImportLayoutDetector.dominantSize(meta)).isEqualTo(9.75f);
    }

    @Test void readsTheHeaderRuleAndDashedLeftRuleButIgnoresATintedBand() {
        var image = page();
        for (int y = 0; y < HEIGHT; y += 10) {
            fill(image, 60, y, 61, Math.min(HEIGHT, y + 6), new Color(0xd4dae4));
        }
        fill(image, 100, 200, 1100, 202, new Color(0x2e4a7a));
        fill(image, 90, 300, 1120, 340, new Color(0xe9eff1));

        var rules = ImportLayoutDetector.rules(image, Float.MAX_VALUE);

        assertThat(rules.headerRule()).isEqualTo("#2e4a7a");
        assertThat(rules.leftRule()).isEqualTo("#d4dae4");
        assertThat(rules.leftDashed()).isTrue();
    }

    @Test void readsTheRulePrintedUnderASectionTitle() {
        var image = page();
        fill(image, 84, 200, 1106, 202, new Color(0x9aa0a6));

        assertThat(ImportLayoutDetector.ruleBelow(image, 95f)).isEqualTo("#9aa0a6");
        assertThat(ImportLayoutDetector.ruleBelow(image, 50f)).isNull();

        var band = page();
        fill(band, 84, 182, 1106, 220, new Color(0xe9eff1));
        assertThat(ImportLayoutDetector.ruleBelow(band, 95f)).isNull();
    }

    @Test void readsASolidLeftRuleAsSolid() {
        var image = page();
        fill(image, 60, 0, 62, HEIGHT, new Color(0xd4dae4));

        var rules = ImportLayoutDetector.rules(image, Float.MAX_VALUE);

        assertThat(rules.leftRule()).isEqualTo("#d4dae4");
        assertThat(rules.leftDashed()).isFalse();
    }

    @Test void readsTheInkOfALineOnTopOfATintedBand() {
        var image = page();
        fill(image, 40, 165, 1000, 215, new Color(0xe9eff1));
        fill(image, 40, 180, 160, 205, new Color(0x5f6b75));
        var line = new ImportLayoutDetector.Line("男 · 7年经验", 20f, 200f, null, 100f, 14f, List.of());

        assertThat(ImportLayoutDetector.textColor(image, line)).isEqualTo("#5f6b75");
        assertThat(ImportLayoutDetector.boxTint(image, line)).isEqualTo("#e9eff1");
    }

    @Test void takesTheContentMarginFromWhereTheBodyTextStarts() {
        var lines = List.of(
                new ImportLayoutDetector.Line("工作经历", 24f, 90f, null, 100f, 14f, List.of()),
                new ImportLayoutDetector.Line("负责订单与库存服务", 24f, 300f, null, 200f, 14f, List.of()),
                new ImportLayoutDetector.Line("  ", 18f, 20f, null, 220f, 10f, List.of()));

        assertThat(ImportLayoutDetector.pageMargin(lines)).isEqualTo(32);
        assertThat(ImportLayoutDetector.pageMargin(List.of(
                new ImportLayoutDetector.Line("缩进过深的正文", 80f, 300f, null, 200f, 14f, List.of())))).isNull();
    }

    @Test void readsWhereTheSourceHangsItsListMarks() {
        var marks = List.of(
                new ImportLayoutDetector.Fragment(200f, 42f, 45f, "·", 10.5f),
                new ImportLayoutDetector.Fragment(200f, 70.5f, 300f, "负责订单与库存服务", 10.5f));
        var lines = List.of(
                new ImportLayoutDetector.Line("工作经历", 24f, 90f, null, 100f, 14f, List.of()),
                new ImportLayoutDetector.Line("·负责订单与库存服务", 42f, 300f, null, 200f, 10.5f, marks));

        var indent = ImportLayoutDetector.bulletIndents(lines, 32, 100f);

        assertThat(indent.mark()).isEqualTo(24);
        assertThat(indent.text()).isEqualTo(62);
        assertThat(ImportLayoutDetector.bulletIndents(lines, null, 100f)).isNull();
        assertThat(ImportLayoutDetector.bulletIndents(lines, 32, 300f)).isNull();

        var metaDot = List.of(new ImportLayoutDetector.Line("男 · 7年经验 · 13…", 120f, 300f, null, 80f, 10.5f,
                List.of(new ImportLayoutDetector.Fragment(80f, 120f, 135f, "男", 10.5f),
                        new ImportLayoutDetector.Fragment(80f, 150f, 153f, "·", 10.5f),
                        new ImportLayoutDetector.Fragment(80f, 158f, 300f, "7年经验", 10.5f))));
        assertThat(ImportLayoutDetector.bulletIndents(metaDot, 32, 60f)).isNull();
    }

    @Test void detectsWhetherTheDateColumnLeadsOrTrails() {
        var date = new ImportLayoutDetector.Fragment(150f, 30f, 70f, "2023.09 — 2026.11", 11f);
        var title = new ImportLayoutDetector.Fragment(150f, 100f, 200f, "青禾信息科技有限公司", 13f);
        var role = new ImportLayoutDetector.Fragment(150f, 210f, 300f, "Java 开发工程师", 12f);
        var leading = new ImportLayoutDetector.Line("2023.09 — 2026.11 青禾 Java", 30f, 300f, null, 150f, 13f,
                List.of(date, title, role));
        assertThat(ImportLayoutDetector.recordHead(List.of(leading), 100f)).isEqualTo("date-first");

        var trailingDate = new ImportLayoutDetector.Fragment(150f, 250f, 330f, "2023.09 — 2026.11", 11f);
        var trailing = new ImportLayoutDetector.Line("青禾 Java 2023.09 — 2026.11", 30f, 330f, null, 150f, 13f,
                List.of(title, role, trailingDate));
        assertThat(ImportLayoutDetector.recordHead(List.of(trailing), 100f)).isEqualTo("date-last");

        assertThat(ImportLayoutDetector.recordHead(List.of(trailing), 200f)).isNull();
    }

    @Test void readsTheSourceIndentOfRecordHeadsAndParagraphs() {
        var head = new ImportLayoutDetector.Line("深圳东郊未来科技有限公司 · Java工程师 2023.09 — 2026.11",
                42f, 571f, null, 150f, 10.5f, List.of(
                        new ImportLayoutDetector.Fragment(150f, 42f, 232f, "深圳东郊未来科技有限公司", 10.5f),
                        new ImportLayoutDetector.Fragment(150f, 480f, 571f, "2023.09 — 2026.11", 9.5f)));
        var paragraph = new ImportLayoutDetector.Line("负责集团上门按摩平台", 60f, 460f, null, 172f, 10.5f, List.of(
                new ImportLayoutDetector.Fragment(172f, 60f, 460f, "负责集团上门按摩平台", 10.5f)));
        var bullet = new ImportLayoutDetector.Line("·主导重构", 42f, 300f, null, 210f, 10.5f, List.of(
                new ImportLayoutDetector.Fragment(210f, 42f, 46f, "·", 10.5f),
                new ImportLayoutDetector.Fragment(210f, 70.5f, 300f, "主导重构", 10.5f)));
        var lines = List.of(
                new ImportLayoutDetector.Line("工作经历", 24f, 72f, null, 100f, 12f, List.of()),
                head, paragraph, bullet);

        assertThat(ImportLayoutDetector.recordIndent(lines, 100f, 32)).isEqualTo(24);
        var paragraphIndent = ImportLayoutDetector.paragraphIndent(lines, 100f, 32, 10.5f, null, Set.of("工作经历"));
        assertThat(paragraphIndent.block()).isEqualTo(48);
        assertThat(paragraphIndent.firstLine()).isZero();
    }

    @Test void readsAFirstLineIndentWithoutNarrowingTheWholeParagraph() {
        var body = List.of(
                new ImportLayoutDetector.Line("项目经验", 36f, 90f, null, 100f, 11.25f, List.of()),
                new ImportLayoutDetector.Line("东郊江湖是一款基于微信小程序的商户平台，主要面向线下商户", 42f, 553f, null, 150f, 11.25f,
                        List.of(new ImportLayoutDetector.Fragment(150f, 42f, 553f, "东郊江湖是一款基于微信小程序的商户平台，主要面向线下商户", 11.25f))),
                new ImportLayoutDetector.Line("统计等功能。平台通过组织体系对商户进行分组管理", 22.5f, 545f, null, 171.75f, 11.25f,
                        List.of(new ImportLayoutDetector.Fragment(171.75f, 22.5f, 545f, "统计等功能。平台通过组织体系对商户进行分组管理", 11.25f))));

        var paragraph = ImportLayoutDetector.paragraphIndent(body, 100f, 30, 11.25f, null, Set.of("项目经验"));

        // A same-size section title must not pass for the paragraph column.
        assertThat(paragraph.block()).isZero();
        assertThat(paragraph.firstLine()).isEqualTo(26);
    }

    @Test void leavesRecordsFlushWhenTheSourceHasNoIndent() {        var head = new ImportLayoutDetector.Line("云栖电商 · 高级后端工程师 2021.03 — 至今",
                42f, 553f, null, 150f, 10f, List.of(
                        new ImportLayoutDetector.Fragment(150f, 42f, 172f, "云栖电商 · 高级后端工程师", 10f),
                        new ImportLayoutDetector.Fragment(150f, 474f, 553f, "2021.03 — 至今", 9f)));
        var paragraph = new ImportLayoutDetector.Line("负责交易下单链路重构", 42f, 500f, null, 172f, 10f, List.of(
                new ImportLayoutDetector.Fragment(172f, 42f, 500f, "负责交易下单链路重构", 10f)));
        var lines = List.of(
                new ImportLayoutDetector.Line("工作经历", 42f, 94f, null, 100f, 13f, List.of()),
                head, paragraph);

        assertThat(ImportLayoutDetector.recordIndent(lines, 100f, 56)).isZero();
        assertThat(ImportLayoutDetector.paragraphIndent(lines, 100f, 56, 10f, null, Set.of("工作经历")).block()).isZero();
        assertThat(ImportLayoutDetector.recordIndent(lines, 100f, null)).isZero();
        assertThat(ImportLayoutDetector.paragraphIndent(lines, 100f, null, 10f, null, Set.of()).block()).isZero();
    }

    @Test void tellsCssParagraphSpacingFromABlankLineTheTextKeeps() {
        var full = new ImportLayoutDetector.Line("整行排满的正文占用整列宽度，直到右边界才换行", 22.5f, 560f, null, 128f, 11.25f,
                List.of(new ImportLayoutDetector.Fragment(128f, 22.5f, 560f, "整行排满的正文占用整列宽度，直到右边界才换行", 11.25f)));
        var first = new ImportLayoutDetector.Line("技术框架：Spring Boot、Redis", 22.5f, 480f, null, 150f, 11.25f,
                List.of(new ImportLayoutDetector.Fragment(150f, 22.5f, 480f, "技术框架：Spring Boot、Redis", 11.25f)));
        var blank = new ImportLayoutDetector.Line("工作内容：", 22.5f, 90f, null, 193f, 11.25f,
                List.of(new ImportLayoutDetector.Fragment(193f, 22.5f, 90f, "工作内容：", 11.25f)));
        var spaced = new ImportLayoutDetector.Line("下一段紧接上一段", 22.5f, 300f, null, 183f, 11.25f,
                List.of(new ImportLayoutDetector.Fragment(183f, 22.5f, 300f, "下一段紧接上一段", 11.25f)));
        var tight = new ImportLayoutDetector.Line("下一段紧接上一段", 22.5f, 300f, null, 171.75f, 11.25f,
                List.of(new ImportLayoutDetector.Fragment(171.75f, 22.5f, 300f, "下一段紧接上一段", 11.25f)));

        // 43 pt on a 21.75 pt pitch is a whole blank line, which the text import keeps by itself.
        assertThat(ImportLayoutDetector.paragraphGap(List.of(full, first, blank), 100f, 30, 11.25f, null, Set.of(), 21.75f))
                .isZero();
        // 33 pt is partial leading: the source spaces its paragraphs in CSS, not with a blank line.
        assertThat(ImportLayoutDetector.paragraphGap(List.of(full, first, spaced), 100f, 30, 11.25f, null, Set.of(), 21.75f))
                .isEqualTo(15);
        assertThat(ImportLayoutDetector.paragraphGap(List.of(full, first, tight), 100f, 30, 11.25f, null, Set.of(), 21.75f))
                .isZero();
    }

    @Test void scalesAPageThatIsNotA4OntoA4() {
        assertThat(ImportLayoutDetector.pageScale(new org.apache.pdfbox.pdmodel.common.PDRectangle(0f, 0f, 615f, 870f)))
                .isEqualTo(0.968f);
        assertThat(ImportLayoutDetector.pageScale(org.apache.pdfbox.pdmodel.common.PDRectangle.A4)).isEqualTo(1f);
        assertThat(ImportLayoutDetector.pageScale(new org.apache.pdfbox.pdmodel.common.PDRectangle(0f, 0f, 1191f, 1684f)))
                .isEqualTo(1f);
    }

    @Test void readsLooseLeadingWhenNoLineWraps() {
        var lines = List.of(
                new ImportLayoutDetector.Line("项目经验", 22.5f, 67.4f, null, 100f, 11.25f, List.of()),
                new ImportLayoutDetector.Line("东郊江湖是一款基于微信小程序生态的商户运营平台", 22.5f, 400f, null, 120f, 11.25f, List.of()),
                new ImportLayoutDetector.Line("平台通过门店与成员组织体系对商户进行分组管理", 22.5f, 410f, null, 141.75f, 11.25f, List.of()),
                new ImportLayoutDetector.Line("帮助平台运营方提升商户活跃度并实现精细化运营", 22.5f, 420f, null, 163.5f, 11.25f, List.of()));

        var stats = ImportLayoutDetector.bodyStats(lines, 100f);

        assertThat(stats.size()).isEqualTo(11.25f);
        // 21.75pt pitch on 11.25pt text: the source sets leading beyond 1.75em.
        assertThat(stats.lineHeight()).isEqualTo(1.93f);
    }

    @Test void readsTheSquarePrintedBesideEachRecord() {
        var image = page();
        fill(image, 51, 225, 64, 238, new Color(0x2e4a7a));
        fill(image, 57, 0, 58, HEIGHT, new Color(0xc9d0dd));
        var head = new ImportLayoutDetector.Line("深圳东郊未来科技有限公司 2023.09 — 2026.11",
                42f, 571f, null, 120f, 10.5f, List.of(
                        new ImportLayoutDetector.Fragment(120f, 42f, 232f, "深圳东郊未来科技有限公司", 10.5f),
                        new ImportLayoutDetector.Fragment(120f, 480f, 571f, "2023.09 — 2026.11", 9.5f)));

        assertThat(ImportLayoutDetector.recordMark(image, List.of(head), 0f, 32)).isEqualTo("#2e4a7a");

        var blank = page();
        assertThat(ImportLayoutDetector.recordMark(blank, List.of(head), 0f, 32)).isNull();
    }

    @Test void measuresWhereTheHeaderRuleStarts() {
        var image = page();
        fill(image, 84, 20, 1142, 22, new Color(0x2e4a7a));

        var rules = ImportLayoutDetector.rules(image, 100f);

        assertThat(rules.headerRule()).isEqualTo("#2e4a7a");
        assertThat(rules.headerLeft()).isEqualTo(42);
    }

    @Test void readsTheBodyFontSizeAndLeading() {
        var lines = List.of(
                new ImportLayoutDetector.Line("负责订单与库存服务", 40f, 300f, null, 200f, 14f, List.of()),
                new ImportLayoutDetector.Line("优化慢查询和缓存访问", 40f, 300f, null, 220f, 14f, List.of()),
                new ImportLayoutDetector.Line("补充监控与自动化测试", 40f, 300f, null, 240f, 14f, List.of()),
                new ImportLayoutDetector.Line("自我评价", 40f, 100f, null, 260f, 16f, List.of()));

        var stats = ImportLayoutDetector.bodyStats(lines, 100f);

        assertThat(stats.size()).isEqualTo(14f);
        assertThat(stats.lineHeight()).isEqualTo(1.43f);
        assertThat(stats.bulletGap()).isZero();
    }

    @Test void readsHowMuchBiggerSectionTitlesAreThanBodyText() {
        assertThat(ImportLayoutDetector.titleScale(12f, 10.5f)).isEqualTo(1.14f);
        assertThat(ImportLayoutDetector.titleScale(0f, 10.5f)).isZero();
        assertThat(ImportLayoutDetector.titleScale(30f, 10.5f)).isZero();
    }

    @Test void readsTheGapBetweenListEntries() {
        var lines = List.of(
                new ImportLayoutDetector.Line("第一行正文内容", 40f, 300f, null, 200f, 10.5f, List.of()),
                new ImportLayoutDetector.Line("第二行正文内容", 40f, 300f, null, 215.75f, 10.5f, List.of()),
                new ImportLayoutDetector.Line("第三行正文内容", 40f, 300f, null, 231.5f, 10.5f, List.of()),
                new ImportLayoutDetector.Line("下一条正文内容", 40f, 300f, null, 254.75f, 10.5f, List.of()),
                new ImportLayoutDetector.Line("续行正文内容", 40f, 300f, null, 270.5f, 10.5f, List.of()));

        var stats = ImportLayoutDetector.bodyStats(lines, 100f);

        assertThat(stats.lineHeight()).isEqualTo(1.5f);
        assertThat(stats.bulletGap()).isEqualTo(10);
    }
}
