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
        Map.entry("项目经验", "project"), Map.entry("项目经历", "project"), Map.entry("核心项目经历", "project"),
        Map.entry("技术实践", "technical-practice"),
        Map.entry("专业技能", "skills"), Map.entry("技能", "skills"), Map.entry("技能特长", "skills"),
        Map.entry("专业技术", "skills"), Map.entry("专业技术能力", "skills"), Map.entry("专业能力", "skills"),
        Map.entry("技术能力", "skills"), Map.entry("个人技能", "skills"), Map.entry("核心技能", "skills"),
        Map.entry("技能清单", "skills"),
        Map.entry("自我评价", "evaluation"), Map.entry("个人评价", "evaluation"),
        Map.entry("实习经验", "intern"), Map.entry("实习经历", "intern"), Map.entry("实习", "intern"),
        Map.entry("基本信息", "basic"), Map.entry("个人信息", "basic"), Map.entry("求职意向", "intent"), Map.entry("待整理内容", "custom"));
    private static final List<String> SECTION_ORDER = List.of(
        "education", "skills", "work", "project", "evaluation", "intern", "technical-practice");
    private static final List<String> RECORD_SECTIONS = List.of("education", "work", "project", "intern");
    /** Footers such as {@code 1 / 3} or {@code 第 1 页 共 3 页} are page furniture, not resume content. */
    private static final Pattern PAGE_FOOTER = Pattern.compile(
            "(?:\\d{1,3}\\s*[/／]\\s*\\d{1,3}|第\\s*\\d{1,3}\\s*页(?:\\s*[/／]?\\s*共\\s*\\d{1,3}\\s*页)?|Page\\s+\\d+(?:\\s*(?:/|of)\\s*\\d+)?)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern RANGE = Pattern.compile("(\\d{4})[./年-](0?[1-9]|1[0-2])(?!\\d)月?\\s*(?:[-—–~～至]|到)+\\s*(?:(\\d{4})[./年-](0?[1-9]|1[0-2])(?!\\d)月?|(至今|现在|今))");
    private static final Pattern BULLET = Pattern.compile("^(?:[·•▪◦●○]|[-*]\\s+|\\d{1,2}[.、)）]\\s*).*");
    private static final Pattern LABEL_LINE = Pattern.compile("^.{1,24}[:：]$");
    /**
     * A header label starts a row or follows a column gap, e.g. {@code 出生年月：} or {@code  学　　历：}.
     * Only two-character labels may contain spacing, otherwise a Han value followed by a
     * gap plus a label ({@code 深圳  求职意向：}) would be swallowed into one label.
     */
    private static final Pattern HEADER_LABEL = Pattern.compile(
            "(?:^|(?<=[\\s\\u3000]))([\\p{IsHan}](?:[\\s\\u3000]{1,4}[\\p{IsHan}])|[\\p{IsHan}]{2,6})[:：]");
    /** Resumes that print {@code 2023.09 — 2026.11} instead of the ISO form. */
    private static final Pattern DOT_RANGE = Pattern.compile(
            "\\d{4}\\.(?:0?[1-9]|1[0-2])\\s*[—–-]\\s*(?:\\d{4}\\.(?:0?[1-9]|1[0-2])|至今|现在)");
    private static final Pattern TECH_STACK = Pattern.compile("^(?:技术框架|技术栈|技术选型|技术架构)[:：]");
    private static final String LABELS = "姓名|性别|城市|所在城市|联系电话|手机|电话|邮箱|电子邮箱|工作年限|意向职位|求职岗位|意向城市|期望薪资|到岗时间|年龄|籍贯|求职意向|出生年月|出生日期|民族|婚姻状况|政治面貌|身高|体重";
    private static final Pattern YEARS = Pattern.compile("^(\\d{1,2})\\s*年(?:以上)?(?:工作)?(?:经验|经历)$");
    private static final Pattern AGE = Pattern.compile("^\\d{1,2}\\s*岁$");
    private static final Pattern SALARY = Pattern.compile("^(?:面议|\\d+(?:\\.\\d+)?\\s*[kK](?:\\s*[-~至]\\s*\\d+(?:\\.\\d+)?\\s*[kK])?|\\d+(?:\\.\\d+)?\\s*万(?:\\s*[-~至]\\s*\\d+(?:\\.\\d+)?\\s*万)?(?:/年|每年)?|\\d+\\s*元(?:/月)?)$");
    private static final Pattern ARRIVAL = Pattern.compile("^(?:随时到岗|随时入职|随时|一周内到岗|1周内到岗|两周内到岗|一个月内到岗|1个月内到岗|立即到岗|可立即到岗|在职|离职)$");
    private static final Set<String> CITIES = Set.of(
        "北京", "上海", "天津", "重庆", "广州", "深圳", "杭州", "南京", "苏州", "成都", "武汉", "西安",
        "长沙", "郑州", "合肥", "济南", "青岛", "大连", "沈阳", "长春", "哈尔滨", "石家庄", "太原",
        "呼和浩特", "南昌", "福州", "厦门", "泉州", "宁波", "温州", "无锡", "常州", "南通", "徐州",
        "烟台", "潍坊", "东莞", "佛山", "珠海", "中山", "惠州", "江门", "汕头", "湛江", "南宁",
        "海口", "三亚", "昆明", "贵阳", "拉萨", "兰州", "西宁", "银川", "乌鲁木齐", "香港", "澳门", "台北");
    public ImportMapper(ObjectMapper json) { this.json = json; }

    static boolean isSectionHeading(String text) {
        return HEADINGS.containsKey(text.replaceAll("[\\s:：]", ""));
    }

    public ObjectNode draft(String source, String filename) {
        return draft(source, filename, null);
    }

    /** {@code accent} comes from the original file; a missing value keeps the neutral catalogue default. */
    public ObjectNode draft(String source, String filename, String accent) {
        return draft(source, filename, accent, Set.of());
    }

    public ObjectNode draft(ImportParser.Parsed parsed, String filename, String accent) {
        return draft(parsed.text(), filename, accent, parsed.headings());
    }

    private ObjectNode draft(String source, String filename, String accent, Set<String> sourceHeadings) {
        var headingKeys = new HashSet<String>();
        sourceHeadings.forEach(text -> headingKeys.add(text.replaceAll("[\\s\\u3000:：]", "")));
        var result = json.createObjectNode();
        result.put("title", filename.replaceFirst("(?i)\\.(pdf|docx)$", "").substring(0, Math.min(100, filename.replaceFirst("(?i)\\.(pdf|docx)$", "").length())));
        var doc = result.putObject("document"); doc.put("schemaVersion", 1);
        var basic = doc.putObject("basic");
        for (String key : List.of("name", "gender", "city", "phone", "email", "experienceYears", "photo", "birthMonth", "age", "nativePlace", "ethnicity", "maritalStatus", "politicalStatus", "height", "weight")) basic.put(key, "");
        basic.put("showPhoto", true); basic.putArray("customFields");
        var intent = doc.putObject("intent");
        for (String key : List.of("role", "city", "salary", "arrival")) intent.put(key, "");
        var sections = doc.putArray("sections");
        var grouped = new LinkedHashMap<String, List<String>>();
        for (String id : SECTION_ORDER) grouped.put(id, new ArrayList<>());
        grouped.put("custom", new ArrayList<>());
        var titles = new HashMap<String, String>();
        var order = new LinkedHashSet<String>();
        var intentOrder = new ArrayList<String>();
        boolean headerOpen = true;
        boolean labelledHeader = false;
        boolean unlabelledHeader = false;
        String current = "custom";
        String normalized = source.replace('\u3000', ' ');
        List<String> lines = normalized.lines().map(String::strip).filter(line -> !line.isEmpty()).toList();
        String nameCandidate = lines.isEmpty() ? "" : lines.get(0).replaceAll("\\s+", "");
        boolean contactHeader = lines.stream().limit(6).anyMatch(line -> line.contains("@") || line.matches(".*1[3-9][0-9]{9}.*"));
        if (contactHeader && nameCandidate.matches("[\\p{IsHan}]{2,4}") && !HEADINGS.containsKey(nameCandidate)
                && !List.of("个人简历", "求职简历", "简历").contains(nameCandidate)) basic.put("name", nameCandidate);
        for (String raw : source.split("\\R", -1)) {
            boolean indented = raw.startsWith("\u3000");
            String line = raw.replace('\u3000', ' ').strip();
            if (current.equals("custom") || current.equals("basic") || current.equals("intent")) {
                line = line.replaceAll("[\\p{Co}\\uFFFD\\u2580-\\u259F\\u25A4]", "").strip();
            }
            if (line.isEmpty() || PAGE_FOOTER.matcher(line).matches()) continue;
            String headingText = line.replaceAll("^[一二三四五六七八九十0-9]+[、.．)）]\\s*", "").replaceAll("[:：]\\s*$", "").strip();
            String headingKey = headingText.replaceAll("[\\s:：]", "");
            if (HEADINGS.containsKey(headingKey)) {
                current = HEADINGS.get(headingKey);
                headerOpen = false;
                if (!Set.of("basic", "intent", "custom").contains(current)) order.add(current);
                if (!current.equals("basic") && !current.equals("intent") && headingText.length() >= 3) {
                    titles.putIfAbsent(current, headingText);
                }
                continue;
            }
            // An unmatched heading starts a pending region; never infer header fields inside it.
            if (!headingKey.equals(basic.path("name").asText().replaceAll("\\s+", ""))
                    && (headingKeys.contains(headingKey) || unmatchedHeading(line))) {
                current = "custom";
                headerOpen = false;
                grouped.get("custom").add(line);
                continue;
            }
            if ((headerOpen && current.equals("custom")) || current.equals("basic") || current.equals("intent")) {
                if (line.replaceAll("\\s+", "").equals(basic.path("name").asText())) continue;
                String beforeFields = line;
                line = headerFields(line, basic, intent);
                if (!line.equals(beforeFields)) labelledHeader = true;
                if (line.isEmpty()) continue;
                var pair=Pattern.compile("^([^:：]{1,30})[:：]\\s*([^:：]{1,100})$").matcher(line);
                if(pair.matches() && basic.withArray("customFields").size()<20) {
                    basic.withArray("customFields").addObject().put("label",pair.group(1).strip()).put("value",pair.group(2).strip());
                    continue;
                }
            }
            if ((headerOpen && current.equals("custom")) || current.equals("basic")) {
                line = consumeUnlabelledContact(line, basic);
                if (line.isEmpty()) continue;
            }
            if (headerOpen) {
                String beforeHeader = line;
                line = consumeUnlabelledHeader(line, basic, intent, intentOrder);
                if (!line.equals(beforeHeader)) unlabelledHeader = true;
                if (line.isEmpty()) continue;
            }
            grouped.getOrDefault(current, grouped.get("custom")).add(indented ? "\u3000" + line : line);
        }
        if (!intentOrder.isEmpty()) {
            var intentFields = intent.putArray("fieldOrder");
            intentOrder.forEach(intentFields::add);
        }
        if (unlabelledHeader && !labelledHeader) styleNode(doc).put("metaStyle", "inline");
        if (DOT_RANGE.matcher(source).find()) styleNode(doc).put("dateStyle", "dot");
        var pending = grouped.get("custom");
        for (String id : order) {
            var section = sections.addObject(); section.put("id", id);
            section.put("title", titles.getOrDefault(id, title(id))); section.put("visible", true);
            boolean records = RECORD_SECTIONS.contains(id);
            section.put("type", records ? "records" : "rich"); var items = section.putArray("items");
            if (records) {
                ObjectNode active = null;
                List<String> description = new ArrayList<>();
                for (String line : grouped.get(id)) {
                    Matcher range = RANGE.matcher(line);
                    boolean dated = range.find();
                    if (active == null || (dated && (!active.path("startMonth").asText().isEmpty() || !active.path("body").asText().isEmpty()))) {
                        if (items.size() >= 30) { flushParagraphs(active, description, pending); pending.add(line); continue; }
                        flushParagraphs(active, description, pending);
                        active = item(items);
                        if (dated) {
                            active.put("startMonth", month(range.group(1), range.group(2)));
                            active.put("ongoing", range.group(5) != null);
                            if (range.group(3) != null) active.put("endMonth", month(range.group(3), range.group(4)));
                            String rest = (line.substring(0, range.start()) + " " + line.substring(range.end())).strip();
                            String[] fields = rest.split("\\s*[|｜\\t]\\s*|\\s{2,}", 3);
                            String title = fields.length >= 3 ? (fields[0] + " " + fields[1]).strip() : fields[0];
                            if (title.length() <= 100) active.put("title", title);
                            if (fields.length > 1 && fields[fields.length - 1].length() <= 100) active.put("role", fields[fields.length - 1]);
                            // The dated header is already represented by title/role/date fields.
                            // Preserve it in the body only when extraction did not fit the schema.
                            if (!active.path("title").asText().isBlank() && (fields.length < 2 || fields[fields.length - 1].length() <= 100)) continue;
                        }
                    }
                    description.add(line);
                }
                flushParagraphs(active, description, pending);
            } else {
                var active = item(items);
                appendParagraphs(active, grouped.get(id), pending);
            }
        }
        var custom = sections.addObject(); custom.put("id", "custom"); custom.put("title", "待整理内容");
        custom.put("type", "records"); custom.put("visible", !pending.isEmpty());
        var items = custom.putArray("items"); ObjectNode active = null;
        for (String line : pending) {
            // Small character chunks keep escaping expansion below the existing body limit.
            for (int offset = 0; offset < line.length(); offset += 2000) {
                String paragraph = html(line.substring(offset, Math.min(line.length(), offset + 2000)));
                if (active == null || active.path("body").asText().length() + paragraph.length() > 19_000) active = item(items);
                active.put("body", active.path("body").asText() + paragraph);
            }
        }
        var appearance = result.putObject("appearance");
        if (accent != null && accent.matches("#[0-9a-fA-F]{6}")) {
            appearance.put("templateId", "imported"); appearance.put("fontId", "sans"); appearance.put("fontSize", 14);
            appearance.put("lineHeight", 2.0); appearance.put("sectionGap", 20); appearance.put("recordGap", 4); appearance.put("pageMargin", 32);
            appearance.put("themeColor", accent.toLowerCase(Locale.ROOT));
            appearance.put("sectionTitleTint", false); appearance.put("sectionTitleTintColor", "#e8eff5");
        } else {
            appearance.put("templateId", "1045"); appearance.put("fontId", "sans"); appearance.put("fontSize", 14);
            appearance.put("lineHeight", 1.5); appearance.put("sectionGap", 18); appearance.put("recordGap", 4); appearance.put("pageMargin", 42); appearance.put("themeColor", "#1f5aa6");
            appearance.put("sectionTitleTint", false); appearance.put("sectionTitleTintColor", "#e8eff5");
        }
        return result;
    }

    /** Text-only fallback; styled source headings are supplied by ImportParser. */
    private boolean unmatchedHeading(String line) {
        if (line.endsWith("：") || line.endsWith(":")) return false;
        String text = line.replaceAll("^[一二三四五六七八九十0-9]+[、.．)）]\\s*", "").replaceAll("\\s+", "");
        if (Set.of("项目背景", "项目描述", "核心贡献", "工作内容", "主要职责", "技术栈", "技术框架", "项目职责",
                "职责描述", "项目成果", "技术选型", "技术架构").contains(text)) return false;
        return text.matches("[\\p{IsHan}]{0,24}(?:项目|实践|贡献|说明|概述|简介|背景|经历|技能|经验|证书|荣誉|奖项|爱好|信息|成果|能力|优势|作品|计划|评价|总结|清单|活动|研究|出版物)");
    }

    // PDF glyph positioning often inserts spaces inside Chinese labels. Split
    // every column on its label, keeping each unsupported but well-formed pair
    // as a header row instead of leaking it into the pending content.
    private String headerFields(String line, ObjectNode basic, ObjectNode intent) {
        var matcher = HEADER_LABEL.matcher(line);
        var starts = new ArrayList<Integer>();
        var ends = new ArrayList<Integer>();
        var labels = new ArrayList<String>();
        while (matcher.find()) {
            starts.add(matcher.start());
            ends.add(matcher.end());
            labels.add(matcher.group(1).replaceAll("[\\s\\u3000]+", ""));
        }
        if (starts.isEmpty()) return line;
        var remaining = new ArrayList<String>();
        if (starts.get(0) > 0) remaining.add(line.substring(0, starts.get(0)).strip());
        for (int i = 0; i < starts.size(); i++) {
            String value = line.substring(ends.get(i), i + 1 < starts.size() ? starts.get(i + 1) : line.length()).strip();
            if (value.isEmpty()) continue;
            String normalized = labels.get(i) + "：" + value;
            if (field(normalized, basic, intent)) continue;
            if (!addCustomField(basic, labels.get(i), value)) remaining.add(normalized);
        }
        return String.join(" ", remaining);
    }

    private boolean addCustomField(ObjectNode basic, String label, String value) {
        var fields = basic.withArray("customFields");
        if (label.isEmpty() || value.length() > 100 || fields.size() >= 20) return false;
        for (var existing : fields) if (existing.path("label").asText().equals(label)) return false;
        fields.addObject().put("label", label).put("value", value);
        return true;
    }

    private ObjectNode styleNode(ObjectNode document) {
        var node = document.path("importStyle");
        return node instanceof ObjectNode existing ? existing : document.putObject("importStyle");
    }

    private boolean field(String line, ObjectNode basic, ObjectNode intent) {
        var matcher = Pattern.compile("^(" + LABELS + ")[\\s\\u3000]*[:：][\\s\\u3000]*(.+)$").matcher(line);
        if (!matcher.matches()) return false;
        String label = matcher.group(1), value = matcher.group(2).strip();
        if (value.matches(".*(?:姓名|电话|手机|邮箱|城市|职位)\\s*[:：].*")) return false;
        if(label.equals("求职意向")) {
            String[] parts=value.split("\\s{2,}|[|｜]",3);
            if(parts[0].length()>100) return false;
            intent.put("role",parts[0]);
            if(parts.length>1 && parts[1].length()<=50) intent.put("city",parts[1]);
            if(parts.length>2 && parts[2].length()<=50) intent.put("arrival",parts[2]);
            return parts.length<=3 && (parts.length<2 || parts[1].length()<=50) && (parts.length<3 || parts[2].length()<=50);
        }
        String key = switch (label) {
            case "出生年月", "出生日期" -> "birthMonth"; case "年龄" -> "age"; case "籍贯" -> "nativePlace";
            case "民族" -> "ethnicity"; case "婚姻状况" -> "maritalStatus"; case "政治面貌" -> "politicalStatus";
            case "身高" -> "height"; case "体重" -> "weight";
            case "姓名" -> "name"; case "性别" -> "gender"; case "城市", "所在城市", "意向城市" -> "city";
            case "联系电话", "手机", "电话" -> "phone"; case "邮箱", "电子邮箱" -> "email"; case "工作年限" -> "experienceYears";
            case "意向职位", "求职岗位" -> "role"; case "期望薪资" -> "salary"; default -> "arrival";
        };
        var target = List.of("意向职位", "求职岗位", "意向城市", "期望薪资", "到岗时间").contains(label) ? intent : basic;
        int max = switch (key) { case "name", "city", "salary", "arrival" -> 50; case "gender" -> 10; case "phone", "experienceYears" -> 30; case "email" -> 120; default -> 100; };
        if (value.length() > max || !target.path(key).asText().isEmpty()) return false;
        if (key.equals("email") && !value.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) return false;
        if(key.equals("birthMonth")) {
            var birth=Pattern.compile("^(\\d{4})[年./-](\\d{1,2})(?:月|[./-]\\d{1,2}日?)?$").matcher(value);
            if(!birth.matches() || Integer.parseInt(birth.group(2))<1 || Integer.parseInt(birth.group(2))>12) return false;
            value=month(birth.group(1),birth.group(2));
        }
        target.put(key, value);
        if (target == basic && !key.equals("name")) {
            var order = basic.withArray("fieldOrder");
            boolean present = false;
            for (var existing : order) if (existing.asText().equals(key)) present = true;
            if (!present) order.add(key);
        }
        return true;
    }
    /** Pulls bare contact values out of a mixed header row so they are not repeated as unknown content. */
    private String consumeUnlabelledContact(String line, ObjectNode basic) {
        var email = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,63}").matcher(line);
        if (basic.path("email").asText().isEmpty() && email.find() && email.group().length() <= 120) {
            basic.put("email", email.group());
            line = email.replaceFirst(" ").strip();
        }
        var phone = Pattern.compile("(?<![0-9])(?:\\+86[- ]?)?1[3-9][0-9]{9}(?![0-9])").matcher(line);
        if (basic.path("phone").asText().isEmpty() && phone.find()) {
            basic.put("phone", phone.group());
            line = phone.replaceFirst(" ").strip();
        }
        return line.replaceAll("^[\\s|｜·•]+|[\\s|｜·•]+$", "").strip();
    }

    /** Pulls standard fields out of an unlabelled header row, e.g. {@code 深圳  面议  随时到岗  资深Java工程师}. */
    private String consumeUnlabelledHeader(String line, ObjectNode basic, ObjectNode intent, List<String> intentOrder) {
        if (line.isEmpty() || line.startsWith("•") || line.startsWith("·") || line.startsWith("-")) return line;
        if (line.length() > 80 || line.matches(".*[。；;].*")) return line;
        var tokens = line.split("\\s{2,}|\\s*[·|｜]\\s*");
        if (tokens.length == 0) return line;
        var remaining = new ArrayList<String>();
        var matches = new ArrayList<String[]>();
        for (String raw : tokens) {
            String token = raw.strip();
            if (token.isEmpty()) continue;
            if (basic.path("gender").asText().isEmpty() && (token.equals("男") || token.equals("女"))) {
                matches.add(new String[]{"basic", "gender", token}); continue;
            }
            if (basic.path("experienceYears").asText().isEmpty() && YEARS.matcher(token).matches()) {
                matches.add(new String[]{"basic", "experienceYears", token}); continue;
            }
            if (basic.path("age").asText().isEmpty() && AGE.matcher(token).matches()) {
                matches.add(new String[]{"basic", "age", token}); continue;
            }
            if (intent.path("salary").asText().isEmpty() && SALARY.matcher(token).matches()) {
                matches.add(new String[]{"intent", "salary", token}); continue;
            }
            if (intent.path("arrival").asText().isEmpty() && ARRIVAL.matcher(token).matches()) {
                matches.add(new String[]{"intent", "arrival", token}); continue;
            }
            if (basic.path("city").asText().isEmpty() && intent.path("city").asText().isEmpty()
                    && (CITIES.contains(token) || token.matches("[\\p{IsHan}]{2,4}市"))) {
                matches.add(new String[]{"city", "city", token}); continue;
            }
            remaining.add(token);
        }
        if (matches.isEmpty()) return line;
        // A city beside salary/arrival/role is the expected city, not the current one.
        boolean intentRow = matches.stream().anyMatch(match -> match[0].equals("intent"));
        for (String[] match : matches) {
            String target = match[0].equals("city") ? (intentRow ? "intent" : "basic") : match[0];
            var node = target.equals("intent") ? intent : basic;
            if (!node.path(match[1]).asText().isEmpty()) continue;
            node.put(match[1], match[2]);
            if (target.equals("intent") && !intentOrder.contains(match[1])) intentOrder.add(match[1]);
        }
        if (remaining.size() == 1 && intent.path("role").asText().isEmpty() && remaining.get(0).length() <= 50) {
            intent.put("role", remaining.get(0));
            if (!intentOrder.contains("role")) intentOrder.add("role");
            remaining.clear();
        }
        return String.join("  ", remaining);
    }

    private void flushParagraphs(ObjectNode active, List<String> lines, List<String> pending) {
        if (active != null && !lines.isEmpty()) appendParagraphs(active, lines, pending);
        lines.clear();
    }

    private void appendParagraphs(ObjectNode item, List<String> lines, List<String> pending) {
        for (String paragraph : paragraphs(lines)) {
            String html = html(paragraph);
            // Source resumes keep a blank line between the summary and the tech-stack block.
            if (!item.path("body").asText().isEmpty() && TECH_STACK.matcher(paragraph).lookingAt()) {
                html = "<p>\u200b</p>" + html;
            }
            if (item.path("body").asText().length() + html.length() > 19_000) pending.add(paragraph);
            else item.put("body", item.path("body").asText() + html);
        }
    }

    /** Rejoins lines that PDF extraction hard-wrapped, while labels and bullets stay separate paragraphs. */
    private List<String> paragraphs(List<String> lines) {
        var result = new ArrayList<String>();
        StringBuilder current = null;
        for (String raw : lines) {
            boolean indented = raw.startsWith("\u3000");
            String line = raw.strip();
            if (line.isEmpty()) continue;
            boolean startsBlock = indented || BULLET.matcher(line).matches() || LABEL_LINE.matcher(line).matches();
            if (current != null && !startsBlock && !endsSentence(current)) {
                boolean asciiJoin = current.charAt(current.length() - 1) < 128 && line.charAt(0) < 128;
                current.append(asciiJoin ? " " : "").append(line);
            } else {
                if (current != null) result.add(current.toString());
                current = new StringBuilder(indented ? "\u3000\u3000" + line : line);
            }
        }
        if (current != null) result.add(current.toString());
        return result;
    }

    private boolean endsSentence(StringBuilder text) {
        if (text.isEmpty()) return true;
        return "。！？；：!?;:.".indexOf(text.charAt(text.length() - 1)) >= 0;
    }

    private ObjectNode item(ArrayNode items) {
        var item = items.addObject(); item.put("id", "import-" + UUID.randomUUID().toString());
        for (String key : List.of("title", "role", "startMonth", "endMonth", "body")) item.put(key, ""); item.put("ongoing", false); return item;
    }
    private String month(String year, String month) { return year + "-" + String.format("%02d", Integer.parseInt(month)); }
    private String html(String text) { return "<p>" + text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;") + "</p>"; }
    private String title(String id) { return switch (id) { case "education" -> "教育背景"; case "work" -> "工作经验"; case "project" -> "项目经验"; case "skills" -> "专业技能"; case "summary" -> "个人概述"; case "application" -> "报考信息"; case "intern" -> "实习经验"; case "campus" -> "校园经历"; case "honor" -> "荣誉证书"; case "hobby" -> "兴趣爱好"; default -> "自我评价"; }; }
}
