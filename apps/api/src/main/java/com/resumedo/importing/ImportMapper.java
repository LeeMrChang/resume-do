package com.resumedo.importing;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.*;
import java.util.*;
import java.util.regex.*;
import org.springframework.stereotype.Component;

@Component
public class ImportMapper {
    private final ObjectMapper json;
    private static final Map<String, String> HEADINGS = Map.ofEntries(
        Map.entry("教育背景", "education"), Map.entry("教育经历", "education"), Map.entry("教育", "education"),
        Map.entry("工作经验", "work"), Map.entry("工作经历", "work"), Map.entry("职业经历", "work"),
        Map.entry("项目经验", "project"), Map.entry("项目经历", "project"),
        Map.entry("专业技能", "skills"), Map.entry("技能", "skills"), Map.entry("技能特长", "skills"),
        Map.entry("自我评价", "evaluation"), Map.entry("个人评价", "evaluation"),
        Map.entry("基本信息", "basic"), Map.entry("个人信息", "basic"), Map.entry("求职意向", "intent"));
    private static final Pattern RANGE = Pattern.compile("(\\d{4})[./年-](0?[1-9]|1[0-2])月?\\s*(?:[-—–~～至]|到)+\\s*(?:(\\d{4})[./年-](0?[1-9]|1[0-2])月?|(至今|现在|今))");
    public ImportMapper(ObjectMapper json) { this.json = json; }

