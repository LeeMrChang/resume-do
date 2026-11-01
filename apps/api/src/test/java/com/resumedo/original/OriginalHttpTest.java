package com.resumedo.original;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.resumedo.auth.*;
import com.resumedo.common.*;
import java.nio.file.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class OriginalHttpTest {
 @TempDir Path root;
 @Test void sourceStreamsExactBytesWithUnicodeFilenameAndSafeHeaders() throws Exception {
  var service=mock(OriginalResumeService.class);var auth=mock(AuthService.class);
  when(auth.current("test-user")).thenReturn(new UserAccount(9,"test@example.invalid",null,"unused","test","dark"));
  byte[] bytes="%PDF-original bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8);
  Path file=root.resolve("source.pdf");Files.write(file,bytes);
  when(service.source(9,"id",false)).thenReturn(new OriginalResumeService.Source(file,"中文😀.pdf",bytes.length));
  when(service.source(9,"id",true)).thenReturn(new OriginalResumeService.Source(file,"简历.pdf",bytes.length));
  var mvc=MockMvcBuilders.standaloneSetup(new OriginalResumeController(service,auth)).setControllerAdvice(new GlobalExceptionHandler()).build();
  var user=new UsernamePasswordAuthenticationToken("test-user","unused");
  var inline=mvc.perform(get("/api/resumes/id/source").principal(user)).andExpect(status().isOk())
   .andExpect(header().string("Content-Type","application/pdf")).andExpect(header().string("Cache-Control","no-store"))
   .andExpect(header().string("X-Content-Type-Options","nosniff")).andExpect(content().bytes(bytes)).andReturn();
  assertThat(inline.getResponse().getHeader("Content-Disposition")).isEqualTo("inline; filename*=UTF-8''%E4%B8%AD%E6%96%87%F0%9F%98%80.pdf");
  mvc.perform(get("/api/resumes/id/source?download=1").principal(user)).andExpect(status().isOk())
   .andExpect(header().string("Content-Disposition","attachment; filename*=UTF-8''%E7%AE%80%E5%8E%86.pdf"))
   .andExpect(content().bytes(bytes));
 }
 @Test void unauthorizedOwnerErrorsArePreservedAs404AndDeleteIs204() throws Exception {
  var service=mock(OriginalResumeService.class);var auth=mock(AuthService.class);
  when(auth.current("other")).thenReturn(new UserAccount(77,"other@example.invalid",null,"unused","other","dark"));
  when(service.source(77,"private",false)).thenThrow(ApiException.notFound("简历不存在"));
  doThrow(ApiException.notFound("简历不存在")).when(service).delete(77,"private");
  var mvc=MockMvcBuilders.standaloneSetup(new OriginalResumeController(service,auth)).setControllerAdvice(new GlobalExceptionHandler()).build();
  var user=new UsernamePasswordAuthenticationToken("other","unused");
  mvc.perform(get("/api/resumes/private/source").principal(user)).andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("简历不存在"));
  mvc.perform(delete("/api/resumes/private").principal(user)).andExpect(status().isNotFound());
  mvc.perform(delete("/api/resumes/owned").principal(user)).andExpect(status().isNoContent());
 }
 @Test void oversizedL1Is400WithoutChangingLegacyL2Status() {
  var handler=new GlobalExceptionHandler();
  var original=new org.springframework.mock.web.MockHttpServletRequest("POST","/api/resumes/originals");
  var legacy=new org.springframework.mock.web.MockHttpServletRequest("POST","/api/imports");
  var error=new org.springframework.web.multipart.MaxUploadSizeExceededException(20L*1024*1024);
  assertThat(handler.handleUploadTooLarge(error,original).getStatusCode().value()).isEqualTo(400);
  assertThat(handler.handleUploadTooLarge(error,legacy).getStatusCode().value()).isEqualTo(413);
 }

}
