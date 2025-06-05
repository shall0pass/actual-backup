#!/bin/bash

cat << 'EOF' > /app/runjob.sh
#!/bin/bash
export TZ=$TZ
export ACTUAL_SERVER_URL=$ACTUAL_SERVER_URL
export ACTUAL_SERVER_PASSWORD=$ACTUAL_SERVER_PASSWORD
export ACTUAL_SYNC_ID=$ACTUAL_SYNC_ID
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export NODE_VERSION=$NODE_VERSION
export NODE_TLS_REJECT_UNAUTHORIZED=0
/usr/local/bin/node /app/app.js >> /var/log/cron.log 2>&1
EOF

echo "$CRON_SCHEDULE root /app/runjob.sh" > /etc/cron.d/mycron

# Give execution rights on the cron job
chmod 0644 /etc/cron.d/mycron
chmod +x /app/runjob.sh

# Apply cron job
crontab /etc/cron.d/mycron

# Create the log file for cron
touch /var/log/cron.log

# Start cron
cron -f

# Set timezone
cp /usr/share/zoneinfo/$TZ /etc/localtime
