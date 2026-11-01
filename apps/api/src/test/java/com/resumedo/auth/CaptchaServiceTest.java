package com.resumedo.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.resumedo.auth.AuthDtos.CaptchaClick;
import com.resumedo.auth.AuthDtos.CaptchaResponse;
import com.resumedo.common.ApiException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class CaptchaServiceTest {
    private final CaptchaService service = new CaptchaService();

    @Test
    void solvingEveryClosedRingIssuesASingleUseTicket() throws Exception {
        CaptchaResponse response = service.create("10.0.0.1");
        assertThat(response.image()).startsWith("data:image/png;base64,");
        assertThat(ImageIO.read(new java.io.ByteArrayInputStream(base64(response))).getWidth())
                .isEqualTo(CaptchaService.WIDTH);

        List<CaptchaClick> clicks = clicks(service.targetsOf(response.captchaId()));
        String ticket = service.verify(response.captchaId(), clicks, "10.0.0.1").ticket();

        service.consumeTicket(ticket, "10.0.0.1");
        assertThatThrownBy(() -> service.consumeTicket(ticket, "10.0.0.1"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("人机验证");
    }

    @Test
    void missingARingOrHittingADecoyFails() {
        CaptchaResponse response = service.create("10.0.0.2");
        List<CaptchaClick> rings = clicks(service.targetsOf(response.captchaId()));
        assertThatThrownBy(() -> service.verify(response.captchaId(), rings.subList(1, rings.size()), "10.0.0.2"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("闭合环形");

        CaptchaResponse next = service.create("10.0.0.2");
        List<CaptchaClick> withDecoy = new ArrayList<>(clicks(service.targetsOf(next.captchaId())));
        withDecoy.addAll(clicks(service.decoysOf(next.captchaId()).subList(0, 1)));
        assertThatThrownBy(() -> service.verify(next.captchaId(), withDecoy, "10.0.0.2"))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void ticketsCannotBeUsedFromAnotherAddress() {
        CaptchaResponse response = service.create("10.0.0.3");
        String ticket = service.verify(response.captchaId(), clicks(service.targetsOf(response.captchaId())), "10.0.0.3")
                .ticket();

        assertThatThrownBy(() -> service.consumeTicket(ticket, "10.0.0.9"))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void emptyAnswersAreRejected() {
        CaptchaResponse response = service.create("10.0.0.4");
        assertThatThrownBy(() -> service.verify(response.captchaId(), List.of(), "10.0.0.4"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("闭合环形");
        assertThatThrownBy(() -> service.verify("unknown", List.of(new CaptchaClick(0.5, 0.5)), "10.0.0.4"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("验证已过期");
    }

    private static List<CaptchaClick> clicks(List<CaptchaService.Spot> spots) {
        return spots.stream()
                .map(spot -> new CaptchaClick(spot.x() / CaptchaService.WIDTH, spot.y() / CaptchaService.HEIGHT))
                .toList();
    }

    private static byte[] base64(CaptchaResponse response) {
        return Base64.getDecoder().decode(response.image().substring("data:image/png;base64,".length()));
    }
}
