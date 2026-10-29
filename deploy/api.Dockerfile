FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY apps/api/pom.xml ./pom.xml
RUN mvn -q -B dependency:go-offline
COPY apps/api/src ./src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/resume-api-*.jar /app/app.jar
ENV RESUME_DO_API_PORT=8080 \
    RESUME_DO_STORAGE_DIR=/data
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
