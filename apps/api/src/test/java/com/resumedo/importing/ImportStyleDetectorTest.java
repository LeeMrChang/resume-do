package com.resumedo.importing;

import static org.assertj.core.api.Assertions.assertThat;
import java.awt.Color;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.zip.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ImportStyleDetectorTest {
    private final ImportStyleDetector detector = new ImportStyleDetector();
    @TempDir Path dir;

    @Test void picksRepeatedAccentTextOverOneLargePhotoColourBlock() throws Exception {
        Path pdf = dir.resolve("photo.pdf");
        try (var doc = new PDDocument()) {
            var page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (var content = new PDPageContentStream(doc, page)) {
                // A single, much larger skin-toned block stands in for a photo.
                content.setNonStrokingColor(new Color(0xe5, 0xb7, 0xa7));
                content.addRect(40, 640, 120, 150);
                content.fill();
                content.setNonStrokingColor(new Color(0x33, 0xaa, 0x66));
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 14);
                for (int line = 0; line < 16; line++) {
                    content.beginText();
                    content.newLineAtOffset(40, 620 - line * 30);
                    content.showText("Resume Section Title Accent");
                    content.endText();
                }
            }
            doc.save(pdf.toFile());
        }
        assertThat(detector.accent(pdf, "pdf")).isEqualTo("#33aa66");
    }

    @Test void ignoresGrayscalePages() throws Exception {
        Path pdf = dir.resolve("gray.pdf");
        try (var doc = new PDDocument()) {
            var page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (var content = new PDPageContentStream(doc, page)) {
                content.setNonStrokingColor(Color.DARK_GRAY);
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 14);
                content.beginText();
                content.newLineAtOffset(40, 700);
                content.showText("Plain grayscale resume text");
                content.endText();
            }
            doc.save(pdf.toFile());
        }
        assertThat(detector.accent(pdf, "pdf")).isNull();
    }

    @Test void readsDocxThemeAccentAsFallback() throws Exception {
        Path docx = dir.resolve("theme.docx");
        try (var zip = new ZipOutputStream(Files.newOutputStream(docx))) {
            zip.putNextEntry(new ZipEntry("word/document.xml"));
            zip.write("<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"/>".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("word/theme/theme1.xml"));
            zip.write(("<a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><a:themeElements><a:clrScheme>"
                    + "<a:accent1><a:srgbClr val=\"2F6FB0\"/></a:accent1></a:clrScheme></a:themeElements></a:theme>")
                    .getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        assertThat(detector.accent(docx, "docx")).isEqualTo("#2f6fb0");
    }

    @Test void returnsNullWhenDocxHasNoColourInformation() throws Exception {
        Path docx = dir.resolve("plain.docx");
        try (var zip = new ZipOutputStream(Files.newOutputStream(docx))) {
            zip.putNextEntry(new ZipEntry("word/document.xml"));
            zip.write("<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"/>".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        assertThat(detector.accent(docx, "docx")).isNull();
    }
}
