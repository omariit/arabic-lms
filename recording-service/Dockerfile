# recording-service — chunked lesson recording + FFmpeg pipeline
#
# Kept intentionally tiny: no npm dependencies, so a build is just "copy files".
# FFmpeg/ffprobe come from Alpine packages (ffmpeg ships both binaries).
FROM node:20-alpine

RUN apk add --no-cache ffmpeg tini \
  && mkdir -p /data/recordings/sessions /data/recordings/outputs

WORKDIR /app
COPY package.json server.js lib.js pipeline.js ./

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data/recordings

# The volume itself is declared in Railway (mount path /data/recordings) — Railway's
# builder rejects the Dockerfile VOLUME instruction. It is owned by root, so this
# container runs as root on purpose: it only ever writes inside that mount.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
