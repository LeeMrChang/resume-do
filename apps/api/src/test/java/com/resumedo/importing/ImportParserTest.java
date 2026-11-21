package com.resumedo.importing;

import static org.assertj.core.api.Assertions.*;
import com.resumedo.common.ApiException;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.zip.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.*;
import org.apache.pdfbox.pdmodel.encryption.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ImportParserTest {
    @TempDir Path directory;
    private final ImportParser parser = new ImportParser();
    static final String TYPES = "<Types><Override ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'/></Types>";
    Path docx(String xml, String extra, int bytes) throws IOException {
        Path file = directory.resolve(java.util.UUID.randomUUID() + ".docx");
        try (var zip = new ZipOutputStream(Files.newOutputStream(file))) {
            put(zip, "[Content_Types].xml", TYPES.getBytes(StandardCharsets.UTF_8));
            put(zip, "word/document.xml", xml.getBytes(StandardCharsets.UTF_8));
            if (extra != null) put(zip, extra, new byte[bytes]);
        }
        return file;
    }
    void put(ZipOutputStream zip, String name, byte[] bytes) throws IOException {
        zip.putNextEntry(new ZipEntry(name)); zip.write(bytes); zip.closeEntry();
    }
    void rejects(Path path, String ext, String code) {
        assertThatThrownBy(() -> parser.parse(path, ext)).isInstanceOf(ApiException.class)
            .satisfies(error -> assertThat(((ApiException) error).code()).isEqualTo(code));
    }
    @Test void extractsDocxParagraphsAndTablesInOrder() throws Exception {
        Path file = docx("<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'><w:body><w:p><w:r><w:t>姓名：张三</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>甲公司</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>乙公司</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>", null, 0);
        assertThat(parser.parse(file, "docx").text()).isEqualTo("姓名：张三\n甲公司\n乙公司\n");
    }

    @Test void unknownDocxHeadingKeepsABoundaryEvenWhenItsNameHasNoKnownSuffix() throws Exception {
        Path file = docx("<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'><w:body>"
                + "<w:p><w:r><w:t>工作经历</w:t></w:r></w:p>"
                + "<w:p><w:r><w:t>示例公司 2020.01-2021.01</w:t></w:r></w:p>"
                + "<w:p><w:r><w:t>负责服务。</w:t></w:r></w:p>"
                + "<w:p><w:pPr><w:pStyle w:val='Heading2'/></w:pPr><w:r><w:t>我的另一面</w:t></w:r></w:p>"
                + "<w:p><w:r><w:t>邮箱：keep@example.invalid</w:t></w:r></w:p>"
                + "<w:p><w:r><w:t>第一行未结束</w:t></w:r></w:p>"
                + "<w:p><w:r><w:t>第二行也保留</w:t></w:r></w:p>"
                + "<w:p><w:r><w:t>技术实践</w:t></w:r></w:p>"
                + "<w:p><w:r><w:t>部署实践。</w:t></w:r></w:p></w:body></w:document>", null, 0);
        var parsed = parser.parse(file, "docx");
        assertThat(parsed.headings()).contains("我的另一面");
        var draft = new ImportMapper(new com.fasterxml.jackson.databind.ObjectMapper()).draft(parsed, "example.docx", null);
        var sections = draft.path("document").path("sections");
        assertThat(sections.get(0).path("items").toString()).contains("负责服务").doesNotContain("我的另一面", "keep@example");
        var pending = sections.get(sections.size()-1);
        assertThat(pending.path("title").asText()).isEqualTo("待整理内容");
        assertThat(pending.path("items").toString()).contains("<p>我的另一面</p>", "<p>第一行未结束</p>", "<p>第二行也保留</p>", "邮箱：keep@example.invalid");
    }

    @Test void pdfHeadingFontSizeCreatesABoundaryWithoutMarkingShortBodyLines() throws Exception {
        Path file = directory.resolve("headings.pdf");
        try (var document = new PDDocument()) {
            var page = new PDPage(); document.addPage(page);
            try (var out = new PDPageContentStream(document, page)) {
                out.beginText(); out.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 14);
                out.newLineAtOffset(30, 750); out.showText("Portfolio"); out.endText();
                out.beginText(); out.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                out.newLineAtOffset(30, 725); out.showText("Maintained services and completed delivery.");
                out.newLineAtOffset(0, -20); out.showText("Java"); out.endText();
            }
            document.save(file.toFile());
        }
        var parsed = parser.parse(file, "pdf");
        assertThat(parsed.headings()).containsExactly("Portfolio");
        assertThat(parsed.text()).contains("Portfolio", "Maintained services", "Java");
    }

    @Test void pdfWithAnUnnamedType3FontStillImports() throws Exception {
        Path file = directory.resolve("unnamed-font.pdf");
        try (var document = new PDDocument()) {
            var page = new PDPage(); document.addPage(page);
            var font = new org.apache.pdfbox.cos.COSDictionary();
            font.setItem(org.apache.pdfbox.cos.COSName.TYPE, org.apache.pdfbox.cos.COSName.FONT);
            font.setItem(org.apache.pdfbox.cos.COSName.SUBTYPE, org.apache.pdfbox.cos.COSName.TYPE3);
            font.setItem(org.apache.pdfbox.cos.COSName.FONT_BBOX, new org.apache.pdfbox.pdmodel.common.PDRectangle(0, 0, 600, 700));
            var matrix = new org.apache.pdfbox.cos.COSArray();
            for (float value : new float[] { .001f, 0, 0, .001f, 0, 0 }) matrix.add(new org.apache.pdfbox.cos.COSFloat(value));
            font.setItem(org.apache.pdfbox.cos.COSName.FONT_MATRIX, matrix);
            font.setInt(org.apache.pdfbox.cos.COSName.FIRST_CHAR, 65); font.setInt(org.apache.pdfbox.cos.COSName.LAST_CHAR, 68);
            var widths = new org.apache.pdfbox.cos.COSArray();
            for (int i = 0; i < 4; i++) widths.add(org.apache.pdfbox.cos.COSInteger.get(600));
            font.setItem(org.apache.pdfbox.cos.COSName.WIDTHS, widths);
            var encoding = new org.apache.pdfbox.cos.COSDictionary();
            var differences = new org.apache.pdfbox.cos.COSArray(); differences.add(org.apache.pdfbox.cos.COSInteger.get(65));
            for (String name : new String[] {"uni6280", "uni672F", "uni5B9E", "uni8DF5"})
                differences.add(org.apache.pdfbox.cos.COSName.getPDFName(name));
            encoding.setItem(org.apache.pdfbox.cos.COSName.DIFFERENCES, differences);
            font.setItem(org.apache.pdfbox.cos.COSName.ENCODING, encoding);
            var glyph = new org.apache.pdfbox.pdmodel.common.PDStream(document);
            try (var stream = glyph.createOutputStream()) { stream.write("600 0 d0".getBytes(StandardCharsets.US_ASCII)); }
            var procedures = new org.apache.pdfbox.cos.COSDictionary();
            for (String name : new String[] {"uni6280", "uni672F", "uni5B9E", "uni8DF5"})
                procedures.setItem(org.apache.pdfbox.cos.COSName.getPDFName(name), glyph);
            font.setItem(org.apache.pdfbox.cos.COSName.CHAR_PROCS, procedures);
            var type3 = new PDType3Font(font);
            page.setResources(new PDResources());
            var resource = page.getResources().add(type3);
            try (var out = new PDPageContentStream(document, page)) {
                out.appendRawCommands("BT /" + resource.getName() + " 12 Tf 30 700 Td <41424344> Tj ET\n");
            }
            document.save(file.toFile());
        }
        assertThat(parser.parse(file, "pdf").text()).contains("技术实践");
    }
    @Test void rejectsSpoofedExtensionLegacyDocAndUnsafeXml() throws Exception {
        Path fake = directory.resolve("fake.pdf"); Files.writeString(fake, "not pdf");
        rejects(fake, "pdf", "INVALID_FILE");
        assertThatThrownBy(() -> parser.extension("resume.doc")).hasMessageContaining("另存");
        Path xml = docx("<!DOCTYPE x [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><document><p><t>&x;</t></p></document>", null, 0);
        rejects(xml, "docx", "UNSAFE_XML");
    }
    @Test void rejectsMacroAndZipBomb() throws Exception {
        rejects(docx("<document/>", "word/vbaProject.bin", 1), "docx", "UNSAFE_ARCHIVE");
        rejects(docx("<document/>", "word/media/bomb", 11 * 1024 * 1024), "docx", "UNSAFE_ARCHIVE");
    }
    @Test void rejectsEmptyAndMalformedWordWithoutCreatingPartialSuccess() throws Exception {
        rejects(docx("<document/>", null, 0), "docx", "NO_TEXT");
        rejects(docx("<not closed", null, 0), "docx", "DAMAGED_FILE");
    }
    @Test void partialDamagePreservesRecoveredTextAndAnExplicitWarning() throws Exception {
        Path file = docx("<document><p><t>已识别内容</t></p><broken", null, 0);
        var result = parser.parse(file, "docx");
        assertThat(result.text()).contains("已识别内容");
        assertThat(result.warning()).contains("部分", "损坏", "原文件");
    }
    @Test void extractsPdfTextAndRejectsScannedOrProtectedPdf() throws Exception {
        Path text = directory.resolve("text.pdf");
        try (var document = new PDDocument()) {
            var page = new PDPage(); document.addPage(page);
            try (var out = new PDPageContentStream(document, page)) {
                out.beginText(); out.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                out.newLineAtOffset(30, 700); out.showText("Resume text 2020-2024"); out.endText();
            }
            document.save(text.toFile());
        }
        assertThat(parser.parse(text, "pdf").text()).contains("Resume text 2020-2024");
        Path scanned = directory.resolve("scan.pdf");
        try (var document = new PDDocument()) { document.addPage(new PDPage()); document.save(scanned.toFile()); }
        rejects(scanned, "pdf", "SCANNED_PDF");
        Path protectedFile = directory.resolve("protected.pdf");
        try (var document = new PDDocument()) {
            document.addPage(new PDPage()); document.protect(new StandardProtectionPolicy("owner", "secret", new AccessPermission()));
            document.save(protectedFile.toFile());
        }
        rejects(protectedFile, "pdf", "PROTECTED_FILE");
    }
}
