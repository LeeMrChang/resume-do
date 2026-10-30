package com.resumedo.importing;

import com.resumedo.common.ApiException;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import javax.xml.stream.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

@Component
public class ImportParser {
    public static final long MAX_BYTES = 20L * 1024 * 1024;
    public static final int MAX_TEXT = 100_000;
    public record Parsed(String text, String warning) {}

    public String extension(String filename) {
        String lower = filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf")) return "pdf";
        if (lower.endsWith(".docx")) return "docx";
        throw error("UNSUPPORTED_FORMAT", "仅支持 PDF 和 DOCX；旧版 .doc 请另存为 .docx 后重试");
    }

    public Parsed parse(Path file, String extension) {
        try {
            byte[] magic;
            try (var in = Files.newInputStream(file)) { magic = in.readNBytes(8); }
            if (extension.equals("pdf")) {
                if (magic.length < 5 || !new String(magic, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-"))
                    throw error("INVALID_FILE", "文件内容不是有效 PDF，不能仅修改扩展名");
                return pdf(file);
            }
            if (magic.length >= 4 && magic[0] == (byte) 0xd0 && magic[1] == (byte) 0xcf)
                throw error("PROTECTED_FILE", "文件可能受密码保护或是旧版 Word，请解密并另存为 DOCX");
            if (magic.length < 4 || magic[0] != 'P' || magic[1] != 'K' || magic[2] != 3 || magic[3] != 4)
                throw error("INVALID_FILE", "文件内容不是有效 DOCX，不能仅修改扩展名");
            return docx(file);
        } catch (ApiException e) { throw e; }
        catch (InvalidPasswordException e) { throw error("PROTECTED_FILE", "PDF 受密码保护，请解密后重新上传"); }
        catch (Exception e) { throw error("DAMAGED_FILE", "文件损坏或无法读取，请检查原文件后重试"); }
    }

    private Parsed pdf(Path file) throws IOException {
        try (var document = Loader.loadPDF(file.toFile(), () -> new org.apache.pdfbox.io.ScratchFile(org.apache.pdfbox.io.MemoryUsageSetting.setupMixed(8L * 1024 * 1024, 64L * 1024 * 1024)))) {
            if (document.isEncrypted()) throw error("PROTECTED_FILE", "PDF 受密码保护，请解密后重新上传");
            if (document.getNumberOfPages() > 100) throw error("RESOURCE_LIMIT", "PDF 超过 100 页，请拆分后导入");
            if (!document.getCurrentAccessPermission().canExtractContent())
                throw error("PROTECTED_FILE", "PDF 不允许提取文字，请提供可读取的文件");
            var text = new StringBuilder();
            int emptyPages = 0;
            var stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            stripper.setWordSeparator("  ");
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                interrupted();
                stripper.setStartPage(page); stripper.setEndPage(page);
                var output = new Writer() {
                    @Override public void write(char[] chars, int offset, int length) {
                        interrupted();
                        if (text.length() + length > MAX_TEXT) throw error("TEXT_LIMIT", "提取文字超过 100000 字，请拆分后导入");
                        text.append(chars, offset, length);
                    }
                    @Override public void flush() {}
                    @Override public void close() {}
                };
                int before = text.length();
                try {
                    stripper.writeText(document, output);
                } catch (IOException failure) {
                    if (!text.toString().isBlank()) return new Parsed(text.toString(),
                        "部分 PDF 页面读取失败，已保留可读取文字。请下载原文件核对缺失内容，重试或在编辑器手动补全。");
                    throw failure;
                }
                if (text.substring(before).isBlank()) emptyPages++;
            }
            if (text.toString().isBlank()) throw error("SCANNED_PDF", "扫描版或无可提取文字的 PDF 暂不支持，可手动创建简历");
            return new Parsed(text.toString(), emptyPages > 0 ? "部分页面没有文字层，可能包含扫描内容，请核对原文件，手动补全。" : "PDF 多栏阅读顺序可能有差异，请核对编辑内容。");
        }
    }

    private Parsed docx(Path file) throws IOException, XMLStreamException {
        var parts = new LinkedHashMap<String, byte[]>();
        var names = new HashSet<String>();
        long total = 0;
        try (var zip = new ZipInputStream(Files.newInputStream(file))) {
            ZipEntry entry;
            int count = 0;
            while ((entry = zip.getNextEntry()) != null) {
                interrupted();
                String name = entry.getName();
                if (++count > 512 || !names.add(name)) throw error("UNSAFE_ARCHIVE", "DOCX 压缩包条目过多或重复");
                String lower = name.toLowerCase(Locale.ROOT);
                if (lower.contains("vbaproject") || lower.contains("activex/") || lower.contains("embeddings/"))
                    throw error("UNSAFE_ARCHIVE", "首期不支持包含宏、活动控件或嵌入对象的 Word 文件");
                var output = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int size = 0, read;
                while ((read = zip.read(buffer)) != -1) {
                    interrupted();
                    size += read; total += read;
                    if (size > 10 * 1024 * 1024 || total > 50L * 1024 * 1024)
                        throw error("UNSAFE_ARCHIVE", "DOCX 解压内容超过安全上限，请精简图片或拆分文件");
                    if (name.equals("[Content_Types].xml") || name.matches("word/(document|header\\d+|footer\\d+|footnotes|endnotes)\\.xml"))
                        output.write(buffer, 0, read);
                }
                if (output.size() > 0) parts.put(name, output.toByteArray());
            }
        }
        if (!parts.containsKey("word/document.xml") || !parts.containsKey("[Content_Types].xml"))
            throw error("INVALID_FILE", "压缩包不是 DOCX 文档");
        String contentTypes = new String(parts.get("[Content_Types].xml"), StandardCharsets.UTF_8);
        if (!contentTypes.contains("wordprocessingml.document.main+xml") || contentTypes.contains("macroEnabled"))
            throw error("UNSAFE_ARCHIVE", "Word 文档类型不受支持或包含宏");
        var text = new StringBuilder();
        try {
            appendXml(text, parts.remove("word/document.xml"));
            for (var part : parts.entrySet()) if (!part.getKey().equals("[Content_Types].xml")) appendXml(text, part.getValue());
        } catch (XMLStreamException failure) {
            if (!text.toString().isBlank()) return new Parsed(text.toString(),
                "部分 Word 内容损坏，已保留可读取文字。请下载原文件核对缺失内容，重试或在编辑器手动补全。");
            throw failure;
        }
        if (text.toString().isBlank()) throw error("NO_TEXT", "Word 文件没有可提取的正文，请手动创建或提供文字版文件");
        return new Parsed(text.toString(), "已提取文字并尝试提取内嵌照片，不复刻图形或原版式。请对照原件核对表格和经历顺序。");
    }

    private void appendXml(StringBuilder text, byte[] bytes) throws XMLStreamException {
        XMLInputFactory factory = XMLInputFactory.newFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty("javax.xml.stream.isSupportingExternalEntities", false);
        factory.setXMLResolver((publicID, systemID, baseURI, namespace) -> { throw new XMLStreamException("External entities disabled"); });
        XMLStreamReader reader = factory.createXMLStreamReader(new ByteArrayInputStream(bytes));
        boolean inText = false;
        try {
            while (reader.hasNext()) {
                interrupted();
                int event = reader.next();
                if (event == XMLStreamConstants.DTD || event == XMLStreamConstants.ENTITY_REFERENCE)
                    throw error("UNSAFE_XML", "DOCX 包含不支持的 XML 实体或 DTD");
                if (event == XMLStreamConstants.START_ELEMENT) {
                    String name = reader.getLocalName();
                    if (name.equals("t")) inText = true;
                    if (name.equals("tab")) text.append('\t');
                    if (name.equals("br") || name.equals("cr")) text.append('\n');
                } else if (event == XMLStreamConstants.END_ELEMENT) {
                    String name = reader.getLocalName();
                    if (name.equals("t")) inText = false;
                    if (name.equals("p")) text.append('\n');
                } else if (event == XMLStreamConstants.CHARACTERS && inText) text.append(reader.getText());
                if (text.length() > MAX_TEXT) throw error("TEXT_LIMIT", "提取文字超过 100000 字，请拆分后导入");
            }
        } finally { reader.close(); }
    }

    private static void interrupted() {
        if (Thread.currentThread().isInterrupted()) throw error("PARSE_TIMEOUT", "解析已超时，请重试或手动整理");
    }
    public static ApiException error(String code, String message) {
        return new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, code, message, Map.of());
    }
}
