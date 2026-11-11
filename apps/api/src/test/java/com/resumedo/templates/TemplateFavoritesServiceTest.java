package com.resumedo.templates;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.resumedo.common.ApiException;
import java.util.List;
import org.junit.jupiter.api.Test;

class TemplateFavoritesServiceTest {
    final TemplateFavoritesRepository repository=mock(TemplateFavoritesRepository.class);
    final TemplateFavoritesService service=new TemplateFavoritesService(repository);

    @Test void listsAndChangesOnlyTheRequestedOwnersFavorites() {
        when(repository.list(9)).thenReturn(List.of("1045", "imported"));
        assertThat(service.list(9)).containsExactly("1045", "imported");
        service.add(9,"1045");
        service.add(9,"1045");
        service.remove(77,"1045");
        verify(repository,times(2)).add(9,"1045");
        verify(repository).remove(77,"1045");
        verify(repository,never()).remove(9,"1045");
    }

    @Test void refusesUnknownAndMalformedTemplatesBeforeWriting() {
        for(String id:List.of("", "unknown", "../../etc", "999999")) {
            assertThatThrownBy(() -> service.add(9,id)).isInstanceOf(ApiException.class);
            assertThatThrownBy(() -> service.remove(9,id)).isInstanceOf(ApiException.class);
        }
        verifyNoInteractions(repository);
    }
}
