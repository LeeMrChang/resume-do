package com.resumedo.importing;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.springframework.stereotype.Component;

/** Reads the source page appearance so the imported skin can mirror it instead of re-styling it. */
@Component
public class ImportLayoutDetector {
    private static final float RENDER_DPI = 144f;
    private static final float SCALE = RENDER_DPI / 72f;
    private static final float A4_WIDTH = 595.276f;
    private static final float A4_HEIGHT = 841.89f;
    /** At 144 dpi a 1–3 pt divider is only a few rows tall; a tinted band is far taller. */
    private static final int MAX_RULE_ROWS = 8;
    private static final int MIN_CONTRAST = 60;
    private static final Pattern DATE_RANGE = Pattern.compile(
            "\\d{4}[./\\-年]\\s*\\d{1,2}\\s*[~～—–\\-至]\\s*(?:\\d{4}[./\\-年]\\s*\\d{1,2}|至今|现在)");

    record Fragment(float y, float left, float right, String text, float size) {}

    record Line(String text, float left, float right, String color, float y, float size, List<Fragment> parts) {
        Line(String text, float left, float right) {
            this(text, left, right, null, 0, 0, List.of());
        }
    }

    record Rules(String headerRule, String leftRule, boolean leftDashed, int headerLeft) {}

    /** Everything the imported skin can mirror from the original page without re-flowing text. */
    public record Layout(String align, String nameColor, String intentColor, String metaColor,
            String sectionTitleColor, String sectionTint, String titleRule, String pageBackground, String headerRule,
            String leftRule, boolean leftDashed, String recordHead, float nameSize, float intentSize, float metaSize,
            int bulletMark, int bulletIndent, int bulletGap, float bodySize, float lineHeight,
            float titleSize,
            Integer pageMargin, int recordIndent, int bodyIndent, int bodyTextIndent, int paragraphGap,
            int headerIndent, String recordMark, float scale) {}

    record BodyStats(float size, float lineHeight, int bulletGap) {}

    record BulletIndent(int mark, int text) {}

    /** A paragraph either sits in a narrower column, or only its first line is pushed in. */
    record ParagraphIndent(int block, int firstLine, int gap) {}

    /** Returns {@code center} or {@code left}, or null when the file gives no reliable clue. */
    public String headerAlign(Path path, String extension, String name, Set<String> sectionTitles) {
        var layout = analyze(path, extension, name, sectionTitles);
        return layout == null ? null : layout.align();
    }

