package com.resumedo.ai;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.resumedo.auth.AuthService;
import com.resumedo.auth.UserAccount;
import com.resumedo.common.GlobalExceptionHandler;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** MVC contract tests only; the unchanged SecurityConfig protects /api/ai/** in the full application. */
class AiControllerTest {
    private final AiRewriteService service = mock(AiRewriteService.class);
    private final AuthService auth = mock(AuthService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new AiController(service, auth))
            .setControllerAdvice(new GlobalExceptionHandler()).build();
    private final ObjectMapper json = new ObjectMapper();
    private static final String ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

    @Test void returnsNoStoreSuggestionUsingAuthenticatedOwner() throws Exception {
        var input = new AiDtos.RewriteRequest(ID, "polish", "正文", "work", null, true);
        when(auth.current("test@example.invalid")).thenReturn(new UserAccount(9, "test@example.invalid", null, "", "test", "dark"));
        when(service.rewrite(9, input)).thenReturn(new AiDtos.RewriteResponse(ID, "polish", "正文", "改写", List.of()));
        mvc.perform(post("/api/ai/rewrite").principal(new TestingAuthenticationToken("test@example.invalid", ""))
                .contentType("application/json").content(json.writeValueAsBytes(input)))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("rewrittenText").value("改写"));
        verify(service).rewrite(9, input);
    }

    @Test void rejectsInvalidActionMissingConsentAndOversizedText() throws Exception {
        for (var input : List.of(new AiDtos.RewriteRequest(ID, "generate", "正文", null, null, true),
                new AiDtos.RewriteRequest(ID, "polish", "正文", null, null, null),
                new AiDtos.RewriteRequest(ID, "polish", "字".repeat(6001), null, null, true))) {
            mvc.perform(post("/api/ai/rewrite").contentType("application/json").content(json.writeValueAsBytes(input)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("VALIDATION_FAILED"));
        }
        verifyNoInteractions(service, auth);
    }
}
