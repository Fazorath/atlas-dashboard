FROM alpine:3.20

RUN apk add --no-cache curl tzdata

COPY crontab /etc/crontabs/root
COPY sync.sh /usr/local/bin/sync.sh
RUN chmod 0644 /etc/crontabs/root && chmod 0755 /usr/local/bin/sync.sh

# -f foreground, -d 8 logs each job to stderr so `docker logs atlas-cron` is useful.
CMD ["crond", "-f", "-d", "8"]
