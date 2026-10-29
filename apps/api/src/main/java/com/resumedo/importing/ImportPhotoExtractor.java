package com.resumedo.importing;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.Path;
import java.util.*;
import java.util.zip.ZipFile;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.stereotype.Component;

/** Best-effort embedded photo extraction, exclusively local; never follows external links. */
@Component
public class ImportPhotoExtractor {
    private static final long MAX_PIXELS=20_000_000;
    private static final class Candidate { BufferedImage image; long area; int visited; }
    public String extract(Path path,String extension) {
        try {
            Candidate best=new Candidate();
            if(extension.equals("pdf")) {
                try(var pdf=Loader.loadPDF(path.toFile())) {
                    var seen=Collections.newSetFromMap(new IdentityHashMap<Object,Boolean>());
                    for(var page:pdf.getPages()) inspect(page.getResources(),best,seen,0);
                }
            } else {
                try(var zip=new ZipFile(path.toFile())) {
                    var entries=zip.entries(); int count=0;
                    while(entries.hasMoreElements() && count++<512) {
                        var entry=entries.nextElement();
                        if(!entry.getName().startsWith("word/media/") || entry.getSize()<1 || entry.getSize()>10_000_000) continue;
                        try(var in=zip.getInputStream(entry)) { consider(readImage(in),best); }
                    }
                }
            }
            if(best.image==null) return "";
            BufferedImage source=best.image;
            double scale=Math.min(1,480d/Math.max(source.getWidth(),source.getHeight()));
            var small=new BufferedImage(Math.max(1,(int)(source.getWidth()*scale)),Math.max(1,(int)(source.getHeight()*scale)),BufferedImage.TYPE_INT_RGB);
            var g=small.createGraphics();
            try { g.setColor(Color.WHITE);g.fillRect(0,0,small.getWidth(),small.getHeight());g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);g.drawImage(source,0,0,small.getWidth(),small.getHeight(),null); }
            finally { g.dispose(); }
            var out=new ByteArrayOutputStream(); ImageIO.write(small,"jpeg",out);
            String data="data:image/jpeg;base64,"+Base64.getEncoder().encodeToString(out.toByteArray());
            return data.length()<=400_000?data:"";
        } catch(Exception e) { return ""; } // A photo failure must never discard the imported text.
    }
    private BufferedImage readImage(InputStream in) throws IOException {
        try(var stream=ImageIO.createImageInputStream(in)) {
            var readers=ImageIO.getImageReaders(stream); if(!readers.hasNext()) return null;
            var reader=readers.next();
            try { reader.setInput(stream); long pixels=(long)reader.getWidth(0)*reader.getHeight(0); return pixels<=MAX_PIXELS?reader.read(0):null; }
            finally { reader.dispose(); }
        }
    }
    private void inspect(PDResources resources,Candidate best,Set<Object> seen,int depth) throws IOException {
        if(resources==null || depth>8 || !seen.add(resources.getCOSObject())) return;
        for(var name:resources.getXObjectNames()) {
            if(++best.visited>256) return;
            try {
                var object=resources.getXObject(name);
                if(object instanceof PDImageXObject image) {
                    long area=(long)image.getWidth()*image.getHeight();
                    if(area>best.area && area<=MAX_PIXELS && image.getWidth()>=40 && image.getHeight()>=40) consider(image.getImage(),best);
                } else if(object instanceof PDFormXObject form) inspect(form.getResources(),best,seen,depth+1);
            } catch(IOException | RuntimeException ignored) { /* Try the next embedded image. */ }
        }
    }
    private void consider(BufferedImage image,Candidate best) {
        if(image==null || image.getWidth()<40 || image.getHeight()<40) return;
        long area=(long)image.getWidth()*image.getHeight();
        if(area>best.area && area<=MAX_PIXELS) { best.image=image;best.area=area; }
    }
}
