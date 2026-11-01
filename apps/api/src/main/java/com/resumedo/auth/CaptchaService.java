package com.resumedo.auth;

import com.resumedo.auth.AuthDtos.CaptchaClick;
import com.resumedo.auth.AuthDtos.CaptchaResponse;
import com.resumedo.auth.AuthDtos.CaptchaTicketResponse;
import com.resumedo.common.ApiException;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Arc2D;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import javax.imageio.ImageIO;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class CaptchaService {
    static final int WIDTH = 320;
    static final int HEIGHT = 200;
    private static final int COLUMNS = 4;
    private static final int ROWS = 2;
    private static final int SHAPE_COUNT = 8;
    private static final int TARGET_COUNT = 3;
    private static final int MAX_CLICKS = 8;
    private static final int MAX_ATTEMPTS = 4;
    private static final int MAX_CHALLENGES_PER_IP = 40;
    private static final double CLICK_TOLERANCE = 8.0;
    private static final int CHALLENGE_TTL_SECONDS = 300;
    private static final int TICKET_TTL_SECONDS = 300;

    private final Map<String, Challenge> challenges = new ConcurrentHashMap<>();
    private final Map<String, Ticket> tickets = new ConcurrentHashMap<>();
    private final Map<String, Deque<Instant>> issuedByIp = new ConcurrentHashMap<>();

    public CaptchaResponse create(String ip) {
        Instant now = Instant.now();
        purgeExpired(now);
        countAndCheck(ip, now);
        if (challenges.size() >= 5_000) {
            throw tooMany("验证请求过于频繁，请稍后再试");
        }

        List<Placed> placed = layout();
        byte[] png = render(placed);
        List<Spot> targets = new ArrayList<>();
        List<Spot> decoys = new ArrayList<>();
        for (Placed shape : placed) {
            if (shape.kind() == Kind.CLOSED_RING) {
                targets.add(shape.spot());
            } else {
                decoys.add(shape.spot());
            }
        }

        String id = UUID.randomUUID().toString();
        challenges.put(id, new Challenge(
                List.copyOf(targets),
                List.copyOf(decoys),
                ip,
                now.plusSeconds(CHALLENGE_TTL_SECONDS)));
        return new CaptchaResponse(
                id,
                "点击所有闭合环形",
                "data:image/png;base64," + Base64.getEncoder().encodeToString(png),
                CHALLENGE_TTL_SECONDS);
    }

    public CaptchaTicketResponse verify(String captchaId, List<CaptchaClick> clicks, String ip) {
        Instant now = Instant.now();
        Challenge challenge = captchaId == null ? null : challenges.get(captchaId);
        if (challenge == null) {
            throw ApiException.badRequest("验证已过期，请重新验证");
        }
        if (challenge.expiresAt.isBefore(now)) {
            challenges.remove(captchaId, challenge);
            throw ApiException.badRequest("验证已过期，请重新验证");
        }
        if (!challenge.ip.equals(ip)) {
            challenges.remove(captchaId, challenge);
            throw ApiException.badRequest("验证已过期，请重新验证");
        }
        if (clicks == null || clicks.isEmpty()) {
            throw ApiException.badRequest("请点击图片中的闭合环形");
        }
        if (clicks.size() > MAX_CLICKS) {
            throw ApiException.badRequest("点击次数过多，请重新验证");
        }

        if (!matches(challenge, clicks)) {
            challenge.attempts++;
            if (challenge.attempts >= MAX_ATTEMPTS) {
                challenges.remove(captchaId, challenge);
                throw ApiException.badRequest("验证未通过，请重新验证");
            }
            throw ApiException.badRequest("还有闭合环形没有选中，请重试");
        }

        challenges.remove(captchaId, challenge);
        String ticket = UUID.randomUUID().toString();
        tickets.put(ticket, new Ticket(ip, now.plusSeconds(TICKET_TTL_SECONDS)));
        return new CaptchaTicketResponse(ticket, TICKET_TTL_SECONDS);
    }

    public void consumeTicket(String ticket, String ip) {
        if (ticket == null || ticket.isBlank()) {
            throw ApiException.badRequest("请先完成人机验证");
        }
        Ticket stored = tickets.remove(ticket);
        if (stored == null || stored.expiresAt().isBefore(Instant.now()) || !stored.ip().equals(ip)) {
            throw ApiException.badRequest("人机验证已失效，请重新验证");
        }
    }

    List<Spot> targetsOf(String captchaId) {
        Challenge challenge = challenges.get(captchaId);
        return challenge == null ? List.of() : challenge.targets;
    }

    List<Spot> decoysOf(String captchaId) {
        Challenge challenge = challenges.get(captchaId);
        return challenge == null ? List.of() : challenge.decoys;
    }

    private boolean matches(Challenge challenge, List<CaptchaClick> clicks) {
        List<Spot> points = clicks.stream()
                .map(click -> new Spot(
                        Math.min(1.0, Math.max(0.0, click.x())) * WIDTH,
                        Math.min(1.0, Math.max(0.0, click.y())) * HEIGHT,
                        0))
                .toList();
        for (Spot target : challenge.targets) {
            if (points.stream().noneMatch(point -> distance(point, target) <= target.r() + CLICK_TOLERANCE)) {
                return false;
            }
        }
        for (Spot decoy : challenge.decoys) {
            if (points.stream().anyMatch(point -> distance(point, decoy) <= decoy.r() + CLICK_TOLERANCE)) {
                return false;
            }
        }
        return true;
    }

    private static double distance(Spot left, Spot right) {
        return Math.hypot(left.x() - right.x(), left.y() - right.y());
    }

    private List<Placed> layout() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        List<Integer> cells = new ArrayList<>();
        for (int index = 0; index < COLUMNS * ROWS; index++) {
            cells.add(index);
        }
        Collections.shuffle(cells, random);

        List<Kind> kinds = new ArrayList<>();
        for (int index = 0; index < TARGET_COUNT; index++) {
            kinds.add(Kind.CLOSED_RING);
        }
        kinds.add(Kind.OPEN_RING);
        kinds.add(Kind.OPEN_RING);
        kinds.add(Kind.TRIANGLE);
        kinds.add(Kind.TRIANGLE);
        kinds.add(Kind.SQUARE);
        Collections.shuffle(kinds, random);

        double cellWidth = (double) WIDTH / COLUMNS;
        double cellHeight = (double) HEIGHT / ROWS;
        List<Placed> placed = new ArrayList<>();
        for (int index = 0; index < SHAPE_COUNT; index++) {
            int cell = cells.get(index);
            double x = (cell % COLUMNS + 0.5) * cellWidth + random.nextDouble(-8, 8);
            double y = (cell / COLUMNS + 0.5) * cellHeight + random.nextDouble(-8, 8);
            double radius = random.nextDouble(17, 25);
            double rotation = random.nextDouble(0, Math.PI * 2);
            placed.add(new Placed(kinds.get(index), new Spot(x, y, radius), rotation));
        }
        return placed;
    }

    private byte[] render(List<Placed> shapes) {
        BufferedImage image = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
            graphics.setColor(new Color(0x1B2226));
            graphics.fillRect(0, 0, WIDTH, HEIGHT);

            ThreadLocalRandom random = ThreadLocalRandom.current();
            for (int index = 0; index < 70; index++) {
                graphics.setColor(new Color(230, 236, 239, 8 + random.nextInt(12)));
                int size = 1 + random.nextInt(2);
                graphics.fillOval(random.nextInt(WIDTH), random.nextInt(HEIGHT), size, size);
            }

            graphics.setStroke(new BasicStroke(2.6f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
            graphics.setColor(new Color(228, 235, 239, 232));
            for (Placed shape : shapes) {
                draw(graphics, shape);
            }
        } finally {
            graphics.dispose();
        }
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            ImageIO.write(image, "png", output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to render captcha", exception);
        }
    }

    private static void draw(Graphics2D graphics, Placed shape) {
        double x = shape.spot().x();
        double y = shape.spot().y();
        double radius = shape.spot().r();
        switch (shape.kind()) {
            case CLOSED_RING -> graphics.draw(new Ellipse2D.Double(x - radius, y - radius, radius * 2, radius * 2));
            case OPEN_RING -> graphics.draw(new Arc2D.Double(
                    x - radius, y - radius, radius * 2, radius * 2,
                    Math.toDegrees(shape.rotation()), 275, Arc2D.OPEN));
            case TRIANGLE -> graphics.draw(polygon(x, y, radius, 3, shape.rotation()));
            case SQUARE -> graphics.draw(polygon(x, y, radius, 4, shape.rotation()));
        }
    }

    private static Path2D polygon(double x, double y, double radius, int sides, double rotation) {
        Path2D path = new Path2D.Double();
        for (int index = 0; index < sides; index++) {
            double angle = rotation + index * 2 * Math.PI / sides;
            double px = x + Math.cos(angle) * radius;
            double py = y + Math.sin(angle) * radius;
            if (index == 0) {
                path.moveTo(px, py);
            } else {
                path.lineTo(px, py);
            }
        }
        path.closePath();
        return path;
    }

    private void countAndCheck(String ip, Instant now) {
        Deque<Instant> issued = issuedByIp.computeIfAbsent(ip, key -> new ArrayDeque<>());
        synchronized (issued) {
            while (!issued.isEmpty() && issued.peekFirst().isBefore(now.minus(Duration.ofHours(1)))) {
                issued.pollFirst();
            }
            if (issued.size() >= MAX_CHALLENGES_PER_IP) {
                throw tooMany("验证请求过于频繁，请稍后再试");
            }
            issued.addLast(now);
        }
        if (issuedByIp.size() > 10_000) {
            issuedByIp.entrySet().removeIf(entry -> entry.getValue().isEmpty());
        }
    }

    private void purgeExpired(Instant now) {
        challenges.entrySet().removeIf(entry -> entry.getValue().expiresAt.isBefore(now));
        tickets.entrySet().removeIf(entry -> entry.getValue().expiresAt().isBefore(now));
    }

    private static ApiException tooMany(String message) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS", message, Map.of());
    }

    public record Spot(double x, double y, double r) {
    }

    private enum Kind {
        CLOSED_RING,
        OPEN_RING,
        TRIANGLE,
        SQUARE
    }

    private record Placed(Kind kind, Spot spot, double rotation) {
    }

    private record Ticket(String ip, Instant expiresAt) {
    }

    private static final class Challenge {
        private final List<Spot> targets;
        private final List<Spot> decoys;
        private final String ip;
        private final Instant expiresAt;
        private int attempts;

        private Challenge(List<Spot> targets, List<Spot> decoys, String ip, Instant expiresAt) {
            this.targets = targets;
            this.decoys = decoys;
            this.ip = ip;
            this.expiresAt = expiresAt;
        }
    }
}
