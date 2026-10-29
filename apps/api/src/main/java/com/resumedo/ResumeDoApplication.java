package com.resumedo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@org.springframework.scheduling.annotation.EnableScheduling
@SpringBootApplication
public class ResumeDoApplication {
    public static void main(String[] args) {
        SpringApplication.run(ResumeDoApplication.class, args);
    }
}
