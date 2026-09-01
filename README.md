***Breaking Change*** -- As of 26.8.1, a new web ui interface has been added with OIDC support. Follow the instructions below to set up the docker image correctly.

# actual-backup

A self-hosted backup tool for [Actual Budget](https://actualbudget.org/), with a mobile-friendly web UI.

Point it at one or more Actual budgets, set a schedule and a retention policy for each, and it downloads, compresses, and prunes backups automatically — no cron expressions in your `docker-compose.yml`, no editing env vars to add a second budget.

**Features**

- **Web UI** for setup and day-to-day use: add/edit/delete budget configurations, trigger a manual backup, download or delete individual backup files, all from your phone or desktop.
- **Multiple budget configurations per install.** Back up as many Actual budgets as you like from one container — each with its own server URL, sync ID, schedule, and retention policy, stored in its own subdirectory so nothing collides.
- **Per-configuration scheduling.** Pick a time and days from a simple picker, or drop in a raw cron expression if you need something more specific. Runs entirely inside the app — no OS-level cron.
- **Configurable retention policy** per configuration: keep the last *N* backups, and optionally always keep one per month and/or one per year.
- **Authentication**: sign in with a username/password you set, and/or SSO via any OIDC provider (Authelia, Authentik, Keycloak, etc.).
- **Tap-to-Pay ([ActualTap](https://github.com/MattFaz/actualtap))**: automatically create Actual transactions when you tap to pay with your phone. Enable it per user and per budget from the web UI, then point iOS Shortcuts, Android Tasker/Automate, or Home Assistant at the built-in API — no separate container needed.

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
       - OIDC_SCOPES=openid profile email
     ```
     `OIDC_REDIRECT_URI` just needs your app's base URL — `/auth/callback` is appended automatically. `OIDC_SCOPES` is optional — it defaults to `openid profile email`; override it if your provider needs additional scopes (e.g. `openid profile email groups`). `openid` is always requested even if you omit it.

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
| `OIDC_SCOPES` | No (default `openid profile email`) | Space-separated scopes requested during login. `openid` is always included even if omitted. |
| `DEBUG` | No | Set to `true` for verbose startup logging. |
| `NODE_TLS_REJECT_UNAUTHORIZED` | No | TLS certificate verification is on by default. Only set this to `0` if your Actual server uses a self-signed certificate you can't otherwise trust — it disables certificate checking for **all** outbound HTTPS requests the app makes (including OIDC), so treat it as a last resort, not a default. |

Everything budget-specific (server URL, password, sync ID, encryption password, schedule, retention) is set per-configuration in the web UI, not via environment variables.

---

## Tap-to-Pay (ActualTap)

Automatically create an Actual transaction whenever you tap to pay with your phone. This was originally a separate project, [ActualTap](https://github.com/MattFaz/actualtap) by MattFaz — it's now built directly into actual-backup instead of running as its own container.

### Enabling it

1. On the actual-backup dashboard, open the **Tap-to-Pay (ActualTap)** card, check **Enable tap-to-pay for my account**, and click **Generate** to create your user key.
2. On each budget you want to post transactions to, open that budget's settings page, check **Enable tap-to-pay for this budget**, and generate a budget key there too.
3. Combine both halves into one API key: `<user key>-<budget key>`. This lets one user run tap-to-pay against multiple budgets — same user key, a different budget key per device/automation.

### API

```
POST https://<your-domain>/transaction
X-API-KEY: <user key>-<budget key>
Content-Type: application/json
```

```json
{
  "account": "Checking",
  "amount": 10.5,
  "payee": "Starbucks",
  "type": "payment",
  "date": "2026-07-01"
}
```

| Field | Required? | Description |
|---|---|---|
| `account` | Yes | Name of the account in Actual Budget (exact match, case-insensitive). |
| `amount` | No (default `0`) | Transaction amount. |
| `payee` | No (default "Unknown") | Payee name. |
| `type` | No (default `payment`) | `payment` or `deposit`. |
| `date` | No (defaults to today) | `YYYY-MM-DD`. |

```bash
curl -X POST https://backup.yourdomain.com/transaction \
  -H "X-API-KEY: your-user-key-your-budget-key" \
  -H "Content-Type: application/json" \
  -d '{"account": "Checking", "amount": 10.50, "payee": "Starbucks"}'
```

### Mobile & automation setup

- **iOS** — use [Shortcuts](https://apps.apple.com/us/app/shortcuts/id915249334) triggered by a Wallet automation. [Install the shortcut](https://www.icloud.com/shortcuts/7d77085c7cab4278933fc6666d227fe7), fill in the fallback account and the card→account name mapping, then create a Wallet-triggered Automation that runs it with a Dictionary input (`URL`, `API_KEY`, `card_name`, `Merchant`, `Name`, `Amount`).
- **Android (Tasker)** — install the **Notification** addon, import the "Wallet to ActualBudget" task from Taskernet, then edit its HTTP Request step: point the URL at your `/transaction` endpoint, add the combined API key as a header, and strip the `[ ]` brackets from the body.
- **Android (Automate by LlamaLabs)** — import [flo #50847](https://llamalab.com/automate/community/flows/50847), then edit the HTTP request block with your endpoint and API key.
- **Home Assistant** — enable the "Last Notification" sensor for your wallet app in the companion app (Settings → Companion App → Manage Sensors → Last Notification), then define the `rest_command` and the automation that calls it:

  ```yaml
  # configuration.yaml
  rest_command:
    actualbudget:
      url: "https://backup.yourdomain.com/transaction"
      method: post
      content_type: 'application/json'
      headers:
        X-API-KEY: !secret actualtap_api
      payload: '{"account": "{{accountVar}}", "amount": "{{amountVar}}", "date": "{{dateVar}}", "payee": "{{payeeVar}}", "notes": "{{notesVar}}"}'
  ```

  ```yaml
  # secrets.yaml
  actualtap_api: your-user-key-your-budget-key
  ```

  Then build the automation itself, either in the UI (**Settings → Automations & Scenes → Create Automation**) or in YAML. For Android/Google Wallet, the notification's merchant and amount come through as the `android.title`/`android.text` attributes on that sensor, so parse them from there rather than the sensor's plain state:

  ```yaml
  # automations.yaml
  - alias: Google Wallet Transaction Automation
    description: ""
    triggers:
      - entity_id: sensor.your_device_last_notification
        trigger: state
    actions:
      - data:
          accountVar: >
            {% set text = state_attr('sensor.your_device_last_notification',
            'android.text') %} {% if text %}
              {{ text.split(' with ')[1] if ' with ' in text else 'Unknown Account' }}
            {% else %}
              'Unknown Account'
            {% endif %}
          amountVar: >
            {% set text = state_attr('sensor.your_device_last_notification',
            'android.text') %} {% if text %}
              {% set match = text | regex_findall('\$([0-9]+\.[0-9]{2})') %}
              {{ match[0] if match else '0.00' }}
            {% else %}
              '0.00'
            {% endif %}
          dateVar: "{{ now().date() }}"
          payeeVar: >-
            {{ state_attr('sensor.your_device_last_notification', 'android.title')
            }}
          notesVar: Added with Home Assistant
        response_variable: httpresponse
        action: rest_command.actualbudget
      - data:
          level: info
          message: "REST Response: {{ httpresponse }}"
        action: system_log.write
  ```

  Swap `sensor.your_device_last_notification` for your device's actual "Last Notification" sensor, and adjust the `android.text` splits to match the wording your wallet app's notifications actually use — check **Settings → Automations & Scenes → \[your automation\] → Traces** to see the real attribute values. The `system_log.write` step logs the REST response so you can confirm the transaction posted (or see the error) from **Settings → System → Logs**.

  Wallet notification wording varies by phone, OS version, and card issuer, so use **Settings → Automations & Scenes → \[your automation\] → Traces** to inspect the actual `trigger.to_state.state` text and adjust the `payee`/`amount` templates to match before trusting it with real transactions.

Renaming a card in Google Wallet/iOS Wallet to match its Actual account name makes multi-card mapping simpler. Step-by-step field mapping for all of the above lives in the dashboard's Tap-to-Pay help panel, next to the toggle.

### Reverse proxy

`/transaction` is served by actual-backup itself (same container, same port as the web UI) and authenticates every request with the combined API key above, so no separate port or proxy-level key check is needed:

```
backup.yourdomain.com {
    reverse_proxy actual-backup:3000
}
```

### Troubleshooting

- **`401 Unauthorized`** — the `X-API-KEY` header isn't `<user key>-<budget key>` exactly as shown on the dashboard and that budget's settings page, or one of the two enable toggles is off.
- **`Account '[name]' not found`** — the `account` field must match an account name in that budget exactly (case-insensitive) — check for typos or extra spaces.
- **`"[date]" is not a valid calendar date`** — `date` must be `YYYY-MM-DD` and a real calendar date.

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

I run `actual-backup` alongside Actual Budget itself, using a docker compose stack with a `.env` file to simplify deployment and updates. The `shall0pass/actual-backup` image auto-updates when a new release is discovered from upstream Actual Budget, and release versions are kept consistent with upstream so it's simple to tell which tag lines up with which.

Budget connection details (URL, password, sync ID) and tap-to-pay are configured entirely through the `actual-backup` web UI — there's no separate `actualtap` container or environment variables to keep in sync anymore.

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
BACKUP_SESSION_SECRET=some-long-random-string
BACKUP_ADMIN_USERNAME=admin
BACKUP_ADMIN_PASSWORD=change-me
```

After `docker compose up -d`, open `http://<host>:3000`.
 1. Log in with `BACKUP_ADMIN_USERNAME` / `BACKUP_ADMIN_PASSWORD` OR
 log in with an OIDC provider.

 2. Add a budget configuration using your Actual server's URL, password, and sync ID.
