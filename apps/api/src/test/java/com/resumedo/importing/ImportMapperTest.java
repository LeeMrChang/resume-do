package com.resumedo.importing;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.*;
import com.resumedo.resume.ResumeValidator;
import org.junit.jupiter.api.Test;

class ImportMapperTest {
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
        "lichanghao_prod.pdf,lichanghao_prod",
        "简历终版.DOCX,简历终版",
        "resume.v2.PDF,resume.v2"
    })
    void importedTitleUsesTheFilenameWithoutItsFinalExtension(String filename,String expected) {
        var draft=new ImportMapper(new ObjectMapper()).draft("姓名：张三",filename);
        assertThat(draft.path("title").asText()).isEqualTo(expected);
    }

    private final ImportMapper mapper = new ImportMapper(new ObjectMapper());

    @Test void unmatchedHeadingsAndTheirContentGoToPendingUntilTheNextKnownSection() {
        var draft = mapper.draft("工作经历\n示例公司 2021.01-2023.01\n负责后端交付。\n"
                + "个人项目\n• 开源工具：React 与 Java。\n开源贡献\n维护开源社区\n提交补丁与文档\n"
                + "技术实践\n全栈交付：独立完成部署。\n自我评价\n认真负责。", "example.pdf");
        var doc = draft.path("document");
        assertThat(section(doc, "work").path("items").toString()).contains("负责后端交付")
                .doesNotContain("个人项目", "开源工具", "开源贡献", "维护开源社区");
        assertThat(section(doc, "technical-practice").path("items").toString()).contains("全栈交付")
                .doesNotContain("开源贡献", "个人项目");
        var pending = section(doc, "custom");
        assertThat(doc.path("sections").get(doc.path("sections").size()-1).path("id").asText()).isEqualTo("custom");
        assertThat(pending.path("visible").asBoolean()).isTrue();
        var body = new StringBuilder();
        pending.path("items").forEach(item -> body.append(item.path("body").asText()));
        assertThat(body.toString()).contains("<p>个人项目</p>", "<p>开源贡献</p>",
                "<p>维护开源社区</p>", "<p>提交补丁与文档</p>").doesNotContain("负责后端交付", "全栈交付", "认真负责");
        assertThatCode(() -> new ResumeValidator().validate(doc, draft.path("appearance"))).doesNotThrowAnyException();
    }

    @Test void pendingContentIsNotConsumedAsHeaderFieldsOrContacts() {
        var doc = mapper.draft("姓名：示例甲\n工作经历\n示例公司 2020.01-2021.01\n负责服务。\n"
                + "其他说明\n邮箱：keep@example.invalid\n电话：13800000000\n项目背景：待整理原文\n"
                + "项目经验\n业务平台 2021.01-2022.01\n正常项目描述。", "example.docx").path("document");
        assertThat(doc.path("basic").path("email").asText()).isEmpty();
        assertThat(doc.path("basic").path("phone").asText()).isEmpty();
        var pending = section(doc, "custom").path("items").toString();
        assertThat(pending).contains("其他说明", "邮箱：keep@example.invalid", "电话：13800000000", "项目背景：待整理原文");
        assertThat(section(doc, "project").path("items").toString()).contains("正常项目描述").doesNotContain("待整理原文");
    }

    @Test void bodyLabelsDatesAndShortTechnicalLinesRemainInsideKnownSections() {
        var doc = mapper.draft("项目经验\n业务平台 2020.01-2021.01\n项目背景：\n服务商户。\n"
                + "技术栈：Spring Boot、Redis\n核心贡献：\n• 完成数据迁移。\n专业技能\nJava 与 SQL\nMySQL\nRedis",
                "example.pdf").path("document");
        assertThat(section(doc, "project").path("items").toString()).contains("项目背景", "技术栈", "核心贡献", "数据迁移");
        assertThat(section(doc, "skills").path("items").toString()).contains("Java 与 SQL", "MySQL", "Redis");
        assertThat(section(doc, "custom").path("items")).isEmpty();
    }

    @Test void sourceHeadingSpacingAndShortUnknownTitlesCannotLeakIntoThePreviousSection() {
        var parsed = new ImportParser.Parsed("工作经历\n负责服务。\n我的  另一面\n保留此行\n自我评价\n认真负责。\n证书\n保留证书原文", "",
                java.util.Set.of("我的 另一面"));
        var doc = mapper.draft(parsed, "example.pdf", null).path("document");
        assertThat(section(doc, "work").path("items").toString()).doesNotContain("另一面", "证书", "保留此行");
        var pending = section(doc, "custom").path("items").toString();
        assertThat(pending).contains("我的  另一面", "<p>证书</p>", "<p>保留此行</p>", "<p>保留证书原文</p>");
        assertThat(section(doc, "evaluation").path("items").toString()).doesNotContain("证书");
    }

    /** Sections are looked up by id so the canonical order can change without rewriting assertions. */
    private static JsonNode section(JsonNode doc, String id) {
        for (JsonNode section : doc.path("sections")) {
            if (id.equals(section.path("id").asText())) return section;
        }
        throw new AssertionError("missing section: " + id);
    }

    @Test void mapsSectionsDatesAndMultipleExperiencesInOrderWithoutInventingFacts() {
        var draft = mapper.draft("姓名：张三\n邮箱：test@example.com\n求职意向\n意向职位：工程师\n工作经历\n甲公司｜研发 2020.01-2022.02\n负责服务A\n乙公司｜主管 2022.03-至今\n负责服务B\n教育背景\n某大学 2016.09-2020.06\n专业未提供\n专业技能\nJava 与 SQL\n自我评价\n认真负责", "original.docx");
        var doc = draft.path("document");
        assertThat(doc.path("basic").path("name").asText()).isEqualTo("张三");
        assertThat(doc.path("basic").path("city").asText()).isEmpty();
        assertThat(doc.path("intent").path("role").asText()).isEqualTo("工程师");
        var work = section(doc, "work").path("items");
        assertThat(work.size()).isEqualTo(2);
        assertThat(work.get(0).path("title").asText()).isEqualTo("甲公司");
        assertThat(work.get(0).path("role").asText()).isEqualTo("研发");
        assertThat(work.get(0).path("startMonth").asText()).isEqualTo("2020-01");
        assertThat(work.get(1).path("title").asText()).isEqualTo("乙公司");
        assertThat(work.get(1).path("ongoing").asBoolean()).isTrue();
        assertThat(work.get(0).path("body").asText()).contains("负责服务A");
        assertThat(section(doc, "education").path("items").get(0).path("role").asText()).isEmpty();
        assertThatCode(() -> new ResumeValidator().validate(doc, draft.path("appearance"))).doesNotThrowAnyException();
    }
    @Test void preservesUnknownLongContentAndEscapesMarkupRatherThanExecutingIt() {
        String source = "无法归属的经历\n<script>alert(1)</script>\n" + "未知内容".repeat(6000);
        var draft = mapper.draft(source, "unknown.pdf");
        var custom = section(draft.path("document"), "custom");
        assertThat(custom.path("title").asText()).isEqualTo("待整理内容");
        var text = new StringBuilder();
        custom.path("items").forEach(item -> {
            assertThat(item.path("body").asText().length()).isLessThanOrEqualTo(20_000);
            text.append(org.jsoup.Jsoup.parse(item.path("body").asText()).text().replace(" ", ""));
        });
        assertThat(text.toString()).contains("无法归属的经历", "<script>alert(1)</script>", "未知内容".repeat(6000));
        assertThatCode(() -> new ResumeValidator().validate(draft.path("document"), draft.path("appearance"))).doesNotThrowAnyException();
    }
    @Test void removedSectionsRemainInPendingAndInternStillMapsNormally() {
        var doc = mapper.draft("报考信息\n报考岗位：综合管理岗\n实习经验\n某公司 2023.07-2023.09\n实习内容\n校园经历\n学生会 2021.09-2022.06\n组织活动\n荣誉证书\n一等奖学金\n兴趣爱好\n跑步", "full.docx").path("document");
        assertThat(section(doc, "intern").path("items").get(0).path("title").asText()).isEqualTo("某公司");
        var pending = section(doc, "custom").path("items").toString();
        assertThat(pending).contains("报考信息", "综合管理岗", "校园经历", "学生会", "荣誉证书", "兴趣爱好", "跑步");
        assertThat(doc.path("sections").size()).isEqualTo(2);
    }
    @Test void invalidOrRepeatedFieldsRemainAvailableForManualReview() {
        var draft = mapper.draft("姓名：甲\n姓名：乙\n邮箱：not-an-email\n未知：保留", "test.pdf");
        assertThat(draft.path("document").path("basic").path("name").asText()).isEqualTo("甲");
        assertThat(draft.toString()).contains("乙", "not-an-email", "未知", "保留");
    }
    @Test void recognizesUnlabelledHeaderContactsButKeepsTheEntireMixedLine() {
        var draft = mapper.draft("张三\n13800000000 | test@example.com | 未识别信息\n工作经历\n公司甲 2020.01-2022.01\n原正文", "resume.pdf");
        var basic = draft.path("document").path("basic");
        assertThat(basic.path("name").asText()).isEqualTo("张三");
        assertThat(basic.path("phone").asText()).isEqualTo("13800000000");
        assertThat(basic.path("email").asText()).isEqualTo("test@example.com");
        assertThat(draft.toString()).contains("未识别信息", "原正文");
    }
    @Test void mapsIdeographicSpacedLabelsAndKeepsParsedHeaderOutOfPendingContent() {
        String source = "测 试 甲\n"
                + "求职意向：Java工程师    深圳    随时到岗\n"
                + "\uf073年\u3000\u3000龄： 31岁    \u2588性\u3000\u3000别： 男\n"
                + "\uf041籍\u3000\u3000贯： 广东揭阳    \ue001工作年限： 7年经验\n"
                + "\ufffd电\u3000\u3000话： 13800000000    \uf0e0邮\u3000\u3000箱： person01@example.invalid\n"
                + "教育背景\n2014-09 ~ 2018-06    广东海洋大学    电子信息工程（本科）\n"
                + "技能特长\n·  Java基础扎实，深入理解集合框架。\n"
                + "项目经验\n2024-03 ~ 2026-03    某平台    Java开发\n平台描述。\n"
                + "自我评价\n认真负责";
        var draft = mapper.draft(source, "2026-测试甲.pdf", "#67a886");
        var doc = draft.path("document");
        var basic = doc.path("basic");
        assertThat(basic.path("name").asText()).isEqualTo("测试甲");
        assertThat(basic.path("age").asText()).isEqualTo("31岁");
        assertThat(basic.path("gender").asText()).isEqualTo("男");
        assertThat(basic.path("nativePlace").asText()).isEqualTo("广东揭阳");
        assertThat(basic.path("experienceYears").asText()).isEqualTo("7年经验");
        assertThat(basic.path("phone").asText()).isEqualTo("13800000000");
        assertThat(basic.path("email").asText()).isEqualTo("person01@example.invalid");
        assertThat(basic.path("customFields")).isEmpty();
        assertThat(doc.path("intent").path("role").asText()).isEqualTo("Java工程师");
        var sections = doc.path("sections");
        assertThat(sections.get(0).path("id").asText()).isEqualTo("education");
        assertThat(sections.get(1).path("id").asText()).isEqualTo("skills");
        assertThat(sections.get(2).path("id").asText()).isEqualTo("project");
        assertThat(sections.get(3).path("id").asText()).isEqualTo("evaluation");
        assertThat(sections.get(4).path("id").asText()).isEqualTo("custom");
        assertThat(section(doc, "skills").path("title").asText()).isEqualTo("技能特长");
        var pending = section(doc, "custom");
        assertThat(pending.path("title").asText()).isEqualTo("待整理内容");
        assertThat(pending.path("items")).isEmpty();
        assertThat(draft.path("appearance").path("templateId").asText()).isEqualTo("imported");
        assertThat(draft.path("appearance").path("themeColor").asText()).isEqualTo("#67a886");
        assertThatCode(() -> new ResumeValidator().validate(doc, draft.path("appearance"))).doesNotThrowAnyException();
    }

    @Test void mergesPdfHardWrappedLinesButKeepsLabelsAndBulletsSeparate() {
        String source = "项目经验\n2024-03 ~ 2026-03    某平台    Java开发\n"
                + "平台是一个商户运营管理系统，主要面向线下商户提供组织管理、活动运营及数据\n"
                + "统计等功能。项目实现了业务平滑切换。\n"
                + "技术框架：Spring Boot、MyBatis\n"
                + "工作内容：\n"
                + "· 负责模块A的设计与开发，完成数据迁移\n"
                + "· 负责模块B";
        var body = section(mapper.draft(source, "wrapped.pdf").path("document"), "project")
                .path("items").get(0).path("body").asText();
        var paragraphs = org.jsoup.Jsoup.parse(body).select("p").eachText().stream()
                .filter(text -> !text.isBlank() && !text.equals("\u200b")).toList();
        assertThat(paragraphs).containsExactly(
                "平台是一个商户运营管理系统，主要面向线下商户提供组织管理、活动运营及数据统计等功能。项目实现了业务平滑切换。",
                "技术框架：Spring Boot、MyBatis",
                "工作内容：",
                "· 负责模块A的设计与开发，完成数据迁移",
                "· 负责模块B");
        assertThat(body).contains("<p>\u200b</p><p>技术框架：Spring Boot、MyBatis</p>");
    }

    @Test void keepsTheOriginalFirstLineIndentAsFullWidthSpaces() {
        String source = "项目经验\n2024-03 ~ 2026-03    某平台    Java开发\n"
                + "\u3000\u3000平台是一个商户运营管理系统，主要面向线下商户提供组织管理、\n"
                + "活动运营及数据统计等功能。\n"
                + "技术框架：Spring Boot";
        var body = section(mapper.draft(source, "indent.pdf").path("document"), "project")
                .path("items").get(0).path("body").asText();
        assertThat(body).contains(
                "<p>\u3000\u3000平台是一个商户运营管理系统，主要面向线下商户提供组织管理、活动运营及数据统计等功能。</p>",
                "<p>技术框架：Spring Boot</p>");
    }

    @Test void splitsThreeColumnRecordRowsIntoCodeTitleAndRole() {
        var work = section(mapper.draft("工作经验\n2019-01 ~ 2020-06    RBMS    铁路梁场综合管理平台    软件开发工程师", "x.pdf")
                .path("document"), "work").path("items").get(0);
        assertThat(work.path("title").asText()).isEqualTo("RBMS 铁路梁场综合管理平台");
        assertThat(work.path("role").asText()).isEqualTo("软件开发工程师");
    }

    @Test void appliesDetectedAccentToImportedAppearanceAndFallsBackWithoutOne() {
        var styled = mapper.draft("教育背景\n某大学 2016.09-2020.06", "x.pdf", "#67a886");
        var appearance = styled.path("appearance");
        assertThat(appearance.path("templateId").asText()).isEqualTo("imported");
        assertThat(appearance.path("themeColor").asText()).isEqualTo("#67a886");
        assertThat(appearance.path("fontSize").asInt()).isEqualTo(14);
        assertThat(appearance.path("lineHeight").asDouble()).isEqualTo(2.0);
        assertThat(appearance.path("sectionGap").asInt()).isEqualTo(20);
        assertThat(appearance.path("pageMargin").asInt()).isEqualTo(32);
        assertThatCode(() -> new ResumeValidator().validate(styled.path("document"), appearance)).doesNotThrowAnyException();
        assertThat(mapper.draft("教育背景\n某大学 2016.09-2020.06", "x.docx").path("appearance").path("templateId").asText())
                .isEqualTo("1045");
    }

    @Test void cleansIconFontArtifactsAndMapsSpacedTwoColumnLabelsWithoutDroppingUnknownFields() {
        var draft = mapper.draft("测 试 甲\n\uf073年 龄：31岁 \u2588性 别：男\n\uf041籍 贯：广东揭阳 \ue001工作年限：7年经验\n\ufffd电 话：13800000000 \uf0e0邮 箱：test@example.com", "icons.pdf");
        var basic = draft.path("document").path("basic");
        assertThat(basic.path("name").asText()).isEqualTo("测试甲");
        assertThat(basic.path("gender").asText()).isEqualTo("男");
        assertThat(basic.path("experienceYears").asText()).isEqualTo("7年经验");
        assertThat(basic.path("phone").asText()).isEqualTo("13800000000");
        assertThat(basic.path("email").asText()).isEqualTo("test@example.com");
        assertThat(basic.path("age").asText()).isEqualTo("31岁");
        assertThat(basic.path("nativePlace").asText()).isEqualTo("广东揭阳");
        assertThat(draft.toString()).doesNotContain("\uf073", "\u2588", "\ue001", "\ufffd", "电 话");
    }

    @Test void parsesTwoDigitNovemberAndDecemberWithoutSpillingDigitsIntoRole() {
        var work = section(mapper.draft("工作经历\n深圳东郊未来科技有限公司    Java工程师  2023.09 — 2026.11\n负责维护", "x.pdf")
                .path("document"), "work").path("items").get(0);
        assertThat(work.path("startMonth").asText()).isEqualTo("2023-09");
        assertThat(work.path("endMonth").asText()).isEqualTo("2026-11");
        assertThat(work.path("title").asText()).isEqualTo("深圳东郊未来科技有限公司");
        assertThat(work.path("role").asText()).isEqualTo("Java工程师");

        var december = section(mapper.draft("工作经历\n甲公司    Java工程师  2023.09 — 2026.12\n负责维护", "x.pdf")
                .path("document"), "work").path("items").get(0);
        assertThat(december.path("endMonth").asText()).isEqualTo("2026-12");
        assertThat(december.path("role").asText()).isEqualTo("Java工程师");
    }

    @Test void importsUnlabelledHeaderAndSendsUnsupportedSummaryToPending() {
        String source = "测试甲\n"
                + "深圳  面议  随时到岗  资深Java工程师/技术负责人\n"
                + "男    7年经验    13800000000    person01@example.invalid\n"
                + "个人概述\n"
                + "•  7 年 Java 后端开发经验，涉及商户运营、医药冷链物流及制造业管理系统。\n"
                + "专业技能\n"
                + "•  Java 与 SQL\n"
                + "工作经历\n"
                + "深圳东郊未来科技有限公司    Java工程师  2023.09 — 2026.11\n"
                + "负责维护\n"
                + "教育背景\n"
                + "2014-09 ~ 2018-06    广东海洋大学    电子信息工程（本科）\n"
                + "自我评价\n"
                + "认真负责";
        var draft = mapper.draft(source, "test-person01-resume.pdf");
        var doc = draft.path("document");
        var basic = doc.path("basic");
        assertThat(basic.path("name").asText()).isEqualTo("测试甲");
        assertThat(basic.path("gender").asText()).isEqualTo("男");
        assertThat(basic.path("experienceYears").asText()).isEqualTo("7年经验");
        assertThat(basic.path("city").asText()).isEmpty();
        assertThat(basic.path("phone").asText()).isEqualTo("13800000000");
        assertThat(basic.path("email").asText()).isEqualTo("person01@example.invalid");
        assertThat(doc.path("intent").path("city").asText()).isEqualTo("深圳");
        assertThat(doc.path("intent").path("salary").asText()).isEqualTo("面议");
        assertThat(doc.path("intent").path("arrival").asText()).isEqualTo("随时到岗");
        assertThat(doc.path("intent").path("role").asText()).isEqualTo("资深Java工程师/技术负责人");
        assertThat(doc.path("intent").path("fieldOrder").toString()).isEqualTo("[\"city\",\"salary\",\"arrival\",\"role\"]");
        assertThat(doc.path("importStyle").path("metaStyle").asText()).isEqualTo("inline");
        var ids = new java.util.ArrayList<String>();
        doc.path("sections").forEach(item -> ids.add(item.path("id").asText()));
        assertThat(ids).containsExactly("skills", "work", "education", "evaluation", "custom");
        assertThat(section(doc, "custom").path("items").toString()).contains("个人概述", "7 年 Java");
        assertThatCode(() -> new ResumeValidator().validate(doc, draft.path("appearance"))).doesNotThrowAnyException();
    }

    @Test void splitsTwoColumnHeaderRowsOnUnknownLabelsAndKeepsProfessionalSkills() {
        String source = "测 试 乙\n"
                + "出生年月： 1993-04  性　　别： 男\n"
                + "工作年限： 8年经验  电　　话： 13900000000\n"
                + "邮　　箱： person02@example.invalid  学　　历： 本科\n"
                + "现　　居： 深圳  求职意向： 资深Java工程师/技术负责人\n"
                + "专业技术\n"
                + "• 精通Java与数据结构\n"
                + "自我评价\n"
                + "结果导向\n"
                + "工作经历\n"
                + "2024-02 ~ 至今    深圳东郊在线科技有限公司    高级Java工程师\n"
                + "负责平台";
        var draft = mapper.draft(source, "测试乙的简历.pdf");
        var doc = draft.path("document");
        var basic = doc.path("basic");
        assertThat(basic.path("name").asText()).isEqualTo("测试乙");
        assertThat(basic.path("birthMonth").asText()).isEqualTo("1993-04");
        assertThat(basic.path("gender").asText()).isEqualTo("男");
        assertThat(basic.path("experienceYears").asText()).isEqualTo("8年经验");
        assertThat(basic.path("phone").asText()).isEqualTo("13900000000");
        assertThat(basic.path("email").asText()).isEqualTo("person02@example.invalid");
        assertThat(basic.path("customFields").toString()).contains("\"学历\"", "\"本科\"", "\"现居\"", "\"深圳\"");
        assertThat(doc.path("intent").path("role").asText()).isEqualTo("资深Java工程师/技术负责人");
        assertThat(section(doc, "skills").path("title").asText()).isEqualTo("专业技术");
        assertThat(section(doc, "skills").path("items").get(0).path("body").asText()).contains("精通Java");
        assertThat(section(doc, "custom").path("items")).isEmpty();
        var ids = new java.util.ArrayList<String>();
        doc.path("sections").forEach(item -> ids.add(item.path("id").asText()));
        assertThat(ids).containsExactly("skills", "evaluation", "work", "custom");
        assertThat(doc.path("importStyle").path("metaStyle").asText()).isNotEqualTo("inline");
        assertThatCode(() -> new ResumeValidator().validate(doc, draft.path("appearance"))).doesNotThrowAnyException();
    }

    @Test void keepsDottedDateSeparatorsFromTheOriginalFile() {
        var doc = mapper.draft("工作经历\n深圳东郊未来科技有限公司    Java工程师  2023.09 — 2026.11\n负责维护", "dots.pdf")
                .path("document");
        assertThat(doc.path("importStyle").path("dateStyle").asText()).isEqualTo("dot");
    }

    @Test void dropsPageNumbersInsteadOfTreatingThemAsResumeContent() {
        String source = "测试甲\n13800000000\n个人概述\n第一段\n1 / 3\n专业技能\nJava / JVM\n2 / 3\n自我评价\n认真负责\n3 / 3";
        var doc = mapper.draft(source, "x.pdf").path("document");
        assertThat(doc.toString()).doesNotContain("1 / 3", "2 / 3", "3 / 3");
        assertThat(section(doc, "custom").path("items").get(0).path("body").asText()).contains("第一段");
        assertThat(section(doc, "skills").path("items").get(0).path("body").asText()).contains("Java / JVM");
        assertThat(section(doc, "custom").path("items").toString()).contains("个人概述");
    }
}