    public Layout analyze(Path path, String extension, String name, Set<String> sectionTitles) {
        if (!"pdf".equalsIgnoreCase(extension) || name == null || name.isBlank()) return null;
        try (PDDocument pdf = Loader.loadPDF(path.toFile())) {
            var image = new PDFRenderer(pdf).renderImageWithDPI(0, RENDER_DPI, ImageType.RGB);
            int pageBackground = image.getRGB(2, 2);
            var lines = firstPageLines(pdf);
            int start = -1;
            for (int i = 0; i < lines.size(); i++) {
                if (compact(lines.get(i).text()).equals(compact(name))) { start = i; break; }
            }
            String align = null, nameColor = null, intentColor = null, metaColor = null;
            float nameSize = 0;
            float intentSize = 0, metaSize = 0;
            if (start >= 0) {
                var header = new ArrayList<Line>();
                for (int i = start; i < lines.size() && header.size() < 3; i++) {
                    var line = lines.get(i);
                    String text = compact(line.text());
                    if (header.size() > 0 && sectionTitles.contains(text)) break;
                    if (text.isEmpty()) continue;
                    header.add(line);
                }
                if (!header.isEmpty()) {
                    nameColor = textColor(image, header.get(0));
                    nameSize = dominantSize(header.get(0));
                    if (header.size() > 1) {
                        intentColor = textColor(image, header.get(1));
                        intentSize = dominantSize(header.get(1));
                    }
                    if (header.size() > 2) {
                        metaColor = textColor(image, header.get(2));
                        metaSize = dominantSize(header.get(2));
                    }
                }
                align = centered(header, pdf.getPage(0).getMediaBox().getWidth()) ? "center" : "left";
            }
            String titleColor = null, tint = null, titleRule = null;
            float titleY = Float.MAX_VALUE, titlePt = 0;
            for (var line : lines) {
                if (sectionTitles.contains(compact(line.text()))) {
                    titleColor = textColor(image, line);
                    tint = boxTint(image, line);
                    titleRule = ruleBelow(image, line.y());
                    titleY = line.y();
                    titlePt = line.size();
                    break;
                }
            }
            var rules = rules(image, titleY);
            var stats = bodyStats(lines, titleY);
            Integer margin = pageMargin(lines);
            var indent = bulletIndents(lines, margin, titleY);
            float pitch = stats.size() * stats.lineHeight();
            var paragraph = paragraphIndent(lines, titleY, margin, stats.size(), indent, sectionTitles);
            int gap = paragraphGap(lines, titleY, margin, stats.size(), indent, sectionTitles, pitch);
            if (paragraph.block() == 0 && paragraph.firstLine() == 0 && gap == 0) {
                int[] later = laterParagraph(pdf, margin, stats.size(), indent, sectionTitles, pitch);
                if (later != null) {
                    paragraph = new ParagraphIndent(later[0], later[1], later[2]);
                    gap = later[2];
                }
            } else if (gap == 0) {
                int[] later = laterParagraph(pdf, margin, stats.size(), indent, sectionTitles, pitch);
                if (later != null && later[2] > 0) gap = later[2];
            }
            float recordLeft = recordLeft(lines, titleY);
            int recordIndent = indentPx(recordLeft, margin, 48);
            // A rule that stops at the entry column means the source indents its header too.
            boolean headerIndent = recordIndent > 0 && rules.headerLeft() > 0
                    && Math.abs(rules.headerLeft() - recordLeft) <= 2f;
            return new Layout(align, nameColor, intentColor, metaColor, titleColor, tint, titleRule,
                    hex(pageBackground), rules.headerRule(), rules.leftRule(), rules.leftDashed(),
                    recordHead(lines, titleY), nameSize, intentSize, metaSize, indent == null ? 0 : indent.mark(),
                    indent == null ? 0 : indent.text(), stats.bulletGap(), stats.size(), stats.lineHeight(),
                    titleScale(titlePt, stats.size()), margin,
                    recordIndent, paragraph.block(), paragraph.firstLine(), gap,
                    headerIndent ? recordIndent : 0, recordMark(image, lines, titleY, margin),
                    pageScale(pdf.getPage(0).getMediaBox()));
        } catch (IOException | RuntimeException ignored) {
            return null; // Layout is a nicety; text import must still succeed.
        }
    }

    static boolean centered(List<Line> lines, float pageWidth) {
        if (lines.size() < 2) return false;
        float tolerance = Math.max(4f, pageWidth * 0.012f);
        float first = (lines.get(0).left() + lines.get(0).right()) / 2;
        boolean unevenLeft = false;
        for (var line : lines) {
            if (Math.abs((line.left() + line.right()) / 2 - first) > tolerance) return false;
            if (Math.abs(line.left() - lines.get(0).left()) > 4f) unevenLeft = true;
        }
        return unevenLeft;
    }

