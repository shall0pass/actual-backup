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

#RUN echo "0 0 */5 * * node /app/app.js >> /var/log/cron.log 2>&1" > /etc/cron.d/mycron
#RUN chmod 0644 /etc/cron.d/mycron
#RUN crontab /etc/cron.d/mycron
#RUN touch /var/log/cron.log

WORKDIR /app
COPY --from=build /app /app
RUN mkdir data
ENV ACTUAL_SERVER_URL=http://localhost:5006
ENV ACTUAL_SERVER_PASSWORD = ""
ENV ACTUAL_SYNC_ID = ""
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
#CMD ["cron", "-f"]
CMD ["/usr/local/bin/entrypoint.sh"]
