# Multi-stage build: web PWA + python server in one image.
FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/ server/
COPY --from=web /app/web/dist web/dist
RUN pip install --no-cache-dir -e "./server[local]"
# Voice models are mounted, not baked in: -v ./voices:/app/voices
ENV INHOUSE_HOST=0.0.0.0 INHOUSE_PORT=8770 \
    INHOUSE_TTS__VOICE_PATH=/app/voices/en_US-lessac-medium.onnx
EXPOSE 8770
CMD ["python", "-m", "inhouse"]
