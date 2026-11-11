package com.resumedo.templates;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.resumedo.auth.*;
import com.resumedo.common.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class TemplateFavoritesHttpTest {
    @Test void usesTheSignedInAccountAndReturnsEmptySuccessForIdempotentChanges() throws Exception {
        var service=mock(TemplateFavoritesService.class);
        var auth=mock(AuthService.class);
        when(auth.current("alice")).thenReturn(new UserAccount(9,"alice@example.invalid",null,"unused","Alice","dark"));
        when(auth.current("bob")).thenReturn(new UserAccount(77,"bob@example.invalid",null,"unused","Bob","dark"));
        when(service.list(9)).thenReturn(List.of("1045"));
        when(service.list(77)).thenReturn(List.of());
        var mvc=MockMvcBuilders.standaloneSetup(new TemplateFavoritesController(service,auth))
            .setControllerAdvice(new GlobalExceptionHandler()).build();
        var alice=new UsernamePasswordAuthenticationToken("alice","unused");
        var bob=new UsernamePasswordAuthenticationToken("bob","unused");
        mvc.perform(get("/api/template-favorites").principal(alice)).andExpect(status().isOk()).andExpect(content().json("[\"1045\"]"));
        mvc.perform(get("/api/template-favorites").principal(bob)).andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(put("/api/template-favorites/1045").principal(alice)).andExpect(status().isNoContent());
        mvc.perform(put("/api/template-favorites/1045").principal(alice)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/template-favorites/1045").principal(bob)).andExpect(status().isNoContent());
        verify(service,times(2)).add(9,"1045");
        verify(service).remove(77,"1045");
        mvc.perform(get("/api/template-favorites")).andExpect(status().isUnauthorized());
    }

    @Test void exposesInvalidTemplateAs400() throws Exception {
        var repository=mock(TemplateFavoritesRepository.class);
        var auth=mock(AuthService.class);
        when(auth.current("alice")).thenReturn(new UserAccount(9,"alice@example.invalid",null,"unused","Alice","dark"));
        var mvc=MockMvcBuilders.standaloneSetup(new TemplateFavoritesController(new TemplateFavoritesService(repository),auth))
            .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(put("/api/template-favorites/unknown").principal(new UsernamePasswordAuthenticationToken("alice","unused")))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(repository);
    }
}
