package com.resumedo.resume;

import static com.resumedo.TestFixtures.appearanceWithThemeColor;
import static com.resumedo.TestFixtures.documentWithSections;
import static com.resumedo.TestFixtures.item;
import static com.resumedo.TestFixtures.section;
import static com.resumedo.TestFixtures.validAppearance;
import static com.resumedo.TestFixtures.validDocument;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.resumedo.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ResumeValidatorTest {
    private final ResumeValidator validator = new ResumeValidator();

    @Test
    void acceptsValidFixture() {
        ResumeValidator.Validated validated = validator.validate(validDocument(), validAppearance());

        assertThat(validated.schemaVersion()).isEqualTo(1);
        assertThat(validated.templateId()).isEqualTo("clean");
        assertThat(validated.document().path("basic").path("name").asText()).isEqualTo("张三");
    }

    @Test
    void fillsDefaultsForMissingAppearanceFields() {
        ResumeValidator.Validated validated = validator.validate(validDocument(), appearanceWithThemeColor("#000000"));

        JsonNode appearance = validated.appearance();
        assertThat(appearance.path("templateId").asText()).isEqualTo("1045");
        assertThat(appearance.path("fontId").asText()).isEqualTo("sans");
        assertThat(appearance.path("fontSize").asInt()).isEqualTo(14);
        assertThat(appearance.path("lineHeight").asDouble()).isEqualTo(1.5);
        assertThat(appearance.path("sectionGap").asInt()).isEqualTo(18);
        assertThat(appearance.path("recordGap").asInt()).isEqualTo(4);
        assertThat(appearance.path("pageMargin").asInt()).isEqualTo(42);
        assertThat(appearance.path("sectionTitleTint").asBoolean()).isFalse();
        assertThat(appearance.path("sectionTitleTintColor").asText()).isEqualTo("#e8eff5");
    }

    @Test
    void rejectsInvalidSectionTitleTintColor() {
        ObjectNode appearance = appearanceWithThemeColor("#2563eb");
        appearance.put("sectionTitleTintColor", "green");
        assertBadRequest(() -> validator.validate(validDocument(), appearance), "小节标题底色必须是 #RRGGBB 格式");
    }

    @Test
    void rejectsNullDocument() {
        assertBadRequest(() -> validator.validate(null, validAppearance()), "简历内容必须是 JSON 对象");
    }

    @Test
    void rejectsNonObjectAppearance() {
        assertBadRequest(() -> validator.validate(validDocument(), null), "版式配置必须是 JSON 对象");
    }

    @Test
    void rejectsMalformedEmail() {
        ObjectNode document = (ObjectNode) documentWithSections();
        ObjectNode basic = (ObjectNode) document.get("basic");
        basic.put("email", "not-an-email");

        assertBadRequest(() -> validator.validate(document, validAppearance()), "邮箱格式不正确");
    }

    @Test
    void acceptsEmptyEmail() {
        ObjectNode document = (ObjectNode) documentWithSections();
        ObjectNode basic = (ObjectNode) document.get("basic");
        basic.put("email", "");

        assertThat(validator.validate(document, validAppearance()).templateId()).isEqualTo("clean");
    }

    @Test
    void rejectsNonTextualField() {
        ObjectNode document = (ObjectNode) documentWithSections();
        ObjectNode basic = (ObjectNode) document.get("basic");
        basic.put("name", 123);

        assertBadRequest(() -> validator.validate(document, validAppearance()), "姓名必须是文本");
    }

    @Test
    void rejectsFieldLongerThanLimit() {
        ObjectNode document = (ObjectNode) documentWithSections();
        ObjectNode basic = (ObjectNode) document.get("basic");
        basic.put("name", "长".repeat(51));

        assertBadRequest(() -> validator.validate(document, validAppearance()), "姓名最多 50 个字符");
    }

    @Test
    void rejectsDuplicateSectionIds() {
        JsonNode document = documentWithSections(
                section("work", "records"),
                section("work", "records"));

        assertBadRequest(() -> validator.validate(document, validAppearance()), "模块 ID 重复");
    }

    @Test
    void rejectsInvalidSectionIdPattern() {
        JsonNode document = documentWithSections(section("Work", "records"));

        assertBadRequest(() -> validator.validate(document, validAppearance()), "模块 ID 只能使用小写字母");
    }

    @Test
    void rejectsUnknownSectionType() {
        JsonNode document = documentWithSections(section("work", "timeline"));

        assertBadRequest(() -> validator.validate(document, validAppearance()), "模块类型不正确");
    }

    @Test
    void acceptsElegantAndSidebarTemplates() {
        for (String templateId : new String[] {"elegant", "sidebar"}) {
            ObjectNode appearance = (ObjectNode) validAppearance();
            appearance.put("templateId", templateId);

            assertThat(validator.validate(validDocument(), appearance).templateId())
                    .isEqualTo(templateId);
        }
    }

    @Test
    void acceptsAll59ReferenceTemplates() {
        for (int id = 1000; id <= 1058; id++) {
            ObjectNode appearance = (ObjectNode) validAppearance();
            appearance.put("templateId", String.valueOf(id));
            assertThat(validator.validate(validDocument(), appearance).templateId()).isEqualTo(String.valueOf(id));
        }
    }

    @Test
    void embeddedPhotoDoesNotConsumeTextBudget() {
        ObjectNode document = (ObjectNode) validDocument();
        ((ObjectNode) document.get("basic")).put("photo", "data:image/png;base64," + "A".repeat(200_000));
        assertThat(validator.validate(document, validAppearance()).document().path("basic").path("photo").asText()).hasSize(200_022);
    }

    @Test
    void rejectsRemoteAndOversizedPhotos() {
        ObjectNode document = (ObjectNode) validDocument();
        ObjectNode basic = (ObjectNode) document.get("basic");
        basic.put("photo", "https://example.com/photo.png");
        assertBadRequest(() -> validator.validate(document, validAppearance()), "内嵌图片");
        basic.put("photo", "data:image/png;base64," + "A".repeat(400_000));
        assertBadRequest(() -> validator.validate(document, validAppearance()), "最多 400000");
    }

    @Test
    void rejectsUnknownTemplateId() {
        ObjectNode appearance = (ObjectNode) validAppearance();
        appearance.put("templateId", "fancy");

        assertBadRequest(() -> validator.validate(validDocument(), appearance), "模板取值不正确");
    }

    @Test
    void rejectsFontSizeOutOfRange() {
        ObjectNode appearance = (ObjectNode) validAppearance();
        appearance.put("fontSize", 20);

        assertBadRequest(() -> validator.validate(validDocument(), appearance), "字号应在 12 到 16 之间");
    }

    @Test
    void rejectsMalformedThemeColor() {
        assertBadRequest(() -> validator.validate(validDocument(), appearanceWithThemeColor("red")), "#RRGGBB");
    }

    @Test
    void rejectsTooManySections() {
        JsonNode[] sections = new JsonNode[31];
        for (int i = 0; i < sections.length; i++) {
            sections[i] = section("s" + i, "records");
        }

        assertBadRequest(
                () -> validator.validate(documentWithSections(sections), validAppearance()),
                "模块数量不能超过 30 个");
    }

    @Test
    void rejectsTooManyItemsInSection() {
        JsonNode[] items = new JsonNode[31];
        for (int i = 0; i < items.length; i++) {
            items[i] = item("i" + i, null, null, "");
        }

        assertBadRequest(
                () -> validator.validate(documentWithSections(section("work", "records", items)), validAppearance()),
                "经历不能超过 30 条");
    }

    @Test
    void rejectsRichSectionWithMultipleItems() {
        JsonNode document = documentWithSections(section("summary", "rich",
                item("a", null, null, "第一段"),
                item("b", null, null, "第二段")));

        assertBadRequest(() -> validator.validate(document, validAppearance()), "纯正文模块只能包含一个正文条目");
    }

    @Test
    void rejectsEndMonthBeforeStartMonth() {
        JsonNode document = documentWithSections(
                section("work", "records", item("w1", "2023-05", "2020-01", "body")));

        assertBadRequest(() -> validator.validate(document, validAppearance()), "开始年月不能晚于结束年月");
    }

    @Test
    void rejectsMalformedMonth() {
        JsonNode document = documentWithSections(
                section("work", "records", item("w1", "2020-13", null, "body")));

        assertBadRequest(() -> validator.validate(document, validAppearance()), "开始年月格式应为 YYYY-MM");
    }

    @Test
    void allowsOngoingItemWithoutEndMonth() {
        ObjectNode ongoing = item("w1", "2020-01", null, "至今在职");
        ongoing.put("ongoing", true);

        ResumeValidator.Validated validated = validator.validate(
                documentWithSections(section("work", "records", ongoing)),
                validAppearance());

        assertThat(validated.document().path("sections").get(0).path("items").get(0).path("ongoing").asBoolean())
                .isTrue();
    }

    @Test
    void sanitizesHtmlInBody() {
        String dirty = "<script>alert(1)</script><p onclick=\"x()\">ok</p><a href=\"javascript:alert(2)\">link</a>";
        JsonNode document = documentWithSections(section("summary", "rich", item("s1", null, null, dirty)));

        ResumeValidator.Validated validated = validator.validate(document, validAppearance());
        String clean = validated.document()
                .path("sections").get(0)
                .path("items").get(0)
                .path("body").asText();

        assertThat(clean).contains("<p>ok</p>");
        assertThat(clean).contains("link");
        assertThat(clean).doesNotContain("script");
        assertThat(clean).doesNotContain("javascript");
        assertThat(clean).doesNotContain("onclick");
    }

    @Test
    void doesNotMutateCallerDocument() {
        String dirty = "<script>alert(1)</script><p>ok</p>";
        ObjectNode document = documentWithSections(section("summary", "rich", item("s1", null, null, dirty)));

        validator.validate(document, validAppearance());

        String original = document.path("sections").get(0).path("items").get(0).path("body").asText();
        assertThat(original).isEqualTo(dirty);
    }

    @Test
    void rejectsContentExceedingTotalLength() {
        JsonNode[] items = new JsonNode[30];
        for (int i = 0; i < items.length; i++) {
            items[i] = item("i" + i, null, null, "x".repeat(20_000));
        }

        assertBadRequest(
                () -> validator.validate(documentWithSections(section("work", "records", items)), validAppearance()),
                "总长度不能超过 100000");
    }

    private static void assertBadRequest(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, String messagePart) {
        assertThatThrownBy(call)
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> {
                    ApiException error = (ApiException) throwable;
                    assertThat(error.status()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(error.getMessage()).contains(messagePart);
                });
    }
}
