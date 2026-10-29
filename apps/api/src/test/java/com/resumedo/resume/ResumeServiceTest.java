package com.resumedo.resume;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.resumedo.TestFixtures;
import com.resumedo.common.ApiException;
import com.resumedo.resume.ResumeDtos.CreateRequest;
import com.resumedo.resume.ResumeDtos.ResumeResponse;
import com.resumedo.resume.ResumeDtos.UpdateRequest;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

class ResumeServiceTest {
    private static final long OWNER = 7L;
    private static final String PUBLIC_ID = "pub-1";
    private static final Instant CREATED = Instant.parse("2026-01-01T00:00:00Z");
    private static final Instant UPDATED = Instant.parse("2026-01-02T00:00:00Z");

    private final ResumeRepository repository = mock(ResumeRepository.class);
    private final ResumeService service = new ResumeService(
            repository, new ResumeValidator(), new ObjectMapper());

    @Test
    void createDefaultsTitleToMyResume() {
        when(repository.find(eq(OWNER), anyString()))
                .thenReturn(Optional.of(row(1, PUBLIC_ID, 0, null, "我的简历")));

        ResumeResponse response = service.create(OWNER, new CreateRequest(
                null, TestFixtures.validDocument(), TestFixtures.validAppearance()));

        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        verify(repository).insert(
                anyString(), eq(OWNER), title.capture(), anyString(), anyString(),
                anyInt(), anyString(), anyInt());
        assertThat(title.getValue()).isEqualTo("我的简历");
        assertThat(response.title()).isEqualTo("我的简历");
    }

