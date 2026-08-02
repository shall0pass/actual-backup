const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const openidClient = require('openid-client');
const { version: appVersion } = require('./package.json');
const { runBackup, loadUserConfig, resolveScopedDir } = require('./app');

const app = express();
const debugEnabled = String(process.env.DEBUG || 'false').toLowerCase() === 'true';
const logPrefix = `[actual-backup v${appVersion}]`;
const port = Number(process.env.WEB_PORT || 3000);
const dataRoot = path.resolve(process.env.BACKUP_DATA_ROOT || './data');
const stateFile = path.join(dataRoot, '.actual-backup-store.json');
const adminUserId = process.env.ADMIN_USER_ID || 'demo-user';

if (debugEnabled) {
  console.log(`${logPrefix} [DEBUG] web.js booting with DEBUG=true`);
}

const oidcConfig = {
  issuer: process.env.OIDC_ISSUER,
  clientId: process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  redirectUri: process.env.OIDC_REDIRECT_URI || `http://localhost:${port}/auth/callback`,
};

const isNonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

let oidcEnabled = Boolean(
  isNonEmpty(oidcConfig.issuer) &&
    isNonEmpty(oidcConfig.clientId) &&
    isNonEmpty(oidcConfig.clientSecret) &&
    isNonEmpty(oidcConfig.redirectUri)
);

let oidcClient = null;

function ensureRuntimeDirs() {
  fs.mkdirSync(dataRoot, { recursive: true });
  if (!fs.existsSync(stateFile)) {
    fs.writeFileSync(stateFile, JSON.stringify({ users: {} }, null, 2));
  }
}

