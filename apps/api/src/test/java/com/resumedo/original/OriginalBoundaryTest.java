package com.resumedo.original;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.resumedo.TestFixtures;
import com.resumedo.common.ApiException;
import com.resumedo.export.*;
import com.resumedo.resume.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;

class OriginalBoundaryTest {
    ResumeRow original() {
        return new ResumeRow(1,"a".repeat(32),9,"原件",TestFixtures.validDocumentJson(),TestFixtures.validAppearanceJson(),1,"1045",2,0,null,Instant.now(),Instant.now(),"original","resumes/"+"a".repeat(32)+".pdf","中文😀.pdf","application/pdf",123L,"f".repeat(64),3,null);
    }
    @Test void originalExportRejectedBeforeRevisionOrIdempotencyAndNeverCreatesJob() {
        var resumes=mock(ResumeRepository.class); var exports=mock(ExportRepository.class);
        when(resumes.find(9,"a".repeat(32))).thenReturn(Optional.of(original()));
        var service=new ExportService(exports,resumes,new ObjectMapper(),"/tmp",2,"2");
        assertThatThrownBy(() -> service.create(9,"a".repeat(32),new ExportDtos.CreateExportRequest(99L,"request",null)))
            .isInstanceOfSatisfying(ApiException.class,e -> { assertThat(e.status().value()).isEqualTo(409);assertThat(e.code()).isEqualTo("ORIGINAL_RESUME_SOURCE_DOWNLOAD"); });
        verifyNoInteractions(exports);
    }
    @Test void originalCannotBePatched() {
        var repo=mock(ResumeRepository.class);when(repo.find(9,"a".repeat(32))).thenReturn(Optional.of(original()));
        var service=new ResumeService(repo,new ResumeValidator(),new ObjectMapper());
        assertThatThrownBy(() -> service.update(9,"a".repeat(32),new ResumeDtos.UpdateRequest(0L,"id","x",null,null)))
            .isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.code()).isEqualTo("ORIGINAL_RESUME_READ_ONLY"));
        verify(repo,never()).update(anyLong(),anyLong(),anyLong(),anyString(),anyString(),anyString(),anyInt(),anyString(),anyInt(),anyLong(),anyString());
    }
    @Test void structuredCreationAlsoEnforcesSharedQuota() {
        var repo=mock(ResumeRepository.class);
        doThrow(new ApiException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,"RESUME_LIMIT_REACHED","已达简历数量上限（5 份），请先删除不需要的简历",Map.of())).when(repo).requireCapacity(9);
        var service=new ResumeService(repo,new ResumeValidator(),new ObjectMapper());
        assertThatThrownBy(() -> service.create(9,new ResumeDtos.CreateRequest("x",TestFixtures.validDocument(),TestFixtures.validAppearance())))
            .isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.status().value()).isEqualTo(429));
        verify(repo,never()).insert(anyString(),anyLong(),anyString(),anyString(),anyString(),anyInt(),anyString(),anyInt());
    }
}