    @Test
    void createRejectsTitleOverLimit() {
        assertThatThrownBy(() -> service.create(OWNER, new CreateRequest(
                "长".repeat(101), TestFixtures.validDocument(), TestFixtures.validAppearance())))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).status())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void updateReplaysSameMutationIdWithoutWriting() {
        when(repository.find(OWNER, PUBLIC_ID))
                .thenReturn(Optional.of(row(1, PUBLIC_ID, 5, "m-1", "我的简历")));

        ResumeResponse response = service.update(OWNER, PUBLIC_ID,
                new UpdateRequest(5L, "m-1", null, null, null));

        verify(repository, never()).update(anyLong(), anyLong(), anyLong(), anyString(), anyString(),
                anyString(), anyInt(), anyString(), anyInt(), anyLong(), anyString());
        assertThat(response.revision()).isEqualTo(5);
    }

    @Test
    void updateConflictsWhenBaseRevisionIsStale() {
        when(repository.find(OWNER, PUBLIC_ID))
                .thenReturn(Optional.of(row(1, PUBLIC_ID, 5, "m-0", "我的简历")));

        assertThatThrownBy(() -> service.update(OWNER, PUBLIC_ID,
                new UpdateRequest(4L, "m-2", null, null, null)))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> {
                    ApiException error = (ApiException) throwable;
                    assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(error.code()).isEqualTo("REVISION_CONFLICT");
                });
    }

    @Test
    void updateRejectsEmptyRequest() {
        when(repository.find(OWNER, PUBLIC_ID))
                .thenReturn(Optional.of(row(1, PUBLIC_ID, 5, "m-0", "我的简历")));

        assertThatThrownBy(() -> service.update(OWNER, PUBLIC_ID,
                new UpdateRequest(5L, "m-3", null, null, null)))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).status())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void updateReturnsLatestWhenMutationAlreadyAppliedByConcurrentWrite() {
        ResumeRow current = row(1, PUBLIC_ID, 5, "m-0", "我的简历");
        ResumeRow latest = row(1, PUBLIC_ID, 6, "m-9", "我的简历");
        when(repository.update(anyLong(), eq(OWNER), eq(5L), anyString(), anyString(), anyString(),
                anyInt(), anyString(), anyInt(), eq(6L), eq("m-9")))
                .thenReturn(0);
        when(repository.find(OWNER, PUBLIC_ID))
                .thenReturn(Optional.of(current), Optional.of(latest));

        ResumeResponse response = service.update(OWNER, PUBLIC_ID,
                new UpdateRequest(5L, "m-9", "新标题", null, null));

        assertThat(response.revision()).isEqualTo(6);
        assertThat(response.title()).isEqualTo("我的简历");
    }

    @Test
    void updateConflictsWhenConcurrentWriteAppliedDifferentMutation() {
        ResumeRow current = row(1, PUBLIC_ID, 5, "m-0", "我的简历");
        ResumeRow latest = row(1, PUBLIC_ID, 6, "m-other", "我的简历");
        when(repository.find(OWNER, PUBLIC_ID))
                .thenReturn(Optional.of(current), Optional.of(latest));
        when(repository.update(anyLong(), eq(OWNER), eq(5L), anyString(), anyString(), anyString(),
                anyInt(), anyString(), anyInt(), eq(6L), eq("m-9")))
                .thenReturn(0);

        assertThatThrownBy(() -> service.update(OWNER, PUBLIC_ID,
                new UpdateRequest(5L, "m-9", "新标题", null, null)))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> {
                    ApiException error = (ApiException) throwable;
                    assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(error.code()).isEqualTo("REVISION_CONFLICT");
                });
    }

    @Test
    void updateBumpsRevisionOnSuccess() {
        ResumeRow current = row(1, PUBLIC_ID, 5, "m-0", "我的简历");
        ResumeRow saved = row(1, PUBLIC_ID, 6, "m-1", "新标题");
        when(repository.find(OWNER, PUBLIC_ID))
                .thenReturn(Optional.of(current), Optional.of(saved));
        when(repository.update(eq(1L), eq(OWNER), eq(5L), anyString(), anyString(), anyString(),
                eq(1), eq("clean"), eq(1), eq(6L), eq("m-1")))
                .thenReturn(1);

        ResumeResponse response = service.update(OWNER, PUBLIC_ID,
                new UpdateRequest(5L, "m-1", "新标题", null, null));

        assertThat(response.revision()).isEqualTo(6);
        assertThat(response.title()).isEqualTo("新标题");
    }

    @Test
    void getThrowsNotFoundForMissingResume() {
        when(repository.find(OWNER, PUBLIC_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(OWNER, PUBLIC_ID))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).status())
                        .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void saveAndReloadPreservesParagraphsAndInlineSpaces() throws Exception {
        var document = TestFixtures.validDocument();
        ((com.fasterxml.jackson.databind.node.ObjectNode) document.path("sections").get(0).path("items").get(0))
                .put("body", "第一行<div>第二行 <b>加粗</b> 结尾</div><div>第三行</div>");
        var stored = new java.util.concurrent.atomic.AtomicReference<>(row(1, PUBLIC_ID, 5, "old", "我的简历"));
        when(repository.find(OWNER, PUBLIC_ID)).thenAnswer(invocation -> Optional.of(stored.get()));
        when(repository.update(eq(1L), eq(OWNER), eq(5L), anyString(), anyString(), anyString(),
                anyInt(), anyString(), anyInt(), eq(6L), eq("paragraph")))
                .thenAnswer(invocation -> {
                    stored.set(new ResumeRow(1, PUBLIC_ID, OWNER, invocation.getArgument(3),
                            invocation.getArgument(4), invocation.getArgument(5), 1, "clean", 2,
                            6, "paragraph", CREATED, UPDATED));
                    return 1;
                });
        service.update(OWNER, PUBLIC_ID, new UpdateRequest(5L, "paragraph", null, document, null));
        var reloaded = service.get(OWNER, PUBLIC_ID);
        assertThat(reloaded.document().path("sections").get(0).path("items").get(0).path("body").asText())
                .isEqualTo("第一行<p>第二行 <b>加粗</b> 结尾</p><p>第三行</p>");
    }

    private static ResumeRow row(
            long id, String publicId, long revision, String lastMutationId, String title) {
        return new ResumeRow(
                id,
                publicId,
                OWNER,
                title,
                TestFixtures.validDocumentJson(),
                TestFixtures.validAppearanceJson(),
                1,
                "clean",
                1,
                revision,
                lastMutationId,
                CREATED,
                UPDATED);
    }
}