function readState() {
  ensureRuntimeDirs();
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

function writeState(state) {
  ensureRuntimeDirs();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function getUserConfig(userId) {
  const state = readState();
  return state.users?.[userId] || {};
}

const scheduleRegistry = new Map();

function setUserConfig(userId, update) {
  const state = readState();
  state.users = state.users || {};
  state.users[userId] = {
    ...(state.users[userId] || {}),
    ...update,
  };
  writeState(state);
  registerUserSchedule(userId, state.users[userId]);
  return state.users[userId];
}

function registerUserSchedule(userId, config) {
  const normalizedUserId = String(userId || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
  const schedule = String(config.CRON_SCHEDULE || '').trim();
  const taskName = `backup-job-${normalizedUserId}`;

  if (scheduleRegistry.has(taskName)) {
    scheduleRegistry.get(taskName).stop();
    scheduleRegistry.delete(taskName);
  }

  if (!schedule) {
    return;
  }

  const task = cron.schedule(schedule, async () => {
    try {
      await runBackup({ userId, configOverride: config });
    } catch (error) {
      console.error(`${logPrefix} Scheduled backup failed for ${userId}:`, error.message);
    }
  });

  task.start();
  scheduleRegistry.set(taskName, task);
}

async function initializeOidc() {
  if (!oidcEnabled) {
    return null;
  }

  try {
    oidcClient = await openidClient.discovery(
      new URL(oidcConfig.issuer),
      oidcConfig.clientId,
      oidcConfig.clientSecret
    );

    return oidcClient;
  } catch (error) {
    console.error(`${logPrefix} OIDC discovery failed, continuing in demo fallback mode:`, error.message);
    oidcEnabled = false;
    oidcClient = null;
    return null;
  }
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'actual-backup-dev-session',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 4 },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function getUserId(req) {
  return req.session?.userId || 'anonymous';
}

function requireAuth(req, res, next) {
  const userId = getUserId(req);
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Authentication required' });
  }

  return next();
}

function isAdminUser(userId) {
  return userId === adminUserId;
}

function getUserDataDir(userId) {
  const normalizedUserId = String(userId || 'anonymous').replace(/[^a-zA-Z0-9._-]/g, '-');
  const userDataDir = path.join(dataRoot, normalizedUserId);
  fs.mkdirSync(userDataDir, { recursive: true });
  return userDataDir;
}

function ensureUserSchedule(userId) {
  const config = getUserConfig(userId);
  registerUserSchedule(userId, config);
}

function restoreUserSchedules() {
  const state = readState();
  const users = Object.keys(state.users || {});

  for (const userId of users) {
    const config = state.users[userId] || {};
    registerUserSchedule(userId, config);
  }
}

function getBackupList(userId) {
  const userDataDir = getUserDataDir(userId);
  if (!fs.existsSync(userDataDir)) {
    return [];
  }

  return fs
    .readdirSync(userDataDir)
    .filter((entry) => entry.endsWith('.zip'))
    .map((entry) => {
      const fullPath = path.join(userDataDir, entry);
      const stat = fs.statSync(fullPath);
      return {
        name: entry,
        path: fullPath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

function renderDashboard(req, res) {
  const userId = getUserId(req);
  const backups = getBackupList(userId);
  const config = getUserConfig(userId);
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Actual Backup Portal</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; }
      .card { border: 1px solid #d0d7de; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
      a.button { display: inline-block; padding: 0.5rem 1rem; background: #0969da; color: white; text-decoration: none; border-radius: 6px; margin-right: 0.5rem; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border-bottom: 1px solid #d0d7de; padding: 0.5rem; text-align: left; }
      input, textarea { width: 100%; padding: 0.5rem; margin-bottom: 0.5rem; }
      textarea { min-height: 90px; }
    </style>
  </head>
  <body>
    <h1>Actual Backup Portal</h1>
    <div class="card">
      <p><strong>Signed in as:</strong> ${userId}</p>
      <p><strong>OIDC mode:</strong> ${oidcEnabled ? 'enabled' : 'demo fallback'}</p>
      <p><strong>Admin mode:</strong> ${isAdminUser(userId) ? 'yes' : 'no'}</p>
      <a class="button" href="/auth/login">Login</a>
      <a class="button" href="/settings">Settings</a>
      <a class="button" href="/api/run">Run backup</a>
      <a class="button" href="/logout">Logout</a>
    </div>
    <div class="card">
      <h2>Backups</h2>
      <table>
        <thead>
          <tr><th>Name</th><th>Size</th><th>Modified</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${backups.length === 0
            ? '<tr><td colspan="4">No backups found for this user yet.</td></tr>'
            : backups
                .map(
                  (backup) =>
                    `<tr><td>${backup.name}</td><td>${Math.round(backup.size / 1024)} KB</td><td>${backup.modifiedAt}</td><td><a href="/api/backups/${encodeURIComponent(backup.name)}">Download</a></td></tr>`
                )
                .join('')}
        </tbody>
      </table>
    </div>
    <div class="card">
      <h2>Stored config snapshot</h2>
      <pre>${JSON.stringify(config, null, 2)}</pre>
    </div>
  </body>
</html>`;

  res.send(html);
}

app.get('/', (req, res) => {
  renderDashboard(req, res);
});

app.get('/health', (req, res) => {
  res.json({ ok: true, oidcEnabled, userId: getUserId(req) });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/settings', (req, res) => {
  const userId = getUserId(req);
  if (!userId || userId === 'anonymous') {
    return res.redirect('/auth/login');
  }

  const config = getUserConfig(userId);
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Settings</title>
    <style>body{font-family:Arial,sans-serif;margin:2rem;} input,textarea{width:100%;padding:0.5rem;margin:0.4rem 0;} button{padding:0.55rem 1rem;background:#0969da;color:white;border:none;border-radius:6px;} a.button{display:inline-block;padding:0.5rem 1rem;background:#333;color:white;text-decoration:none;border-radius:6px;}</style>
  </head>
  <body>
    <h1>Backup Settings</h1>
    <p>Signed in as: <strong>${userId}</strong></p>
    <a class="button" href="/">Back to dashboard</a>
    <form method="POST" action="/settings">
      <label>Actual Server URL<input name="ACTUAL_SERVER_URL" value="${(config.ACTUAL_SERVER_URL || '').replace(/"/g, '&quot;')}" /></label>
      <label>Actual Server Password<input name="ACTUAL_SERVER_PASSWORD" value="${(config.ACTUAL_SERVER_PASSWORD || '').replace(/"/g, '&quot;')}" /></label>
      <label>Actual Sync ID<input name="ACTUAL_SYNC_ID" value="${(config.ACTUAL_SYNC_ID || '').replace(/"/g, '&quot;')}" /></label>
      <label>Actual Encryption Password<input name="ACTUAL_ENCRYPTION_PASSWORD" value="${(config.ACTUAL_ENCRYPTION_PASSWORD || '').replace(/"/g, '&quot;')}" /></label>
      <label>Cron Schedule<input name="CRON_SCHEDULE" value="${(config.CRON_SCHEDULE || '').replace(/"/g, '&quot;')}" /></label>
      <label>Backup Name<input name="BACKUP_NAME" value="${(config.BACKUP_NAME || '').replace(/"/g, '&quot;')}" /></label>
      <button type="submit">Save Settings</button>
    </form>
  </body>
</html>`;

  res.send(html);
});

app.post('/settings', (req, res) => {
  const userId = getUserId(req);
  if (!userId || userId === 'anonymous') {
    return res.redirect('/auth/login');
  }

  const payload = {
    ACTUAL_SERVER_URL: String(req.body.ACTUAL_SERVER_URL || ''),
    ACTUAL_SERVER_PASSWORD: String(req.body.ACTUAL_SERVER_PASSWORD || ''),
    ACTUAL_SYNC_ID: String(req.body.ACTUAL_SYNC_ID || ''),
    ACTUAL_ENCRYPTION_PASSWORD: String(req.body.ACTUAL_ENCRYPTION_PASSWORD || ''),
    CRON_SCHEDULE: String(req.body.CRON_SCHEDULE || ''),
    BACKUP_NAME: String(req.body.BACKUP_NAME || ''),
  };

  setUserConfig(userId, payload);
  res.redirect('/');
});

app.get('/auth/login', async (req, res) => {
  if (!oidcEnabled) {
    req.session.userId = 'demo-user';
    return res.redirect('/');
  }

  const state = openidClient.randomState();
  const nonce = openidClient.randomNonce();
  req.session.oidcState = state;
  req.session.oidcNonce = nonce;

  const authorizationUrl = openidClient.buildAuthorizationUrl(oidcClient, {
    redirect_uri: oidcConfig.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    nonce,
  });

  res.redirect(authorizationUrl.href);
});

app.get('/auth/callback', async (req, res) => {
  if (!oidcEnabled) {
    req.session.userId = 'demo-user';
    return res.redirect('/');
  }

  try {
    const currentUrl = new URL(req.originalUrl, `${req.protocol}://${req.headers.host}`);
    const tokenSet = await openidClient.authorizationCodeGrant(
      oidcClient,
      currentUrl,
      {
        expectedState: req.session.oidcState,
        nonce: req.session.oidcNonce,
      }
    );

    const claims = tokenSet.claims();
    req.session.userId = claims.sub || claims.email || 'oidc-user';
    req.session.oidcState = null;
    req.session.oidcNonce = null;
    res.redirect('/');
  } catch (error) {
    console.error(`${logPrefix} OIDC callback error:`, error);
    res.status(500).send('OIDC sign-in failed');
  }
});

app.get('/api/config', requireAuth, (req, res) => {
  const userId = getUserId(req);
  res.json({ userId, config: getUserConfig(userId) });
});

app.post('/api/config', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const saved = setUserConfig(userId, req.body || {});
  res.json({ userId, config: saved });
});

app.get('/api/run', requireAuth, async (req, res) => {
  const userId = getUserId(req);

  try {
    const config = loadUserConfig(userId);
    const result = await runBackup({ userId, configOverride: config });
    res.json({ ok: true, userId, result });
  } catch (error) {
    console.error(`${logPrefix} Backup run failed:`, error);
    res.status(500).json({ ok: false, userId, error: error.message });
  }
});

app.get('/api/backups', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const backups = getBackupList(userId);
  res.json({ userId, backups });
});

app.get('/api/backups/:name', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const backupPath = path.join(getUserDataDir(userId), req.params.name);

  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: 'Backup not found' });
  }

  res.download(backupPath);
});

async function start() {
  await initializeOidc();
  restoreUserSchedules();
  app.listen(port, '0.0.0.0', () => {
    console.log(`${logPrefix} ✅ Web portal listening on http://0.0.0.0:${port}`);
    if (debugEnabled) {
      console.log(`${logPrefix} [DEBUG] web.js now serving requests on port`, port);
    }
  });
}

process.on('SIGTERM', () => {
  console.log(`${logPrefix} [DEBUG] web.js received SIGTERM, shutting down gracefully`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`${logPrefix} [DEBUG] web.js received SIGINT, shutting down gracefully`);
  process.exit(0);
});

start().catch((error) => {
  console.error(`${logPrefix} Failed to start web portal:`, error);
  console.error(`${logPrefix} [DEBUG] web.js startup failed, exiting with code 1`);
  process.exit(1);
});
