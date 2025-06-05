# actual-backup

This is a very basic backup script.  Wherever this container is installed, it can download and create backups according to a defined cron schedule.
The easiest method is to use docker compose. 

The backup will keep the last 10 backups in addition to the last backup from each month.

1. Copy the docker-compose.yml to your preferred installation path, or copy the contents into a program such as portainer or dockge.

2. Edit the docker-compose.yml file.  Define your scheduled backups by editing the cron schedule.  The default setting will back up the budget file once per day at 00:00:00.
   If you're unfamiliar with cron, search for a crontab generator to help you fill in the fields.
   ```
      - CRON_SCHEDULE=0 0 * * *
   ```
   
3. Update your local volume. Replace ***./local_dir*** with a folder path available to your container.
   ```
     volumes:
       - ./local_dir:/app/data  # Mount local directory to /app/data in the container
   ```

3. Edit the .env file
   ```
    ACTUAL_SERVER_URL=https://actual.yourdomain.tld
    ACTUAL_SERVER_PASSWORD=yourpassword
    ACTUAL_SYNC_ID=sync id is found in the advanced settings of your budget
   ```

# Building your own image
If you would prefer to build your own docker image, clone this repository and replace the ***image*** line in the docker-compose.yml file with
  ```
    build:
      context: .
      dockerfile: dockerfile
  ```

# Updating to the next version
Actual tends to release at the beginning of each month.  I may not always be on top of things.  To update this package to the latest API, edit **package.json** and change the version of the API to the current release.