    /**
     * Finds the long horizontal rule under the header and the long vertical rule beside it.
     * Pixel rows/columns are used so dashed rules and transformed page content are measured
     * the same way a reader sees them. A tinted band is much taller than a rule, so rows are
     * grouped and only thin groups count as dividers.
     */
    static Rules rules(BufferedImage image, float sectionTop) {
        int width = image.getWidth(), height = image.getHeight();
        int background = image.getRGB(2, 2);
        int lastRow = sectionTop == Float.MAX_VALUE
                ? height / 2
                : Math.min(height / 2, Math.max(1, Math.round((sectionTop - 3) * SCALE)));

        String header = null;
        int headerWidth = 0, headerLeft = 0;
        int groupStart = -1, groupBest = 0, groupBestStart = -1, groupBestRow = -1;
        for (int y = 0; y < lastRow; y++) {
            int run = 0, best = 0, start = -1, bestStart = -1;
            for (int x = 0; x < width; x++) {
                if (near(image.getRGB(x, y), background)) { start = -1; continue; }
                if (start < 0) start = x;
                run = x - start + 1;
                if (run > best) { best = run; bestStart = start; }
            }
            boolean wide = best >= width * 0.5f;
            if (wide && groupStart < 0) { groupStart = y; groupBest = 0; groupBestStart = -1; groupBestRow = -1; }
            if (wide && best > groupBest) { groupBest = best; groupBestStart = bestStart; groupBestRow = y; }
            if (!wide && groupStart >= 0) {
                String found = thinRule(image, groupStart, y, groupBest, groupBestStart, groupBestRow, background);
                if (found != null && groupBest > headerWidth) {
                    header = found;
                    headerLeft = Math.round(groupBestStart / SCALE);
                    headerWidth = groupBest;
                }
                groupStart = -1;
            }
        }
        if (groupStart >= 0) {
            String found = thinRule(image, groupStart, lastRow, groupBest, groupBestStart, groupBestRow, background);
            if (found != null && groupBest > headerWidth) {
                header = found;
                headerLeft = Math.round(groupBestStart / SCALE);
            }
        }

        int limit = Math.round(width * 0.15f);
        int[] counts = new int[limit];
        int[] spans = new int[limit];
        boolean[] qualifies = new boolean[limit];
        for (int x = 0; x < limit; x++) {
            int count = 0, minY = Integer.MAX_VALUE, maxY = -1;
            for (int y = 0; y < height; y++) {
                if (near(image.getRGB(x, y), background)) continue;
                count++;
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
            counts[x] = count;
            spans[x] = maxY - minY + 1;
            qualifies[x] = count >= height * 0.3f && maxY - minY >= height * 0.55f;
        }

        String left = null;
        boolean leftDashed = false;
        int leftScore = 0;
        int cursor = 0;
        while (cursor < limit) {
            if (!qualifies[cursor]) { cursor++; continue; }
            int start = cursor;
            while (cursor < limit && qualifies[cursor]) cursor++;
            int thickness = cursor - start;
            if (thickness > 8) continue;
            // A rule stands alone in white space; a glyph stroke has more ink right beside it.
            int beside = 0;
            for (int probe = Math.max(0, start - 2); probe < start; probe++) beside = Math.max(beside, counts[probe]);
            for (int probe = cursor; probe < Math.min(limit, cursor + 2); probe++) beside = Math.max(beside, counts[probe]);
            if (beside >= height * 0.3f) continue;
            int middle = (start + cursor - 1) / 2;
            var color = dominantColor(image, middle, 0, 1, height, background, true);
            if (color == null || color.share() < 0.5) continue;
            if (counts[middle] > leftScore) {
                leftScore = counts[middle];
                left = color.color();
                // A dashed rule leaves page-coloured gaps along its length; a solid one does not.
                leftDashed = counts[middle] < spans[middle] * 0.85;
            }
        }
        return new Rules(header, left, leftDashed, headerLeft);
    }

    /**
     * Page one can be a header plus a list only. Paragraphs often start on page two, so the
     * paragraph style is read from the first page that actually prints one.
     */
    private int[] laterParagraph(PDDocument pdf, Integer margin, float bodySize,
            BulletIndent bullets, Set<String> sectionTitles, float pitchPt) throws IOException {
        for (int page = 2; page <= Math.min(3, pdf.getNumberOfPages()); page++) {
            var lines = pageLines(pdf, page);
            var pageBullets = bullets != null ? bullets : bulletIndents(lines, margin, 0f);
            var paragraph = paragraphIndent(lines, 0f, margin, bodySize, pageBullets, sectionTitles);
            int gap = paragraphGap(lines, 0f, margin, bodySize, pageBullets, sectionTitles, pitchPt);
            if (paragraph.block() > 0 || paragraph.firstLine() > 0 || gap > 0) {
                return new int[] { paragraph.block(), paragraph.firstLine(), gap };
            }
        }
        return null;
    }

    /**
     * A source page that is not A4 (a zoomed A4 export, Letter, or a custom size) re-flowed onto
     * A4 keeps the wrong line breaks. Scaling the whole skin by the page ratio keeps every wrap
     * and page break where the original put it.
     */
    static float pageScale(org.apache.pdfbox.pdmodel.common.PDRectangle box) {
        float width = box.getWidth(), height = box.getHeight();
        if (width <= 0 || height <= 0) return 1f;
        float scale = Math.min(A4_WIDTH / width, A4_HEIGHT / height);
        if (scale < 0.8f || scale > 1.2f) return 1f;
        return Math.round(scale * 1000f) / 1000f;
    }

    /** A thin divider printed directly under a section title, if the page has one. */
    static String ruleBelow(BufferedImage image, float titleY) {
        int width = image.getWidth(), height = image.getHeight();
        int background = image.getRGB(2, 2);
        int from = Math.max(0, Math.round((titleY + 2) * SCALE));
        int to = Math.min(height, Math.round((titleY + 16) * SCALE));
        int groupStart = -1, groupBest = 0, groupBestRow = -1;
        for (int y = from; y < to; y++) {
            int run = 0, best = 0, start = -1;
            for (int x = 0; x < width; x++) {
                if (near(image.getRGB(x, y), background)) { start = -1; continue; }
                if (start < 0) start = x;
                run = x - start + 1;
                best = Math.max(best, run);
            }
            boolean wide = best >= width * 0.5f;
            if (wide && groupStart < 0) { groupStart = y; groupBest = 0; groupBestRow = -1; }
            if (wide && best > groupBest) { groupBest = best; groupBestRow = y; }
            if (!wide && groupStart >= 0) {
                if (y - groupStart <= MAX_RULE_ROWS) return ruleRowColor(image, groupBestRow, background);
                groupStart = -1;
            }
        }
        if (groupStart >= 0 && to - groupStart <= MAX_RULE_ROWS) return ruleRowColor(image, groupBestRow, background);
        return null;
    }

    private static String ruleRowColor(BufferedImage image, int row, int background) {
        if (row < 0) return null;
        var color = dominantColor(image, 0, row, image.getWidth(), 1, background, false);
        return color == null || color.share() < 0.5 ? null : color.color();
    }

    private static String thinRule(BufferedImage image, int startRow, int endRow, int width, int startX,
            int row, int background) {
        if (endRow - startRow > MAX_RULE_ROWS || startX < 0 || row < 0) return null;
        var color = dominantColor(image, startX, row, width, 1, background, false);
        if (color == null || color.share() < 0.5) return null;
        return color.color();
    }

    /** The colour a reader perceives in a line: the ink, not a tinted band behind it. */
    static String textColor(BufferedImage image, Line line) {
        var counts = boxCounts(image, line);
        if (counts.isEmpty()) return null;
        int background = rowBackground(image, line);
        var ink = counts.entrySet().stream()
                .filter(candidate -> distance(candidate.getKey(), background) >= MIN_CONTRAST)
                .toList();
        if (ink.isEmpty()) return hex(mostFrequent(counts).getKey());
        // Weight by contrast so a pale band's many pixels lose to the few dark glyph pixels.
        return ink.stream()
                .max(java.util.Comparator.comparingLong(candidate ->
                        (long) candidate.getValue() * distance(candidate.getKey(), background)))
                .map(entry -> hex(entry.getKey()))
                .orElse(null);
    }

    /** The pale band a section title sits on, if the source prints one. */
    static String boxTint(BufferedImage image, Line line) {
        var counts = boxCounts(image, line);
        if (counts.isEmpty()) return null;
        int page = image.getRGB(2, 2);
        var dominant = mostFrequent(counts);
        if (distance(dominant.getKey(), page) < 10) return null;
        int rgb = dominant.getKey();
        int luma = (299 * ((rgb >> 16) & 0xFF) + 587 * ((rgb >> 8) & 0xFF) + 114 * (rgb & 0xFF)) / 1000;
        return luma >= 210 ? hex(rgb) : null;
    }

    private static Map<Integer, Integer> boxCounts(BufferedImage image, Line line) {
        int left = Math.max(0, Math.round(line.left() * SCALE));
        int right = Math.min(image.getWidth(), Math.round(line.right() * SCALE));
        int top = Math.max(0, Math.round((line.y() - Math.max(6f, line.size())) * SCALE));
        int bottom = Math.min(image.getHeight(), Math.round((line.y() + 5) * SCALE));
        var counts = new HashMap<Integer, Integer>();
        if (right <= left || bottom <= top) return counts;
        for (int y = top; y < bottom; y++) {
            for (int x = left; x < right; x++) counts.merge(image.getRGB(x, y), 1, Integer::sum);
        }
        return counts;
    }

    /** The page colour directly above a line; a tinted band replaces it when the line sits on one. */
    private static int rowBackground(BufferedImage image, Line line) {
        int left = Math.max(0, Math.round(line.left() * SCALE));
        int right = Math.min(image.getWidth(), Math.round(line.right() * SCALE));
        int top = Math.max(0, Math.min(image.getHeight() - 1,
                Math.round((line.y() - Math.max(6f, line.size())) * SCALE)));
        var counts = new HashMap<Integer, Integer>();
        for (int x = left; x < right; x++) counts.merge(image.getRGB(x, top), 1, Integer::sum);
        if (counts.isEmpty()) return image.getRGB(2, 2);
        var dominant = mostFrequent(counts);
        int sampled = counts.values().stream().mapToInt(Integer::intValue).sum();
        return dominant.getValue() >= sampled * 0.7 ? dominant.getKey() : image.getRGB(2, 2);
    }

    /** Date column on the left (date / title / role) or on the right (title / role / date). */
    static String recordHead(List<Line> lines, float sectionTop) {
        int first = 0, last = 0;
        for (var line : lines) {
            if (line.y() <= sectionTop || line.parts().size() < 2) continue;
            var date = line.parts().stream().filter(part -> DATE_RANGE.matcher(part.text()).find()).findFirst();
            if (date.isEmpty()) continue;
            float middle = (line.left() + line.right()) / 2;
            float dateMiddle = (date.get().left() + date.get().right()) / 2;
            if (dateMiddle < middle) first++; else last++;
        }
        return first > last ? "date-first" : last > first ? "date-last" : null;
    }

    /** Body font size, leading and the extra gap the source leaves between list entries. */
    static BodyStats bodyStats(List<Line> lines, float sectionTop) {
        var sizes = new HashMap<Float, Integer>();
        for (var line : lines) {
            if (line.y() <= sectionTop || line.size() <= 0 || compact(line.text()).length() < 4) continue;
            sizes.merge(quarter(line.size()), 1, Integer::sum);
        }
        if (sizes.isEmpty()) return new BodyStats(0, 0, 0);
        float body = sizes.entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow().getKey();
        var bodyLines = new ArrayList<Line>();
        var deltas = new ArrayList<Float>();
        var pitches = new ArrayList<Float>();
        Line previous = null;
        for (var line : lines) {
            if (line.y() <= sectionTop || quarter(line.size()) != body) continue;
            bodyLines.add(line);
            if (previous != null) {
                float delta = line.y() - previous.y();
                // Section breaks are several line heights tall; only paragraph rhythm is measured.
                if (delta > 0 && delta <= body * 1.75f) deltas.add(delta);
                if (delta > 0 && delta <= body * 2.6f) pitches.add(delta);
            }
            previous = line;
        }
        if (deltas.isEmpty() && pitches.isEmpty()) return new BodyStats(body, 0, 0);
        var wrapped = wrappedLeading(bodyLines, body);
        float leading;
        if (!wrapped.isEmpty()) {
            wrapped.sort(Float::compare);
            leading = wrapped.get(wrapped.size() / 2);
        } else if (!deltas.isEmpty()) {
            deltas.sort(Float::compare);
            leading = deltas.get(Math.max(0, deltas.size() / 4));
        } else {
            // Some sources set leading beyond 1.75em; the tight end of the pitches is
            // their line rhythm, while the wide end is the gap between list entries.
            pitches.sort(Float::compare);
            leading = pitches.get(Math.max(0, pitches.size() / 4));
        }
        int bulletGap = 0;
        if (pitches.size() >= 4) {
            pitches.sort(Float::compare);
            float linePitch = pitches.get(Math.max(0, pitches.size() / 5));
            float itemPitch = pitches.get(Math.min(pitches.size() - 1, pitches.size() * 4 / 5));
            bulletGap = Math.max(0, Math.min(24, Math.round((itemPitch - linePitch) * 4f / 3f)));
        }
        return new BodyStats(body, Math.round(leading / body * 100f) / 100f, bulletGap);
    }

    /** Line pitch measured only where a full line is followed by its wrapped continuation. */
    private static List<Float> wrappedLeading(List<Line> lines, float body) {
        if (lines.size() < 2) return List.of();
        var rights = lines.stream().map(Line::right).sorted().toList();
        float columnRight = rights.get(Math.min(rights.size() - 1, rights.size() * 9 / 10));
        var wrapped = new ArrayList<Float>();
        for (int i = 1; i < lines.size(); i++) {
            var previous = lines.get(i - 1);
            float delta = lines.get(i).y() - previous.y();
            if (delta <= 0 || delta > body * 1.75f) continue;
            if (previous.right() >= columnRight - 14f) wrapped.add(delta);
        }
        wrapped.sort(Float::compare);
        return wrapped;
    }

    /** How much larger a section title is than body text, as a CSS em multiplier. */
    static float titleScale(float titlePt, float bodyPt) {
        if (titlePt <= 0 || bodyPt <= 0) return 0;
        float scale = Math.round(titlePt / bodyPt * 100f) / 100f;
        return scale >= 1f && scale <= 2f ? scale : 0;
    }

    private static float quarter(float size) {
        return Math.round(size * 4f) / 4f;
    }

    /** Content margin taken from where the body text starts, in CSS pixels. */
    static Integer pageMargin(List<Line> lines) {
        float left = Float.MAX_VALUE;
        for (var line : lines) {
            if (compact(line.text()).length() < 2) continue;
            left = Math.min(left, line.left());
        }
        if (left == Float.MAX_VALUE) return null;
        int margin = Math.round(left * 4f / 3f);
        return margin >= 24 && margin <= 60 ? margin : null;
    }

    /** Where the source starts its entry heads, or {@code MAX_VALUE} when none has a date. */
    static float recordLeft(List<Line> lines, float sectionTop) {
        float left = Float.MAX_VALUE;
        for (var line : lines) {
            if (line.y() <= sectionTop || line.parts().size() < 2) continue;
            if (line.parts().stream().noneMatch(part -> DATE_RANGE.matcher(part.text()).find())) continue;
            left = Math.min(left, line.left());
        }
        return left;
    }

    /** Entries in the source can be indented from the page margin; keep that column. */
    static int recordIndent(List<Line> lines, float sectionTop, Integer marginPx) {
        return indentPx(recordLeft(lines, sectionTop), marginPx, 48);
    }

    private static int indentPx(float left, Integer marginPx, int max) {
        if (marginPx == null || left == Float.MAX_VALUE) return 0;
        float marginPt = marginPx * 3f / 4f;
        return (int) Math.max(0, Math.min(max, Math.round((left - marginPt) * 4f / 3f)));
    }

    /** A small square printed in the gutter beside each entry head, if the source has one. */
    static String recordMark(BufferedImage image, List<Line> lines, float sectionTop, Integer marginPx) {
        if (marginPx == null) return null;
        float headLeft = recordLeft(lines, sectionTop);
        if (headLeft == Float.MAX_VALUE) return null;
        float headY = 0, headSize = 0;
        for (var line : lines) {
            if (line.y() <= sectionTop || Math.abs(line.left() - headLeft) >= 0.5f) continue;
            if (line.parts().stream().noneMatch(part -> DATE_RANGE.matcher(part.text()).find())) continue;
            headY = line.y();
            headSize = line.size();
            break;
        }
        if (headSize <= 0) return null;
        int background = image.getRGB(2, 2);
        int from = Math.max(0, Math.round((marginPx * 3f / 4f) * SCALE) + 1);
        int to = Math.min(image.getWidth(), Math.round(headLeft * SCALE) - 1);
        int top = Math.max(0, Math.round((headY - headSize) * SCALE));
        int bottom = Math.min(image.getHeight(), Math.round(headY * SCALE));
        var counts = new HashMap<Integer, Integer>();
        for (int y = top; y < bottom; y++) {
            int run = 0;
            for (int x = from; x <= to; x++) {
                boolean ink = !near(image.getRGB(x, y), background);
                if (ink) { run++; continue; }
                // A square is a solid block; a divider line is only a pixel or two wide.
                if (run >= 6) {
                    for (int px = x - run; px < x; px++) counts.merge(image.getRGB(px, y), 1, Integer::sum);
                }
                run = 0;
            }
        }
        if (counts.isEmpty()) return null;
        var dominant = mostFrequent(counts);
        int total = counts.values().stream().mapToInt(Integer::intValue).sum();
        if (dominant.getValue() < total * 0.4 || distance(dominant.getKey(), background) < MIN_CONTRAST) return null;
        return hex(dominant.getKey());
    }

    /**
     * Paragraphs under a record head keep the source's own indent. Most sources narrow the whole
     * paragraph column, but some only push the first line in and wrap back to the margin; guessing
     * the wrong one costs a full indent of text width on every wrapped line.
     */
    static ParagraphIndent paragraphIndent(List<Line> lines, float sectionTop, Integer marginPx,
            float bodySize, BulletIndent bullets, Set<String> sectionTitles) {
        if (marginPx == null || bodySize <= 0) return new ParagraphIndent(0, 0, 0);
        float marginPt = marginPx * 3f / 4f;
        var body = paragraphLines(lines, sectionTop, bodySize, marginPt, bullets, sectionTitles);
        if (body.isEmpty()) return new ParagraphIndent(0, 0, 0);
        var lefts = body.stream().map(Line::left).toList();
        var indented = lefts.stream().filter(left -> left > marginPt + 1.5f).toList();
        if (lefts.stream().anyMatch(left -> left <= marginPt + 1.5f)) {
            // Text wraps back to the margin, so only the first line was pushed in.
            float first = indented.isEmpty() ? 0 : indented.stream().min(Float::compare).orElseThrow();
            return new ParagraphIndent(0, clamp(Math.round((first - marginPt) * 4f / 3f)), 0);
        }
        float block = indented.stream().min(Float::compare).orElse(marginPt);
        return new ParagraphIndent(clamp(Math.round((block - marginPt) * 4f / 3f)), 0, 0);
    }

    /**
     * The blank space the source leaves between two stacked paragraphs. Text lines inside one
     * paragraph sit on the line pitch; a new paragraph opens on a wider one.
     */
    static int paragraphGap(List<Line> lines, float sectionTop, Integer marginPx, float bodySize,
            BulletIndent bullets, Set<String> sectionTitles, float pitchPt) {
        if (marginPx == null || bodySize <= 0 || pitchPt <= 0) return 0;
        float marginPt = marginPx * 3f / 4f;
        var body = paragraphLines(lines, sectionTop, bodySize, marginPt, bullets, sectionTitles);
        if (body.size() < 2) return 0;
        var rights = body.stream().map(Line::right).sorted().toList();
        float columnRight = rights.get(Math.min(rights.size() - 1, rights.size() * 9 / 10));
        var gaps = new ArrayList<Float>();
        for (int i = 1; i < body.size(); i++) {
            var previous = body.get(i - 1);
            var current = body.get(i);
            // Only a line that ends short closes a paragraph; a full line is still wrapping.
            if (previous.right() >= columnRight - 14f) continue;
            float delta = current.y() - previous.y();
            if (delta <= pitchPt * 1.4f || delta >= pitchPt * 3.5f) continue;
            float extra = delta - pitchPt;
            // A whole blank line is already kept as an empty paragraph by the text import;
            // only a partial extra leading is the source's own paragraph spacing.
            if (extra >= pitchPt * 0.8f) continue;
            gaps.add(extra);
        }
        if (gaps.isEmpty()) return 0;
        gaps.sort(Float::compare);
        return clamp(Math.round(gaps.get(gaps.size() / 2) * 4f / 3f), 36);
    }

    /** Paragraph lines only: no list text, no record heads, no section titles. */
    private static List<Line> paragraphLines(List<Line> lines, float sectionTop, float bodySize,
            float marginPt, BulletIndent bullets, Set<String> sectionTitles) {
        float bulletTextPt = bullets == null ? -1 : marginPt + bullets.text() * 3f / 4f;
        var body = new ArrayList<Line>();
        for (var line : lines) {
            if (line.y() <= sectionTop || line.size() <= 0 || quarter(line.size()) != quarter(bodySize)) continue;
            if (line.parts().isEmpty()) continue;
            // Some sources print section titles at body size; they are not paragraphs.
            if (sectionTitles.contains(compact(line.text()))) continue;
            if (line.parts().stream().anyMatch(part -> DATE_RANGE.matcher(part.text()).find())) continue;
            if (isListMark(compact(line.parts().get(0).text()))) continue;
            // Wrapped list text sits in the list column, not in the paragraph column.
            if (bulletTextPt > 0 && Math.abs(line.left() - bulletTextPt) <= 2f) continue;
            body.add(line);
        }
        return body;
    }

    /** How far the source hangs its list marks and list text from the content margin. */
    static BulletIndent bulletIndents(List<Line> lines, Integer marginPx, float sectionTop) {
        if (marginPx == null) return null;
        float marginPt = marginPx * 3f / 4f;
        for (var line : lines) {
            // Header meta rows also print "·" between fields; only body rows start with a mark.
            if (line.y() <= sectionTop || line.parts().size() < 2) continue;
            var mark = line.parts().get(0);
            if (!isListMark(compact(mark.text())) || mark.left() <= marginPt) continue;
            float textPt = line.parts().get(1).left();
            if (textPt <= mark.left() + 1f) continue;
            return new BulletIndent(clamp(Math.round((mark.left() - marginPt) * 4f / 3f)),
                    clamp(Math.round((textPt - marginPt) * 4f / 3f)));
        }
        return null;
    }

    private static boolean isListMark(String text) {
        if (text.isEmpty() || text.length() > 3) return false;
        if ("·•▪◦●○-*".indexOf(text.charAt(0)) >= 0) return true;
        return text.matches("\\d{1,2}[.、)）]");
    }

    private static int clamp(long value) {
        return clamp(value, 80);
    }

    private static int clamp(long value, int max) {
        return (int) Math.max(0, Math.min(max, value));
    }

    private record ColorShare(String color, double share) {}

    private static ColorShare dominantColor(BufferedImage image, int x, int y, int width, int height,
            int background, boolean column) {
        var counts = new HashMap<Integer, Integer>();
        int total = 0;
        int end = column ? image.getHeight() : Math.min(image.getWidth(), x + width);
        for (int cursor = column ? 0 : x; cursor < end; cursor++) {
            int rgb = column ? image.getRGB(x, cursor) : image.getRGB(cursor, y);
            if (near(rgb, background)) continue;
            counts.merge(rgb, 1, Integer::sum);
            total++;
        }
        if (total == 0) return null;
        var dominant = mostFrequent(counts);
        return new ColorShare(hex(dominant.getKey()), dominant.getValue() / (double) total);
    }

    private static Map.Entry<Integer, Integer> mostFrequent(Map<Integer, Integer> counts) {
        return counts.entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow();
    }

    private static int distance(int rgb, int background) {
        return Math.abs(((rgb >> 16) & 0xFF) - ((background >> 16) & 0xFF))
                + Math.abs(((rgb >> 8) & 0xFF) - ((background >> 8) & 0xFF))
                + Math.abs((rgb & 0xFF) - (background & 0xFF));
    }

    /** Anti-aliased edges differ from the page colour by a few levels; treat those as background. */
    private static boolean near(int rgb, int background) {
        return distance(rgb, background) < 24;
    }

    private static String hex(int rgb) {
        return String.format(Locale.ROOT, "#%06x", rgb & 0xFFFFFF);
    }

    private List<Line> firstPageLines(PDDocument pdf) throws IOException {
        return pageLines(pdf, 1);
    }

    private List<Line> pageLines(PDDocument pdf, int page) throws IOException {
        var fragments = new ArrayList<Fragment>();
        var stripper = new PDFTextStripper() {
            @Override protected void writeString(String text, List<TextPosition> positions) {
                if (positions.isEmpty() || text.isBlank()) return;
                float left = Float.MAX_VALUE, right = 0, size = 0;
                for (var position : positions) {
                    left = Math.min(left, position.getXDirAdj());
                    right = Math.max(right, position.getXDirAdj() + position.getWidthDirAdj());
                    // getFontSizeInPt stays in text space; the text matrix carries the page scale,
                    // so this is the size a reader actually sees on the page.
                    size = Math.max(size, position.getTextMatrix().getScalingFactorY());
                }
                fragments.add(new Fragment(positions.get(0).getYDirAdj(), left, right, text.strip(), size));
            }
        };
        stripper.setSortByPosition(true);
        stripper.setStartPage(page);
        stripper.setEndPage(page);
        stripper.getText(pdf);

        fragments.sort(java.util.Comparator.comparingDouble(Fragment::y).thenComparingDouble(Fragment::left));
        var lines = new ArrayList<Line>();
        var parts = new ArrayList<Fragment>();
        float lineY = 0, left = Float.MAX_VALUE, right = 0, size = 0;
        for (var fragment : fragments) {
            if (!parts.isEmpty() && Math.abs(fragment.y() - lineY) > 3f) {
                lines.add(line(parts, lineY, left, right, size));
                parts.clear();
                left = Float.MAX_VALUE;
                right = 0;
                size = 0;
            }
            if (parts.isEmpty()) lineY = fragment.y();
            parts.add(fragment);
            left = Math.min(left, fragment.left());
            right = Math.max(right, fragment.right());
            size = Math.max(size, fragment.size());
        }
        if (!parts.isEmpty()) lines.add(line(parts, lineY, left, right, size));
        return lines;
    }

    private static Line line(List<Fragment> parts, float y, float left, float right, float size) {
        var text = new StringBuilder();
        for (var part : parts) text.append(part.text());
        return new Line(text.toString(), left, right, null, y, size, List.copyOf(parts));
    }

    /**
     * Size of the run that carries most of the line's characters. Icons and other
     * decorations can sit on the line at a larger size, and taking the maximum would
     * report the icon's size as the text size.
     */
    static float dominantSize(Line line) {
        float best = line.size();
        int mostChars = 0;
        for (var part : line.parts()) {
            int chars = compact(part.text()).length();
            if (chars > mostChars) {
                mostChars = chars;
                best = part.size();
            }
        }
        return best;
    }

    private static String compact(String text) {
        return text.replaceAll("[\\s\\u3000]+", "");
    }
}