    public ObjectNode draft(String source, String filename) {
        var result = json.createObjectNode();
        result.put("title", filename.replaceFirst("(?i)\\.(pdf|docx)$", "").substring(0, Math.min(100, filename.replaceFirst("(?i)\\.(pdf|docx)$", "").length())));
        var doc = result.putObject("document"); doc.put("schemaVersion", 1);
        var basic = doc.putObject("basic");
        for (String key : List.of("name", "gender", "city", "phone", "email", "experienceYears", "photo")) basic.put(key, "");
        var intent = doc.putObject("intent");
        for (String key : List.of("role", "city", "salary", "arrival")) intent.put(key, "");
        var sections = doc.putArray("sections");
        var grouped = new LinkedHashMap<String, List<String>>();
        for (String id : List.of("education", "work", "project", "skills", "evaluation", "custom")) grouped.put(id, new ArrayList<>());
        String current = "custom";
        List<String> lines = source.lines().map(String::strip).filter(line -> !line.isEmpty()).toList();
        String nameCandidate = lines.isEmpty() ? "" : lines.get(0).replaceAll("\\s+", "");
        boolean contactHeader = lines.stream().limit(6).anyMatch(line -> line.contains("@") || line.matches(".*1[3-9][0-9]{9}.*"));
        if (contactHeader && nameCandidate.matches("[\\p{IsHan}]{2,4}") && !HEADINGS.containsKey(nameCandidate)
                && !List.of("个人简历", "求职简历", "简历").contains(nameCandidate)) basic.put("name", nameCandidate);
        for (String raw : source.split("\\R", -1)) {
            String line = raw.strip();
            if (current.equals("custom") || current.equals("basic") || current.equals("intent")) {
                line = line.replaceAll("[\\p{Co}\\uFFFD\\u2580-\\u259F\\u25A4]", "").strip();
            }
            if (line.isEmpty()) continue;
            String heading = line.replaceAll("^[一二三四五六七八九十0-9]+[、.．)）]\\s*", "").replaceAll("[\\s:：]", "");
            if (HEADINGS.containsKey(heading)) { current = HEADINGS.get(heading); continue; }
            if (current.equals("custom") || current.equals("basic") || current.equals("intent")) {
                if (line.replaceAll("\\s+", "").equals(basic.path("name").asText())) continue;
                line = headerFields(line, basic, intent);
                if (line.isEmpty()) continue;
            }
            if (current.equals("custom") || current.equals("basic")) {
                var email = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,63}").matcher(line);
                if (basic.path("email").asText().isEmpty() && email.find() && email.group().length() <= 120) basic.put("email", email.group());
                var phone = Pattern.compile("(?<![0-9])(?:\\+86[- ]?)?1[3-9][0-9]{9}(?![0-9])").matcher(line);
                if (basic.path("phone").asText().isEmpty() && phone.find()) basic.put("phone", phone.group());
                // Keep the whole header line in pending content as well: extraction
                // must not discard other values sharing a contact row.
            }
            grouped.getOrDefault(current, grouped.get("custom")).add(line);
        }
        var pending = grouped.get("custom");
        for (String id : List.of("education", "work", "project", "skills", "evaluation")) {
            var section = sections.addObject(); section.put("id", id); section.put("title", title(id)); section.put("visible", true);
            boolean records = List.of("education", "work", "project").contains(id);
            section.put("type", records ? "records" : "rich"); var items = section.putArray("items");
            if (records) {
                ObjectNode active = null;
                for (String line : grouped.get(id)) {
                    Matcher range = RANGE.matcher(line);
                    boolean dated = range.find();
                    if (active == null || (dated && !active.path("body").asText().isEmpty())) {
                        if (items.size() >= 30) { pending.add(line); continue; }
                        active = item(items);
                        if (dated) {
                            active.put("startMonth", month(range.group(1), range.group(2)));
                            active.put("ongoing", range.group(5) != null);
                            if (range.group(3) != null) active.put("endMonth", month(range.group(3), range.group(4)));
                            String rest = (line.substring(0, range.start()) + " " + line.substring(range.end())).strip();
                            String[] fields = rest.split("\\s*[|｜\\t]\\s*|\\s{2,}", 2);
                            if (fields[0].length() <= 100) active.put("title", fields[0]);
                            if (fields.length > 1 && fields[1].length() <= 100) active.put("role", fields[1]);
                        }
                    }
                    if (active.path("body").asText().length() + html(line).length() > 19_000) { pending.add(line); continue; }
                    active.put("body", active.path("body").asText() + html(line));
                }
            } else {
                var active = item(items);
                for (String line : grouped.get(id)) {
                    if (active.path("body").asText().length() + html(line).length() > 19_000) pending.add(line);
                    else active.put("body", active.path("body").asText() + html(line));
                }
            }
        }
        var custom = sections.addObject(); custom.put("id", "custom"); custom.put("title", "待整理内容"); custom.put("type", "records"); custom.put("visible", true);
        var items = custom.putArray("items"); ObjectNode active = item(items);
        for (String line : pending) {
            // Small character chunks keep escaping expansion below the existing body limit.
            for (int offset = 0; offset < line.length(); offset += 2000) {
                String paragraph = html(line.substring(offset, Math.min(line.length(), offset + 2000)));
                if (active.path("body").asText().length() + paragraph.length() > 19_000) active = item(items);
                active.put("body", active.path("body").asText() + paragraph);
            }
        }
        var appearance = result.putObject("appearance");
        appearance.put("templateId", "1045"); appearance.put("fontId", "sans"); appearance.put("fontSize", 14);
        appearance.put("lineHeight", 1.5); appearance.put("sectionGap", 18); appearance.put("pageMargin", 42); appearance.put("themeColor", "#1f5aa6");
        return result;
    }

    // PDF glyph positioning often inserts spaces inside Chinese labels. Split
    // multiple columns by labels, keeping every unsupported or invalid value.
    private String headerFields(String line, ObjectNode basic, ObjectNode intent) {
        String labels = "姓名|性别|城市|所在城市|联系电话|手机|电话|邮箱|电子邮箱|工作年限|意向职位|求职岗位|意向城市|期望薪资|到岗时间|年龄|籍贯|求职意向";
        String spaced = Arrays.stream(labels.split("\\|"))
                .map(label -> String.join("\\s*", label.split("")))
                .reduce((a, b) -> a + "|" + b).orElseThrow();
        var matcher = Pattern.compile("(" + spaced + ")\\s*[:：]\\s*").matcher(line);
        var starts = new ArrayList<Integer>();
        while (matcher.find()) starts.add(matcher.start());
        if (starts.isEmpty()) return line;
        var remaining = new ArrayList<String>();
        if (starts.get(0) > 0) remaining.add(line.substring(0, starts.get(0)).strip());
        for (int i = 0; i < starts.size(); i++) {
            String part = line.substring(starts.get(i), i + 1 < starts.size() ? starts.get(i + 1) : line.length()).strip();
            int colon = part.indexOf('：');
            if (colon < 0) colon = part.indexOf(':');
            String normalized = part.substring(0, colon).replaceAll("\\s+", "") + "：" + part.substring(colon + 1).strip();
            if (!field(normalized, basic, intent)) remaining.add(normalized);
        }
        return String.join(" ", remaining);
    }

    private boolean field(String line, ObjectNode basic, ObjectNode intent) {
        var matcher = Pattern.compile("^(姓名|性别|城市|所在城市|联系电话|手机|电话|邮箱|电子邮箱|工作年限|意向职位|求职岗位|意向城市|期望薪资|到岗时间)\\s*[:：]\\s*(.+)$").matcher(line);
        if (!matcher.matches()) return false;
        String label = matcher.group(1), value = matcher.group(2).strip();
        if (value.matches(".*(?:姓名|电话|手机|邮箱|城市|职位)\\s*[:：].*")) return false;
        String key = switch (label) {
            case "姓名" -> "name"; case "性别" -> "gender"; case "城市", "所在城市", "意向城市" -> "city";
            case "联系电话", "手机", "电话" -> "phone"; case "邮箱", "电子邮箱" -> "email"; case "工作年限" -> "experienceYears";
            case "意向职位", "求职岗位" -> "role"; case "期望薪资" -> "salary"; default -> "arrival";
        };
        var target = List.of("意向职位", "求职岗位", "意向城市", "期望薪资", "到岗时间").contains(label) ? intent : basic;
        int max = switch (key) { case "name", "city", "salary", "arrival" -> 50; case "gender" -> 10; case "phone", "experienceYears" -> 30; case "email" -> 120; default -> 100; };
        if (value.length() > max || !target.path(key).asText().isEmpty()) return false;
        if (key.equals("email") && !value.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) return false;
        target.put(key, value); return true;
    }
    private ObjectNode item(ArrayNode items) {
        var item = items.addObject(); item.put("id", "import-" + UUID.randomUUID().toString());
        for (String key : List.of("title", "role", "startMonth", "endMonth", "body")) item.put(key, ""); item.put("ongoing", false); return item;
    }
    private String month(String year, String month) { return year + "-" + String.format("%02d", Integer.parseInt(month)); }
    private String html(String text) { return "<p>" + text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;") + "</p>"; }
    private String title(String id) { return switch (id) { case "education" -> "教育背景"; case "work" -> "工作经验"; case "project" -> "项目经验"; case "skills" -> "专业技能"; default -> "自我评价"; }; }
}
