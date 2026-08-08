# actual-backup

A self-hosted backup tool for [Actual Budget](https://actualbudget.org/), with a mobile-friendly web UI.

Point it at one or more Actual budgets, set a schedule and a retention policy for each, and it downloads, compresses, and prunes backups automatically — no cron expressions in your `docker-compose.yml`, no editing env vars to add a second budget.

**Features**

- **Web UI** for setup and day-to-day use: add/edit/delete budget configurations, trigger a manual backup, download or delete individual backup files, all from your phone or desktop.
- **Multiple budget configurations per install.** Back up as many Actual budgets as you like from one container — each with its own server URL, sync ID, schedule, and retention policy, stored in its own subdirectory so nothing collides.
- **Per-configuration scheduling.** Pick a time and days from a simple picker, or drop in a raw cron expression if you need something more specific. Runs entirely inside the app — no OS-level cron.
- **Configurable retention policy** per configuration: keep the last *N* backups, and optionally always keep one per month and/or one per year.
- **Authentication**: sign in with a username/password you set, and/or SSO via any OIDC provider (Authelia, Authentik, Keycloak, etc.).

---

## Quick start (docker compose)

1. Copy `docker-compose.yml` (below) to your preferred install path, or paste its contents into Portainer/Dockge.

2. Give it somewhere to store its data and backups:

   ```yaml
   volumes:
     - ./local_dir:/app/data  # mount a local directory to /app/data in the container
   ```

3. Publish the web UI port and set a session secret:

   ```yaml
   ports:
     - "3000:3000"
   environment:
     - SESSION_SECRET=some-long-random-string   # used to sign the login session cookie
   ```

4. Set up a way to log in — pick one or both:

   - **Local username/password** (simplest):
     ```yaml
     environment:
       - ADMIN_USERNAME=admin
       - ADMIN_PASSWORD=change-me
     ```
   - **OIDC / SSO**:
     ```yaml
     environment:
       - OIDC_ISSUER=https://sso.yourdomain.tld
       - OIDC_CLIENT_ID=actual-backup
       - OIDC_CLIENT_SECRET=your-client-secret
       - OIDC_REDIRECT_URI=https://backup.yourdomain.tld
     ```
     `OIDC_REDIRECT_URI` just needs your app's base URL — `/auth/callback` is appended automatically.

   If neither is configured, no one will be able to log in — set at least one.

5. Start the container, open `http://<host>:3000` (or your `OIDC_REDIRECT_URI`), and log in.

6. Click **+ Add budget configuration** and fill in:
   - **Configuration name** — a label for this budget (e.g. "Personal Budget"), shown throughout the UI.
   - **Actual Server URL / Password / Sync ID** — the Sync ID is in your budget's Advanced Settings in Actual.
   - **Actual Encryption Password** — only if the budget itself is end-to-end encrypted.
   - **Backup Schedule** — pick a time and days, or check "Use a custom cron expression instead" for full control. Leave all days unchecked to run daily.
   - **Retention Policy** — how many recent backups to keep, and whether to always keep one per month/year.

   Repeat for as many budgets as you want backed up — each gets its own card on the dashboard with its own schedule, backup history, and controls.

> **Note:** budget credentials, schedules, and retention settings are configured entirely through the web UI now (stored in `/app/data/.actual-backup-store.json`). `ACTUAL_SERVER_URL`, `ACTUAL_SERVER_PASSWORD`, `ACTUAL_SYNC_ID`, and `CRON_SCHEDULE` are no longer read from the environment — if you're upgrading from an older version that used those, add your budget again through the UI.

### `docker-compose.yml`

```yaml
services:
  actual-backup:
    image: ghcr.io/shall0pass/actual-backup:latest
    container_name: actual-backup
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - TZ=America/Chicago
      - SESSION_SECRET=some-long-random-string
      - ADMIN_USERNAME=admin
      - ADMIN_PASSWORD=change-me
    volumes:
      - ./local_dir:/app/data
```

---

## Environment variables

| Variable | Required? | Description |
|---|---|---|
| `WEB_PORT` | No (default `3000`) | Port the web UI listens on inside the container. |
| `BACKUP_DATA_ROOT` | No (default `/app/data`) | Where state and backup files are stored. Mount this as a volume. |
| `TZ` | No (default `Etc/UTC`) | Timezone used for the container clock — affects when scheduled backups actually fire and how backup filenames/timestamps read. |
| `SESSION_SECRET` | Recommended | Used to sign the login session cookie. Set your own; if omitted, a hardcoded development default is used. |
| `ADMIN_USERNAME` / `ADMIN_USERNAME_FILE` | For local login | Username for local sign-in. The `_FILE` variant reads the value from a file (e.g. a Docker secret). |
| `ADMIN_PASSWORD` / `ADMIN_PASSWORD_FILE` | For local login | Password for local sign-in. Same `_FILE` support as above. |
| `ADMIN_USER_ID` | No (default `demo-user`) | Internal user ID assigned to whoever logs in locally. Only matters if you're inspecting `state.json` directly. |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` | For SSO login | Standard OIDC client settings. All four must be set for SSO to activate. |
| `DEBUG` | No | Set to `true` for verbose startup logging. |
| `NODE_TLS_REJECT_UNAUTHORIZED` | No | TLS certificate verification is on by default. Only set this to `0` if your Actual server uses a self-signed certificate you can't otherwise trust — it disables certificate checking for **all** outbound HTTPS requests the app makes (including OIDC), so treat it as a last resort, not a default. |

Everything budget-specific (server URL, password, sync ID, encryption password, schedule, retention) is set per-configuration in the web UI, not via environment variables.

---

## Building your own image

If you'd rather build the image yourself, clone this repository and replace the `image` line in `docker-compose.yml` with:

```yaml
    build:
      context: .
      dockerfile: Dockerfile
```

---

## Using a docker compose stack for Actual

I run `actual-backup` and [actualtap](https://github.com/shall0pass/actualtap) alongside Actual Budget itself, using a docker compose stack with a `.env` file to simplify deployment and updates. The `shall0pass/actualtap` and `shall0pass/actual-backup` images auto-update when a new release is discovered from upstream Actual Budget, and release versions are kept consistent with upstream so it's simple to tell which tag lines up with which.

`actualtap` still reads its Actual connection details from the environment, as before. `actual-backup` no longer does — after the stack is up, open its web UI and add a budget configuration there, using the same URL/password/sync ID as in `.env`.

```yaml
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
    ports:
      - 3000:3000
    environment:
      - TZ=America/Chicago
      - SESSION_SECRET=${BACKUP_SESSION_SECRET}
      - ADMIN_USERNAME=${BACKUP_ADMIN_USERNAME}
      - ADMIN_PASSWORD=${BACKUP_ADMIN_PASSWORD}
    volumes:
      - ./docker/actual-backup:/app/data
networks: {}
```

`.env` file:

```
TAG=25.8.0
ACTUAL_SERVER_URL=https://budget.example.com
ACTUAL_SERVER_PASSWORD=YOUR ACTUAL PASSWORD
ACTUAL_SYNC_ID=YOUR BUDGET SYNC ID
BACKUP_SESSION_SECRET=some-long-random-string
BACKUP_ADMIN_USERNAME=admin
BACKUP_ADMIN_PASSWORD=change-me
```

After `docker compose up -d`, open `http://<host>:3000`, log in with `BACKUP_ADMIN_USERNAME` / `BACKUP_ADMIN_PASSWORD`, and add a budget configuration using the same `ACTUAL_SERVER_URL`, `ACTUAL_SERVER_PASSWORD`, and `ACTUAL_SYNC_ID` values from `.env`.