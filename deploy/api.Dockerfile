ARG MAVEN_IMAGE=maven:3.9-eclipse-temurin-21
ARG JAVA_IMAGE=eclipse-temurin:21-jre
FROM ${MAVEN_IMAGE} AS build
ARG MAVEN_MIRROR_URL=https://repo.maven.apache.org/maven2/
ENV MAVEN_OPTS="-Xmx384m -XX:MaxMetaspaceSize=192m" \
    MAVEN_MIRROR_URL=${MAVEN_MIRROR_URL}
WORKDIR /build
COPY apps/api/pom.xml ./pom.xml
COPY deploy/maven-settings.xml /build/maven-settings.xml
RUN mvn -B -ntp -s /build/maven-settings.xml dependency:go-offline
COPY apps/api/src ./src
RUN mvn -B -ntp -s /build/maven-settings.xml -DskipTests package

FROM ${JAVA_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /build/target/resume-api-*.jar /app/app.jar
ENV RESUME_DO_API_PORT=8080 \
    RESUME_DO_STORAGE_DIR=/data \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
