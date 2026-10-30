package com.resumedo.importing;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.zip.ZipFile;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.PDContentStream;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNumber;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.springframework.stereotype.Component;

/**
 * Best-effort detection of the source document's accent colour, used to keep an imported
 * resume visually close to the file it came from. Never throws: an unknown accent simply
 * falls back to the neutral catalogue template.
 */
@Component
public class ImportStyleDetector {
    private static final Pattern DOCX_ACCENT = Pattern.compile(
            "<a:accent1>.*?<a:srgbClr val=\"([0-9a-fA-F]{6})\"", Pattern.DOTALL);
    private static final int MAX_PAGES = 3;
    private static final int MAX_DEPTH = 6;

    /** Returns {@code #rrggbb}, or null when the file exposes no usable colour. */
    public String accent(Path path, String extension) {
        try {
            if ("pdf".equalsIgnoreCase(extension)) return pdfAccent(path);
            if ("docx".equalsIgnoreCase(extension)) return docxAccent(path);
        } catch (IOException | RuntimeException ignored) {
            // Style is a nicety; text extraction and editing must still succeed.
        }
        return null;
    }

    private String pdfAccent(Path path) throws IOException {
        try (PDDocument pdf = Loader.loadPDF(path.toFile())) {
            var weights = new HashMap<Integer, Integer>();
            var visited = new HashSet<COSBase>();
            for (int index = 0; index < Math.min(pdf.getNumberOfPages(), MAX_PAGES); index++) {
                PDPage page = pdf.getPage(index);
                scan(page, page.getResources(), weights, visited, 0);
            }
            int best = -1, bestWeight = 0;
            for (var entry : weights.entrySet()) {
                if (entry.getValue() > bestWeight) { best = entry.getKey(); bestWeight = entry.getValue(); }
            }
            return best < 0 ? null : String.format(Locale.ROOT, "#%06x", best);
        }
    }

    private void scan(PDContentStream content, PDResources resources, Map<Integer, Integer> weights, Set<COSBase> visited, int depth) throws IOException {
        if (content == null || depth > MAX_DEPTH) return;
        var parser = new PDFStreamParser(content);
        var tokens = parser.parse();
        float[] fill = null;
        var operands = new ArrayList<Object>();
        for (Object token : tokens) {
            if (!(token instanceof Operator operator)) { operands.add(token); continue; }
            switch (operator.getName()) {
                case "rg" -> fill = rgb(operands);
                case "g" -> fill = gray(operands);
                case "k" -> fill = cmyk(operands);
                case "sc", "scn" -> fill = componentColor(operands);
                case "Tj", "TJ", "'", "\"" -> registerText(operands, fill, weights);
                case "Do" -> {
                    var target = form(operands, resources);
                    if (target != null && visited.add(target.getCOSObject())) scan(target, target.getResources(), weights, visited, depth + 1);
                }
                default -> { }
            }
            operands.clear();
        }
    }

    private PDFormXObject form(ArrayList<Object> operands, PDResources resources) {
        if (resources == null || operands.size() != 1 || !(operands.get(0) instanceof COSName name)) return null;
        try {
            return resources.getXObject(name) instanceof PDFormXObject form ? form : null;
        } catch (IOException | RuntimeException ignored) {
            return null;
        }
    }

    private void registerText(ArrayList<Object> operands, float[] fill, Map<Integer, Integer> weights) {
        if (fill == null) return;
        int length = 0;
        for (Object operand : operands) {
            if (operand instanceof COSString string) length += string.getString().strip().length();
            else if (operand instanceof COSArray array) {
                for (var element : array) {
                    if (element instanceof COSString string) length += string.getString().strip().length();
                }
            }
        }
        if (length == 0) return;
        int red = channel(fill[0]), green = channel(fill[1]), blue = channel(fill[2]);
        int max = Math.max(red, Math.max(green, blue)), min = Math.min(red, Math.min(green, blue));
        int luma = (299 * red + 587 * green + 114 * blue) / 1000;
        // Photos, rules and shaded blocks rarely reach text operators, so only colours
        // that actually paint glyphs compete; near-grayscale text keeps the neutral skin.
        if (max - min < 30 || luma < 70 || luma > 225) return;
        weights.merge((red << 16) | (green << 8) | blue, length, Integer::sum);
    }

    private float[] rgb(ArrayList<Object> operands) {
        return operands.size() >= 3 ? new float[]{number(operands, 0), number(operands, 1), number(operands, 2)} : null;
    }

    private float[] gray(ArrayList<Object> operands) {
        if (operands.size() < 1) return null;
        float value = number(operands, 0);
        return new float[]{value, value, value};
    }

    private float[] cmyk(ArrayList<Object> operands) {
        if (operands.size() < 4) return null;
        float c = number(operands, 0), m = number(operands, 1), y = number(operands, 2), k = number(operands, 3);
        return new float[]{(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)};
    }

    private float[] componentColor(ArrayList<Object> operands) {
        int size = operands.size();
        if (size == 3) return rgb(operands);
        if (size == 4) return cmyk(operands);
        if (size == 1) return gray(operands);
        return null;
    }

    private float number(ArrayList<Object> operands, int index) {
        return operands.get(index) instanceof COSNumber value ? Math.max(0, Math.min(1, value.floatValue())) : 0;
    }

    private int channel(float value) {
        return Math.round(Math.max(0, Math.min(1, value)) * 255);
    }

    private String docxAccent(Path path) throws IOException {
        try (var zip = new ZipFile(path.toFile())) {
            var entry = zip.getEntry("word/theme/theme1.xml");
            if (entry == null) return null;
            String xml;
            try (var stream = zip.getInputStream(entry)) {
                xml = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            }
            var matcher = DOCX_ACCENT.matcher(xml);
            return matcher.find() ? "#" + matcher.group(1).toLowerCase(Locale.ROOT) : null;
        }
    }
}
