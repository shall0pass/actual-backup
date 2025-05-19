FROM node:20-bookworm as build
RUN apt-get update && apt-get install -y openssl
COPY package.json ./app/
COPY app.js ./app/
WORKDIR /app
RUN npm install

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y openssl cron

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /app
COPY --from=build /app /app
RUN mkdir data
ENV ACTUAL_SERVER_URL=http://localhost:5006
ENV ACTUAL_SERVER_PASSWORD = ""
ENV ACTUAL_SYNC_ID = ""
ENV TZ = "Etc/UTC"
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
CMD ["/usr/local/bin/entrypoint.sh"]
