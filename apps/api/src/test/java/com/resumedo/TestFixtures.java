package com.resumedo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

public final class TestFixtures {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TestFixtures() {
    }

    public static ObjectMapper mapper() {
        return MAPPER;
    }

    public static String validDocumentJson() {
        return """
                {
                  "schemaVersion": 1,
                  "basic": {
                    "name": "张三",
                    "gender": "",
                    "city": "北京",
                    "phone": "13800000000",
                    "email": "zhangsan@example.com",
                    "experienceYears": "5年"
                  },
                  "intent": {
                    "role": "后端工程师",
                    "city": "北京",
                    "salary": "面议",
                    "arrival": "随时"
                  },
                  "sections": [
                    {
                      "id": "work",
                      "title": "工作经历",
                      "type": "records",
                      "visible": true,
                      "items": [
                        {
                          "id": "w1",
                          "title": "某科技公司",
                          "role": "高级工程师",
                          "startMonth": "2020-01",
                          "endMonth": "2024-12",
                          "ongoing": false,
                          "body": "<p>负责<em>核心</em>服务</p>"
                        }
                      ]
                    }
                  ]
                }
                """;
    }

    public static String validAppearanceJson() {
        return """
                {
                  "templateId": "clean",
                  "fontId": "sans",
                  "fontSize": 14,
                  "lineHeight": 1.5,
                  "sectionGap": 18,
                  "pageMargin": 42,
                  "themeColor": "#2563eb"
                }
                """;
    }

    public static JsonNode validDocument() {
        return read(validDocumentJson());
    }

    public static JsonNode validAppearance() {
        return read(validAppearanceJson());
    }

    public static ObjectNode documentWithSections(JsonNode... sections) {
        ObjectNode document = MAPPER.createObjectNode();
        document.put("schemaVersion", 1);
        document.set("basic", MAPPER.createObjectNode());
        document.set("intent", MAPPER.createObjectNode());
        ArrayNode array = document.putArray("sections");
        for (JsonNode section : sections) {
            array.add(section);
        }
        return document;
    }

    public static ObjectNode section(String id, String type, JsonNode... items) {
        ObjectNode section = MAPPER.createObjectNode();
        section.put("id", id);
        section.put("title", "工作经历");
        section.put("type", type);
        section.put("visible", true);
        ArrayNode array = section.putArray("items");
        for (JsonNode item : items) {
            array.add(item);
        }
        return section;
    }

    public static ObjectNode item(String id, String startMonth, String endMonth, String body) {
        ObjectNode item = MAPPER.createObjectNode();
        item.put("id", id);
        item.put("title", "某科技公司");
        item.put("role", "高级工程师");
        if (startMonth != null) {
            item.put("startMonth", startMonth);
        }
        if (endMonth != null) {
            item.put("endMonth", endMonth);
        }
        item.put("ongoing", false);
        item.put("body", body);
        return item;
    }

    public static ObjectNode appearanceWithThemeColor(String themeColor) {
        ObjectNode appearance = MAPPER.createObjectNode();
        appearance.put("themeColor", themeColor);
        return appearance;
    }

    private static JsonNode read(String json) {
        try {
            return MAPPER.readTree(json);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
