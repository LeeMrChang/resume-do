package com.resumedo.common;

import java.util.UUID;

public final class Ids {
    private Ids() {
    }

    public static String newPublicId() {
        return UUID.randomUUID().toString().replace("-", "");
    }
}
