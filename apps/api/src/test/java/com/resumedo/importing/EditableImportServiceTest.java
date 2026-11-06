package com.resumedo.importing;

import static org.assertj.core.api.Assertions.assertThat;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class EditableImportServiceTest {
    final ObjectMapper json = new ObjectMapper();

    @Test void keepsThePhotoSlotWhenTheSourceHasAPhoto() {
        ObjectNode basic = json.createObjectNode();
        basic.put("showPhoto", true);
        EditableImportService.applyPhoto(basic, "data:image/jpeg;base64,AAAA");
        assertThat(basic.path("photo").asText()).isEqualTo("data:image/jpeg;base64,AAAA");
        assertThat(basic.path("showPhoto").asBoolean()).isTrue();
    }

    @Test void hidesThePhotoSlotWhenTheSourceHasNoPhoto() {
        ObjectNode basic = json.createObjectNode();
        basic.put("showPhoto", true);
        EditableImportService.applyPhoto(basic, "");
        assertThat(basic.path("photo").asText()).isEmpty();
        assertThat(basic.path("showPhoto").asBoolean()).isFalse();
    }

    @Test void hidesThePhotoSlotWhenPhotoExtractionFails() {
        ObjectNode basic = json.createObjectNode();
        basic.put("showPhoto", true);
        EditableImportService.applyPhoto(basic, null);
        assertThat(basic.path("photo").asText()).isEmpty();
        assertThat(basic.path("showPhoto").asBoolean()).isFalse();
    }

    @Test void mirrorsTheDetectedLayoutIntoTheDraft() {
        ObjectNode draft = json.createObjectNode();
        ObjectNode document = draft.putObject("document");
        document.putObject("basic");
        document.putArray("sections");
        draft.putObject("appearance");

        EditableImportService.applyLayout(draft, layout(
                "center", "#1b2733", "#2e4a7a", "#5f6b75", "#1b2733", "#e9eff1", "#9aa0a6",
                "#f3f5f9", "#2e4a7a", "#d4dae4", false, "date-last", 29, 10.5f, 9.25f, 24, 62, 10, 14f, 1.13f, 1.14f, 31,
                24, 48, 0, 12, 24, "#2e4a7a", 1f));

        var style = (ObjectNode) document.path("importStyle");
        assertThat(style.path("headerAlign").asText()).isEqualTo("center");
        assertThat(style.path("nameColor").asText()).isEqualTo("#1b2733");
        assertThat(style.path("intentColor").asText()).isEqualTo("#2e4a7a");
        assertThat(style.path("metaColor").asText()).isEqualTo("#5f6b75");
        assertThat(style.path("sectionTitleColor").asText()).isEqualTo("#1b2733");
        assertThat(style.path("headerRule").asText()).isEqualTo("#2e4a7a");
        assertThat(style.path("leftRule").asText()).isEqualTo("#d4dae4");
        assertThat(style.path("leftRuleStyle").asText()).isEqualTo("solid");
        assertThat(style.path("titleRule").asText()).isEqualTo("#9aa0a6");
        assertThat(style.path("recordHead").asText()).isEqualTo("date-last");
        assertThat(style.path("nameSize").asInt()).isEqualTo(29);
        assertThat(style.path("intentSize").floatValue()).isEqualTo(10.5f);
        assertThat(style.path("metaSize").floatValue()).isEqualTo(9.3f);
        assertThat(style.path("titleSize").floatValue()).isEqualTo(1.14f);
        assertThat(style.path("bulletMark").asInt()).isEqualTo(24);
        assertThat(style.path("bulletIndent").asInt()).isEqualTo(62);
        assertThat(style.path("bulletGap").asInt()).isEqualTo(10);
        assertThat(style.path("recordIndent").asInt()).isEqualTo(24);
        assertThat(style.path("bodyIndent").asInt()).isEqualTo(48);
        assertThat(style.path("paragraphGap").asInt()).isEqualTo(12);
        assertThat(style.path("headerIndent").asInt()).isEqualTo(24);
        assertThat(style.path("recordMark").asText()).isEqualTo("#2e4a7a");
        assertThat(style.path("pageBackground").asText()).isEqualTo("#f3f5f9");

        var appearance = (ObjectNode) draft.path("appearance");
        assertThat(appearance.path("templateId").asText()).isEqualTo("imported");
        assertThat(appearance.path("themeColor").asText()).isEqualTo("#1b2733");
        assertThat(appearance.path("sectionTitleTint").asBoolean()).isTrue();
        assertThat(appearance.path("sectionTitleTintColor").asText()).isEqualTo("#e9eff1");
        assertThat(appearance.path("fontSize").asInt()).isEqualTo(19);
        assertThat(appearance.path("lineHeight").floatValue()).isEqualTo(1.13f);
        assertThat(appearance.path("pageMargin").asInt()).isEqualTo(31);
    }

    @Test void keepsTheDefaultsWhenTheSourceHasNothingToMirror() {
        ObjectNode draft = json.createObjectNode();
        ObjectNode document = draft.putObject("document");
        document.putObject("basic");
        document.putArray("sections");
        draft.putObject("appearance").put("fontSize", 14);

        EditableImportService.applyLayout(draft, layout(
                null, null, null, null, null, null, null,
                "#ffffff", null, null, false, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, 0, 0, 0, 0, 0, null, 1f));

        assertThat(document.path("importStyle").isObject()).isTrue();
        assertThat(document.path("importStyle").has("pageBackground")).isFalse();
        assertThat(document.path("importStyle").has("nameColor")).isFalse();
        assertThat(document.path("importStyle").has("bulletIndent")).isFalse();
        assertThat(document.path("importStyle").has("recordIndent")).isFalse();
        assertThat(document.path("importStyle").has("bodyIndent")).isFalse();
        assertThat(document.path("importStyle").has("headerIndent")).isFalse();
        assertThat(document.path("importStyle").has("recordMark")).isFalse();
        assertThat(draft.path("appearance").path("fontSize").asInt()).isEqualTo(14);
        assertThat(draft.path("appearance").has("lineHeight")).isFalse();
    }

    @Test void scalesTheSkinWhenTheSourcePageIsNotA4() {
        ObjectNode draft = json.createObjectNode();
        ObjectNode document = draft.putObject("document");
        document.putObject("basic");
        document.putArray("sections");
        draft.putObject("appearance");

        EditableImportService.applyLayout(draft, layout(
                null, null, null, null, null, null, null,
                "#ffffff", null, null, false, null, 19.5f, 9.75f, 12f, 20, 19, 0, 11.25f, 1.93f, 1f, 30,
                0, 0, 0, 28, 0, null, 0.968f));

        var style = (ObjectNode) document.path("importStyle");
        assertThat(style.path("fontSizePx").floatValue()).isEqualTo(14.52f);
        assertThat(style.path("nameSize").floatValue()).isEqualTo(18.9f);
        assertThat(style.path("intentSize").floatValue()).isEqualTo(9.4f);
        assertThat(style.path("metaSize").floatValue()).isEqualTo(11.6f);
        assertThat(style.path("paragraphGap").asInt()).isEqualTo(27);
        assertThat(style.path("bulletIndent").asInt()).isEqualTo(18);
        var appearance = draft.path("appearance");
        assertThat(appearance.path("fontSize").asInt()).isEqualTo(15);
        assertThat(appearance.path("pageMargin").asInt()).isEqualTo(29);
    }

    @Test void keepsScaledNameSizesInsideTheExportLimits() {
        for (float nameSize : new float[]{12f, 48f}) {
            ObjectNode draft = bodyDraft("<p>正文</p>");
            float scale = nameSize == 12f ? 0.968f : 1.2f;

            EditableImportService.applyLayout(draft, layout(
                    null, null, null, null, null, null, null,
                    "#ffffff", null, null, false, null, nameSize, 0, 0, 0, 0, 0, 0, 0, 0, null,
                    0, 0, 0, 0, 0, null, scale));

            assertThat(draft.path("document").path("importStyle").path("nameSize").floatValue())
                    .isEqualTo(nameSize);
        }
    }

    @Test void dropsTheBlankParagraphWhenTheDetectedGapAlreadySpacesIt() {
        ObjectNode draft = bodyDraft("<p>项目背景</p><p>\u200b</p><p>技术栈：Spring Boot</p>");

        EditableImportService.applyLayout(draft, layout(
                null, null, null, null, null, null, null,
                "#ffffff", null, null, false, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, 0, 0, 0, 10, 0, null, 1f));

        assertThat(body(draft)).isEqualTo("<p>项目背景</p><p>技术栈：Spring Boot</p>");
    }

    @Test void keepsTheBlankParagraphWhenNoGapWasDetected() {
        ObjectNode draft = bodyDraft("<p>项目背景</p><p>\u200b</p><p>技术栈：Spring Boot</p>");

        EditableImportService.applyLayout(draft, layout(
                null, null, null, null, null, null, null,
                "#ffffff", null, null, false, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, 0, 0, 0, 0, 0, null, 1f));

        assertThat(body(draft)).isEqualTo("<p>项目背景</p><p>\u200b</p><p>技术栈：Spring Boot</p>");
    }

    private ObjectNode bodyDraft(String body) {
        ObjectNode draft = json.createObjectNode();
        ObjectNode document = draft.putObject("document");
        document.putObject("basic");
        var section = document.putArray("sections").addObject();
        section.put("title", "项目经历");
        section.putArray("items").addObject().put("body", body);
        draft.putObject("appearance");
        return draft;
    }

    private static String body(ObjectNode draft) {
        return draft.path("document").path("sections").get(0).path("items").get(0).path("body").asText();
    }

    private static ImportLayoutDetector.Layout layout(String align, String nameColor, String intentColor,
            String metaColor, String titleColor, String tint, String titleRule, String pageBackground, String headerRule,
            String leftRule, boolean leftDashed, String recordHead, float nameSize, float intentSize, float metaSize,
            int bulletMark, int bulletIndent, int bulletGap, float bodySize, float lineHeight,
            float titleSize,
            Integer pageMargin, int recordIndent, int bodyIndent, int bodyTextIndent, int paragraphGap,
            int headerIndent, String recordMark, float scale) {
        return new ImportLayoutDetector.Layout(align, nameColor, intentColor, metaColor, titleColor, tint, titleRule,
                pageBackground, headerRule, leftRule, leftDashed, recordHead, nameSize, intentSize, metaSize,
                bulletMark, bulletIndent, bulletGap, bodySize, lineHeight, titleSize, pageMargin, recordIndent,
                bodyIndent, bodyTextIndent, paragraphGap, headerIndent, recordMark, scale);
    }
}
