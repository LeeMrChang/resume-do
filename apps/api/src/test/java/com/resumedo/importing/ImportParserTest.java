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
