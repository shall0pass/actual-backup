# #!/bin/bash
# set -e

# export_vars=$(cat <<EOF
# export ACTUAL_SERVER_PASSWORD=${ACTUAL_SERVER_PASSWORD}
# export ACTUAL_SERVER_URL=${ACTUAL_SERVER_URL}
# export ACTUAL_SYNC_ID=${ACTUAL_SYNC_ID}
# export TZ=${TZ}
# export WEB_PORT=${WEB_PORT}
# export BACKUP_DATA_ROOT=${BACKUP_DATA_ROOT}
# export OIDC_ISSUER=${OIDC_ISSUER}
# export OIDC_CLIENT_ID=${OIDC_CLIENT_ID}
# export OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET}
# export OIDC_REDIRECT_URI=${OIDC_REDIRECT_URI}
# export SESSION_SECRET=${SESSION_SECRET}
# EOF
# )

# cat << EOF > /app/runjob.sh
# #!/bin/bash
# export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# export NODE_TLS_REJECT_UNAUTHORIZED=0
# $export_vars
# cd /app || exit 1
# /usr/local/bin/node /app/src/app.js >> /var/log/cron.log 2>&1
# EOF

# if [ -n "$CRON_SCHEDULE" ]; then
#   echo "$CRON_SCHEDULE root /app/runjob.sh" > /etc/cron.d/mycron
#   chmod 0644 /etc/cron.d/mycron
#   chmod +x /app/runjob.sh
#   crontab /etc/cron.d/mycron
#   touch /var/log/cron.log
# fi

# # Set timezone only when the target file differs from the existing localtime file.
# if [ -n "$TZ" ] && [ -f "/usr/share/zoneinfo/$TZ" ] && ! cmp -s "/usr/share/zoneinfo/$TZ" "/etc/localtime"; then
#   cp "/usr/share/zoneinfo/$TZ" /etc/localtime
# fi

# if [ -n "$CRON_SCHEDULE" ]; then
#   cron -f &
# fi

# cd /app || exit 1
# exec /usr/local/bin/node /app/src/web.js

#!/bin/bash
set -e

# Set timezone only when the target file differs from the existing localtime file.
if [ -n "$TZ" ] && [ -f "/usr/share/zoneinfo/$TZ" ] && ! cmp -s "/usr/share/zoneinfo/$TZ" "/etc/localtime"; then
  cp "/usr/share/zoneinfo/$TZ" /etc/localtime
fi

# Scheduling is handled entirely inside web.js: on boot it reads every saved
# configuration from the state store and registers a node-cron job per
# user/configuration (see scheduler.js's restoreAllSchedules()). There is no
# separate OS-level cron job or standalone backup run anymore — each
# configuration's own CRON_SCHEDULE (set via the web UI) is what drives it.
cd /app || exit 1
exec /usr/local/bin/node /app/src/web.js
