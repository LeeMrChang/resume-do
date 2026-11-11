package com.resumedo.resume;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.resumedo.common.ApiException;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Component;

@Component
public class ResumeValidator {
    private static final Pattern SECTION_ID = Pattern.compile("^[a-z][a-z0-9-]{0,31}$");
    private static final Pattern MONTH = Pattern.compile("^$|^\\d{4}-(0[1-9]|1[0-2])$");
    private static final Pattern COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final Set<String> TEMPLATE_IDS = Set.of(
            "1045", "1015", "1004", "1044", "1054", "1057", "1012", "1005",
            "1046", "1019", "1058", "1056", "1008", "1011", "1023", "1041",
            "1035", "1034", "1016", "1040", "1020", "1033", "1022", "1002",
            "1055", "1050", "1039", "1043", "1038", "1051", "1047", "1030",
            "1032", "1042", "1014", "1027", "1003", "1053", "1037", "1048",
            "1025", "1021", "1036", "1006", "1007", "1029", "1049", "1031",
            "1013", "1024", "1028", "1001", "1018", "1052", "1026", "1009",
            "1000", "1010", "1017", "clean", "classic", "elegant", "sidebar", "imported",
            "a1", "a2", "a3", "a4", "a5",
            "b1", "b2", "b3", "b4", "b5",
            "c1", "c2", "c3", "c4", "c5",
            "d1", "d2", "d3", "d4", "d5",
            "e1", "e2", "e3", "e4", "e5",
            "f1", "f2", "f3", "f4", "f5",
            "2000", "2001", "2002", "2003", "2004", "2005", "2006", "2007", "2008", "2009",
            "2010", "2011", "2012", "2013", "2014", "2015", "2016", "2017", "2018", "2019",
            "2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028", "2029",
            "2030", "2031", "2032", "2033", "2034", "2035", "2036", "2037", "2038", "2039",
            "2040", "2041", "2042", "2043", "2044", "2045", "2046", "2047", "2048", "2049",
            "2050", "2051", "2052", "2053", "2054", "2055", "2056", "2057", "2058", "2059",
            "2060", "2061", "2062", "2063", "2064", "2065", "2066", "2067", "2068", "2069",
            "2070", "2071", "2072", "2073", "2074", "2075", "2076", "2077", "2078", "2079",
            "2080", "2081", "2082", "2083", "2084", "2085", "2086", "2087", "2088", "2089",
            "2090", "2091", "2092", "2093", "2094", "2095", "2096", "2097", "2098", "2099",
            "2100", "2101", "2102", "2103", "2104", "2105", "2106", "2107", "2108", "2109",
            "2110", "2111", "2112", "2113", "2114", "2115", "2116", "2117", "2118", "2119",
            "2120", "2121", "2122", "2123", "2124", "2125", "2126", "2127", "2128", "2129",
            "2130", "2131", "2132", "2133", "2134", "2135", "2136", "2137", "2138", "2139",
            "2140", "2141", "2142", "2143", "2144", "2145", "2146", "2147", "2148", "2149",
            "2150", "2151", "2152", "2153", "2154", "2155", "2156", "2157", "2158", "2159",
            "2160", "2161", "2162", "2163", "2164", "2165", "2166", "2167", "2168", "2169");
    private static final Pattern PHOTO = Pattern.compile("^data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$");
    private static final Pattern FONT_SIZE = Pattern.compile("^(?:12|13|14|15|16|18|20|22|24)px$");
    private static final Pattern TEXT_ALIGN = Pattern.compile("^(?:left|center|right|justify)$");
    private static final Pattern FONT_WEIGHT = Pattern.compile("^(?:bold|normal|[1-9]00)$");
    private static final Pattern FONT_STYLE = Pattern.compile("^(?:italic|normal)$");
    private static final Pattern TEXT_DECORATION = Pattern.compile("^(?:underline|none)$");
    private static final Pattern DIMENSION = Pattern.compile("^\\d{1,4}$");
    private static final java.util.Map<String, Pattern> SPAN_STYLES = java.util.Map.of(
            "font-size", FONT_SIZE,
            "color", COLOR,
            "font-weight", FONT_WEIGHT,
            "font-style", FONT_STYLE,
            "text-decoration", TEXT_DECORATION);
    private static final java.util.Map<String, Pattern> BLOCK_STYLES = java.util.Map.of(
            "text-align", TEXT_ALIGN);
    private static final Set<String> BASIC_FIELD_KEYS = Set.of(
            "gender", "city", "experienceYears", "phone", "email", "birthMonth", "age",
            "nativePlace", "ethnicity", "maritalStatus", "politicalStatus", "height", "weight");
    private static final Set<String> INTENT_FIELD_KEYS = Set.of("role", "city", "salary", "arrival");
    private static final Safelist SAFELIST = Safelist.none()
            .addTags("p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "span", "img")
            .addAttributes("a", "href", "rel")
            .addProtocols("a", "href", "http", "https", "mailto")
            .addAttributes("span", "style")
            .addAttributes("p", "style")
            .addAttributes("li", "style")
            .addAttributes("img", "src", "alt", "width", "height")
            .addProtocols("img", "src", "data");

    public static boolean supportsTemplate(String id) {
        return id != null && TEMPLATE_IDS.contains(id);
    }

    public record Validated(JsonNode document, JsonNode appearance, int schemaVersion, String templateId) {
    }

    public Validated validate(JsonNode rawDocument, JsonNode rawAppearance) {
        if (rawDocument == null || !rawDocument.isObject()) {
            throw ApiException.badRequest("简历内容必须是 JSON 对象");
        }
        if (rawAppearance == null || !rawAppearance.isObject()) {
            throw ApiException.badRequest("版式配置必须是 JSON 对象");
        }

        ObjectNode document = (ObjectNode) rawDocument.deepCopy();
        ObjectNode appearance = (ObjectNode) rawAppearance.deepCopy();

        int schemaVersion = requireInt(document, "schemaVersion", 1, 1, "文档版本");
        ObjectNode basic = requireObject(document, "basic", "基本信息");
        if(document.has("importWarning")) text(document,"importWarning",500,"解析提示");
        int total = 0;
        total += text(basic, "name", 50, "姓名").length();
        total += text(basic, "gender", 10, "性别").length();
        total += text(basic, "city", 50, "城市").length();
        total += text(basic, "phone", 30, "电话").length();
        String email = text(basic, "email", 120, "邮箱");
        if (!email.isEmpty() && !EMAIL.matcher(email).matches()) {
            throw ApiException.badRequest("邮箱格式不正确");
        }
        total += email.length() + text(basic, "experienceYears", 30, "工作年限").length();

        month(basic, "birthMonth", "出生年月");
        total += text(basic, "age", 30, "原文年龄").length();
        for(String key : java.util.List.of("nativePlace","ethnicity","maritalStatus","politicalStatus","height","weight"))
            total += text(basic,key,50,"基本信息").length();
        bool(basic,"showPhoto",true,"展示照片");
        if(!basic.has("customFields")) basic.putArray("customFields");
        if(!basic.path("customFields").isArray() || basic.path("customFields").size()>20) throw ApiException.badRequest("自定义信息最多 20 项");
        for(var pair:basic.path("customFields")) {
            if(!pair.isObject()) throw ApiException.badRequest("自定义信息格式不正确");
            total += text((ObjectNode)pair,"label",30,"信息名称").length()+text((ObjectNode)pair,"value",100,"信息内容").length();
        }
        String photo = text(basic, "photo", 400_000, "照片");
        if (!photo.isEmpty() && !PHOTO.matcher(photo).matches()) {
            throw ApiException.badRequest("照片必须是 PNG、JPEG 或 WebP 的内嵌图片");
        }
        fieldOrder(basic, BASIC_FIELD_KEYS, "基本信息排序");

        ObjectNode intent = requireObject(document, "intent", "求职意向");
        total += text(intent, "role", 100, "意向职位").length();
        total += text(intent, "city", 50, "意向城市").length();
        total += text(intent, "salary", 50, "期望薪资").length();
        total += text(intent, "arrival", 50, "到岗时间").length();
        fieldOrder(intent, INTENT_FIELD_KEYS, "求职意向排序");

        JsonNode sectionsNode = document.get("sections");
        if (sectionsNode == null || !sectionsNode.isArray()) {
            throw ApiException.badRequest("模块列表格式不正确");
        }
        ArrayNode sections = (ArrayNode) sectionsNode;
        if (sections.size() > 30) {
            throw ApiException.badRequest("模块数量不能超过 30 个");
        }

        Set<String> sectionIds = new HashSet<>();
        for (JsonNode sectionNode : sections) {
            if (!sectionNode.isObject()) {
                throw ApiException.badRequest("模块内容格式不正确");
            }
            ObjectNode section = (ObjectNode) sectionNode;
            String id = requiredText(section, "id", 32, "模块 ID");
            if (!SECTION_ID.matcher(id).matches()) {
                throw ApiException.badRequest("模块 ID 只能使用小写字母、数字和连字符");
            }
            if (!sectionIds.add(id)) {
                throw ApiException.badRequest("模块 ID 重复：" + id);
            }
            String title = requiredText(section, "title", 20, "模块名称");
            if (title.isEmpty()) {
                throw ApiException.badRequest("模块名称不能为空");
            }
            String type = requiredText(section, "type", 16, "模块类型");
            if (!type.equals("records") && !type.equals("rich")) {
                throw ApiException.badRequest("模块类型不正确：" + type);
            }
            boolean visible = bool(section, "visible", true, "模块显隐");

            JsonNode itemsNode = section.get("items");
            if (itemsNode == null || !itemsNode.isArray()) {
                throw ApiException.badRequest("模块条目格式不正确");
            }
            ArrayNode items = (ArrayNode) itemsNode;
            if (items.size() > 30) {
                throw ApiException.badRequest("单个模块的经历不能超过 30 条");
            }
            if (type.equals("rich") && items.size() > 1) {
                throw ApiException.badRequest("纯正文模块只能包含一个正文条目");
            }

            for (JsonNode itemNode : items) {
                if (!itemNode.isObject()) {
                    throw ApiException.badRequest("经历条目格式不正确");
                }
                ObjectNode item = (ObjectNode) itemNode;
                requiredText(item, "id", 64, "经历 ID");
                total += text(item, "title", 100, "机构或项目名称").length();
                total += text(item, "role", 100, "职位或角色").length();
                String start = month(item, "startMonth", "开始年月");
                String end = month(item, "endMonth", "结束年月");
                boolean ongoing = bool(item, "ongoing", false, "至今");
                if (!ongoing && !start.isEmpty() && !end.isEmpty() && start.compareTo(end) > 0) {
                    throw ApiException.badRequest("开始年月不能晚于结束年月");
                }
                String body = text(item, "body", 4_000_000, "正文");
                String clean = sanitizeBody(body);
                item.put("body", clean);
                total += Jsoup.parse(clean).text().length();
            }
        }
        if (total > 100_000) {
            throw ApiException.badRequest("简历正文总长度不能超过 100000 个字符");
        }

        String templateId = enumText(
                appearance, "templateId", "1045", "模板", TEMPLATE_IDS);
        enumText(appearance, "fontId", "sans", "字体",
                Set.of("sans", "serif", "arial", "noto-sans", "noto-serif", "lxgw-wenkai"));
        intInRange(appearance, "fontSize", 12, 20, 14, "字号");
        numberInRange(appearance, "lineHeight", 1.05, 2.2, 1.5, "行高");
        intInRange(appearance, "sectionGap", 5, 50, 18, "模块间距");
        intInRange(appearance, "recordGap", 0, 16, 4, "条目间距");
        intInRange(appearance, "pageMargin", 24, 60, 42, "页面边距");
        String color = text(appearance, "themeColor", 7, "主题色");
        if (!COLOR.matcher(color).matches()) {
            throw ApiException.badRequest("主题色必须是 #RRGGBB 格式");
        }
        bool(appearance, "sectionTitleTint", false, "小节标题底色");
        JsonNode tintNode = appearance.get("sectionTitleTintColor");
        if (tintNode == null || tintNode.isNull()) {
            appearance.put("sectionTitleTintColor", "#e8eff5");
        }
        String tintColor = text(appearance, "sectionTitleTintColor", 7, "小节标题底色");
        if (!COLOR.matcher(tintColor).matches()) {
            throw ApiException.badRequest("小节标题底色必须是 #RRGGBB 格式");
        }

        return new Validated(document, appearance, schemaVersion, templateId);
    }

    public static String sanitizeBody(String body) {
        // contentEditable emits div on Enter. Keep paragraph boundaries without
        // introducing pretty-print whitespace into persisted HTML.
        var fragment = Jsoup.parseBodyFragment(body);
        fragment.select("div").tagName("p");
        fragment.outputSettings().prettyPrint(false);
        for (org.jsoup.nodes.Element span : fragment.body().select("span")) {
            cleanStyle(span, SPAN_STYLES);
        }
        for (org.jsoup.nodes.Element block : fragment.body().select("p, li")) {
            cleanStyle(block, BLOCK_STYLES);
        }
        // Validate inline images before cleaning; Jsoup keeps data: sources once
        // the protocol is whitelisted for img.
        for (org.jsoup.nodes.Element img : fragment.body().select("img")) {
            if (!PHOTO.matcher(img.attr("src")).matches()) {
                img.remove();
                continue;
            }
            if (!DIMENSION.matcher(img.attr("width")).matches()) {
                img.removeAttr("width");
            }
            if (!DIMENSION.matcher(img.attr("height")).matches()) {
                img.removeAttr("height");
            }
            String alt = img.attr("alt");
            if (alt.length() > 100) {
                img.attr("alt", alt.substring(0, 100));
            }
        }
        return Jsoup.clean(fragment.body().html(), "", SAFELIST,
                new org.jsoup.nodes.Document.OutputSettings().prettyPrint(false));
    }

    private static void cleanStyle(org.jsoup.nodes.Element element, java.util.Map<String, Pattern> allowed) {
        String style = element.attr("style");
        if (style.isEmpty()) {
            return;
        }
        StringBuilder kept = new StringBuilder();
        for (String declaration : style.split(";")) {
            int colon = declaration.indexOf(':');
            if (colon < 0) {
                continue;
            }
            String property = declaration.substring(0, colon).trim().toLowerCase(java.util.Locale.ROOT);
            String value = declaration.substring(colon + 1).trim();
            Pattern pattern = allowed.get(property);
            if (pattern == null || !pattern.matcher(value).matches()) {
                continue;
            }
            if (kept.length() > 0) {
                kept.append(';');
            }
            kept.append(property).append(':').append(value);
        }
        if (kept.length() == 0) {
            element.removeAttr("style");
        } else {
            element.attr("style", kept.toString());
        }
    }

    private static ObjectNode requireObject(ObjectNode parent, String field, String label) {
        JsonNode node = parent.get(field);
        if (node == null || !node.isObject()) {
            throw ApiException.badRequest(label + "格式不正确");
        }
        return (ObjectNode) node;
    }

    private static String requiredText(ObjectNode node, String field, int max, String label) {
        String value = text(node, field, max, label);
        if (value.isEmpty()) {
            throw ApiException.badRequest(label + "不能为空");
        }
        return value;
    }

    private static String text(ObjectNode node, String field, int max, String label) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            node.put(field, "");
            return "";
        }
        if (!value.isTextual()) {
            throw ApiException.badRequest(label + "必须是文本");
        }
        String text = value.asText();
        if (text.length() > max) {
            throw ApiException.badRequest(label + "最多 " + max + " 个字符");
        }
        return text;
    }

    private static String month(ObjectNode node, String field, String label) {
        String value = text(node, field, 7, label);
        if (!MONTH.matcher(value).matches()) {
            throw ApiException.badRequest(label + "格式应为 YYYY-MM");
        }
        return value;
    }

    /** Optional display order; unknown or non-text entries are rejected instead of silently reordered. */
    private static void fieldOrder(ObjectNode node, Set<String> allowed, String label) {
        JsonNode value = node.get("fieldOrder");
        if (value == null || value.isNull()) {
            return;
        }
        if (!value.isArray() || value.size() > allowed.size()) {
            throw ApiException.badRequest(label + "格式不正确");
        }
        Set<String> seen = new HashSet<>();
        for (JsonNode entry : value) {
            if (!entry.isTextual() || !allowed.contains(entry.asText()) || !seen.add(entry.asText())) {
                throw ApiException.badRequest(label + "格式不正确");
            }
        }
    }

    private static boolean bool(ObjectNode node, String field, boolean fallback, String label) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            node.put(field, fallback);
            return fallback;
        }
        if (!value.isBoolean()) {
            throw ApiException.badRequest(label + "必须是布尔值");
        }
        return value.asBoolean();
    }

    private static int requireInt(ObjectNode node, String field, int fallback, int expected, String label) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            node.put(field, fallback);
            return fallback;
        }
        if (!value.isInt()) {
            throw ApiException.badRequest(label + "必须是整数");
        }
        if (value.asInt() != expected) {
            throw ApiException.badRequest(label + "不受支持");
        }
        return value.asInt();
    }

    private static int intInRange(ObjectNode node, String field, int min, int max, int fallback, String label) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            node.put(field, fallback);
            return fallback;
        }
        if (!value.isNumber()) {
            throw ApiException.badRequest(label + "必须是数字");
        }
        int number = value.asInt();
        if (number < min || number > max) {
            throw ApiException.badRequest(label + "应在 " + min + " 到 " + max + " 之间");
        }
        node.put(field, number);
        return number;
    }

    private static double numberInRange(
            ObjectNode node, String field, double min, double max, double fallback, String label) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            node.put(field, fallback);
            return fallback;
        }
        if (!value.isNumber()) {
            throw ApiException.badRequest(label + "必须是数字");
        }
        double number = value.asDouble();
        if (number < min || number > max) {
            throw ApiException.badRequest(label + "应在 " + min + " 到 " + max + " 之间");
        }
        return number;
    }

    private static String enumText(
            ObjectNode node, String field, String fallback, String label, Set<String> allowed) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            node.put(field, fallback);
            return fallback;
        }
        if (!value.isTextual() || !allowed.contains(value.asText())) {
            throw ApiException.badRequest(label + "取值不正确");
        }
        return value.asText();
    }
}
