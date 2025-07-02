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

# Using a docker compose stack for Actual
I use actual-backup and actualtap alongside actualbudget to enhance the functionalities.  I use a docker compose stack with a .env file to simplify deployment and updates.
The repositories for shall0pass/actualtap and shall0pass/actual-backup should auto update when a new release is discovered from actualbudget.  The release versions are kept consistent with upstream actualbudget to make it simple to figure out which tag is needed.
```
services:
  actual:
    container_name: actualbudget
    image: ghcr.io/actualbudget/actual:${TAG}
    ports:
      - 5006:5006
    volumes:
      - ./docker/actual/:/data
    restart: unless-stopped
  actualtap:
    container_name: actualtap
    image: ghcr.io/shall0pass/actualtap:${TAG}
    restart: unless-stopped
    ports:
      - 5106:3001
    volumes:
      - ./docker/actual-tap:/app/data
    environment:
      - TZ=America/Chicago
      - ACTUAL_URL=${ACTUAL_SERVER_URL}
      - ACTUAL_PASSWORD=${ACTUAL_SERVER_PASSWORD}
      - ACTUAL_SYNC_ID=${ACTUAL_SYNC_ID}
      - API_KEY=SECRET API KEY
  actual-backup:
    image: ghcr.io/shall0pass/actual-backup:${TAG}
    container_name: actual-backup
    restart: unless-stopped
    environment:
      - TZ=America/Chicago
      - ACTUAL_SERVER_URL=${ACTUAL_SERVER_URL}
      - ACTUAL_SERVER_PASSWORD=${ACTUAL_SERVER_PASSWORD}
      - ACTUAL_SYNC_ID=${ACTUAL_SYNC_ID}
      - CRON_SCHEDULE=0 0 * * *
    volumes:
      - ./docker/actual-backup:/app/data
networks: {}
```
.env file
```
TAG=25.7.0
ACTUAL_SERVER_URL=https://budget.example.ccom
ACTUAL_SERVER_PASSWORD=YOUR ACTUAL PASSWORD
ACTUAL_SYNC_ID=YOUR BUDGET SYNC ID
```
