# actual-backup

A web-based backup management application for Actual Budget.

`actual-backup` provides an easy way to create, manage, and store backups for an Actual Budget instance. The application includes a web interface for configuring backups, managing retention policies, and monitoring backup status.

## Features

- Web-based management interface
- Backup scheduling through the UI
- Configurable retention policies
- Local backup storage
- Docker and Docker Compose support
- Local authentication
- Optional OpenID Connect (OIDC) authentication
- Persistent backup storage through Docker volumes

## Managing Backups

Once logged in, all backup configuration is performed through the web interface:

- Connect your Actual Budget instance
- Configure backup schedules
- Configure backup retention policies
- View backup history
- Download backups as needed

No cron configuration is required in Docker Compose.

## Versioning Policy

`actual-backup` follows the release versions of upstream Actual Budget whenever possible.

For example:

| Actual Budget | actual-backup |
|--------------|---------------|
| 25.7.0 | 25.7.0 |
| 25.8.0 | 25.8.0 |

This versioning strategy makes it easy to identify compatible releases when deploying or upgrading your Actual Budget stack.

When running multiple companion services, such as:

- Actual Budget
- actual-backup
- actualtap

you can typically use the same version tag across all containers:

```yaml
services:
  actual:
    image: ghcr.io/actualbudget/actual:${TAG}

  actual-backup:
    image: ghcr.io/shall0pass/actual-backup:${TAG}

  actualtap:
    image: ghcr.io/shall0pass/actualtap:${TAG}
    
---

## Authentication

`actual-backup` requires at least one authentication method to be configured.

You can use:

- Local administrator authentication
- OpenID Connect (OIDC)
- Both local authentication and OIDC

### Single-User Deployment

For a simple personal deployment, configure a local administrator account:

```env
ADMIN_USER=admin
ADMIN_PASSWORD=your-secure-password
```

### Multi-User Deployment

For multi-user environments, configure an OpenID Connect provider:

```env
OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=actual-backup
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://backup.example.com/auth/callback
```

### Combined Deployment

Both authentication methods can be enabled simultaneously:

```env
ADMIN_USER=admin
ADMIN_PASSWORD=your-secure-password

OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=actual-backup
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://backup.example.com/auth/callback
```

### Important

At least one authentication method must be configured:

- ✅ Local administrator account only
- ✅ OIDC only
- ✅ Local administrator account and OIDC
- ❌ Neither local authentication nor OIDC

---

## Quick Start

### Docker Compose

```yaml
services:
  actual-backup:
    build:
      context: .
      dockerfile: dockerfile

    container_name: actual-backup

    ports:
      - "3000:3000"

    environment:
      - TZ=America/Chicago
      - DEBUG=${DEBUG:-false}
      - WEB_PORT=3000
      - BACKUP_DATA_ROOT=/app/data

      - OIDC_ISSUER=${OIDC_ISSUER:-}
      - OIDC_CLIENT_ID=${OIDC_CLIENT_ID:-}
      - OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET:-}
      - OIDC_REDIRECT_URI=${OIDC_REDIRECT_URI:-http://localhost:3000/auth/callback}

      - SESSION_SECRET=${SESSION_SECRET:-actual-backup-dev-session}

      - ADMIN_USER=${ADMIN_USER}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}

    volumes:
      - ./local_dir:/app/data
```

Start the application:

```bash
docker compose up -d
```

Then open:

```text
http://localhost:3000
```

---

## Configuration

### General Settings

```env
DEBUG=false
WEB_PORT=3000
BACKUP_DATA_ROOT=/app/data
TZ=America/Chicago
SESSION_SECRET=replace-with-random-string
```

| Variable | Description | Default |
|-----------|-------------|---------|
| `DEBUG` | Enable debug logging | `false` |
| `WEB_PORT` | Web application port | `3000` |
| `BACKUP_DATA_ROOT` | Root directory for backup storage | `/app/data` |
| `TZ` | Container timezone | Container default |
| `SESSION_SECRET` | Secret used for session encryption | Required for production |

---

## OpenID Connect (OIDC)

OIDC support allows users to authenticate through an external identity provider such as:

- Authentik
- Keycloak
- Microsoft Entra ID
- Authelia
- Any standards-compliant OIDC provider

### OIDC Configuration

```env
OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=actual-backup
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://backup.example.com/auth/callback
```

### Example: Authentik

```env
OIDC_ISSUER=https://auth.example.com/application/o/actual-backup/
OIDC_CLIENT_ID=actual-backup
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://backup.example.com/auth/callback
```

---

## Storage

Backup data is stored in the directory mapped to:

```yaml
volumes:
  - ./local_dir:/app/data
```

Replace `./local_dir` with a persistent path on your host system.

Example:

```yaml
volumes:
  - ./backup-data:/app/data
```

---

## Example `.env`

### Local Authentication Only

```env
ADMIN_USER=admin
ADMIN_PASSWORD=change-me

SESSION_SECRET=replace-with-a-random-string
```

### OIDC Only

```env
OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=actual-backup
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://backup.example.com/auth/callback

SESSION_SECRET=replace-with-a-random-string
```

### Local Authentication and OIDC

```env
ADMIN_USER=admin
ADMIN_PASSWORD=change-me

OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=actual-backup
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://backup.example.com/auth/callback

SESSION_SECRET=replace-with-a-random-string
```

---

## Building Your Own Image

Clone the repository and build locally:

```bash
git clone https://github.com/shall0pass/actual-backup.git

cd actual-backup

docker compose up -d --build
```

---

## Security Recommendations

- Configure at least one authentication method before deployment.
- Use a strong, unique `SESSION_SECRET`.
- Use HTTPS when exposing the application to the internet.
- Restrict access to backup storage directories.
- Consider using OIDC for multi-user deployments.
- Periodically verify that backups can be successfully restored.

---

## License

See the repository license for details.