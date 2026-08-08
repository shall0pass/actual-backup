# FROM node:24-slim as build
# RUN apt-get update \
#     && apt-get install --no-install-recommends -y openssl \
#     && rm -rf /var/lib/apt/lists/*
# COPY package*.json ./app/
# COPY src ./app/src
# WORKDIR /app
# RUN npm ci --omit=dev

# FROM node:24-bookworm-slim
# RUN apt-get update && apt-get install -y openssl cron

# COPY entrypoint.sh /usr/local/bin/entrypoint.sh
# RUN chmod +x /usr/local/bin/entrypoint.sh

# WORKDIR /app
# COPY --from=build /app /app
# RUN mkdir -p data
# ENV ACTUAL_SERVER_URL=http://localhost:5006
# ENV ACTUAL_SERVER_PASSWORD=""
# ENV ACTUAL_SYNC_ID=""
# ENV TZ="Etc/UTC"
# ENV WEB_PORT=3000
# ENV BACKUP_DATA_ROOT=/app/data
# ENV NODE_TLS_REJECT_UNAUTHORIZED=0
# CMD ["/usr/local/bin/entrypoint.sh"]

FROM node:24-slim as build
COPY package*.json ./app/
COPY src ./app/src
WORKDIR /app
RUN npm ci --omit=dev

FROM node:24-bookworm-slim

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p data
ENV TZ="Etc/UTC"
ENV WEB_PORT=3000
ENV BACKUP_DATA_ROOT=/app/data
EXPOSE 3000
CMD ["/usr/local/bin/entrypoint.sh"]