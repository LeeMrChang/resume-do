package com.resumedo.original;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.resumedo.common.ApiException;
import com.resumedo.resume.ResumeRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class ResumeQuotaRepositoryTest {
 @Test void quotaLocksOwnerBeforeCurrentReadAndRejectsAtFive() {
  var jdbc=mock(JdbcTemplate.class);var repo=new ResumeRepository(jdbc);
  when(jdbc.queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE",Long.class,4L)).thenReturn(4L);
  when(jdbc.queryForList("SELECT id FROM resumes WHERE owner_id = ? AND deleted_at IS NULL FOR UPDATE",Long.class,4L)).thenReturn(List.of(1L,2L,3L,4L,5L));
  assertThatThrownBy(()->repo.requireCapacity(4)).isInstanceOfSatisfying(ApiException.class,e -> {assertThat(e.status().value()).isEqualTo(429);assertThat(e.code()).isEqualTo("RESUME_LIMIT_REACHED");});
  var order=inOrder(jdbc);
  order.verify(jdbc).queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE",Long.class,4L);
  order.verify(jdbc).queryForList("SELECT id FROM resumes WHERE owner_id = ? AND deleted_at IS NULL FOR UPDATE",Long.class,4L);
 }
}
