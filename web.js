const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const openidClient = require('openid-client');
const { version: appVersion } = require('./package.json');
const { runBackup, loadUserConfig, resolveScopedDir } = require('./app');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);
const debugEnabled = String(process.env.DEBUG || 'false').toLowerCase() === 'true';
const logPrefix = `[actual-backup v${appVersion}]`;
const port = Number(process.env.WEB_PORT || 3000);
const dataRoot = path.resolve(process.env.BACKUP_DATA_ROOT || './data');
const stateFile = path.join(dataRoot, '.actual-backup-store.json');
const sessionStorePath = path.join(dataRoot, '.sessions');
const adminUserId = process.env.ADMIN_USER_ID || 'demo-user';

function normalizeRedirectUri(rawRedirectUri) {
  const candidate = String(rawRedirectUri || '').trim();
  if (!candidate) {
    return `http://localhost:${port}/auth/callback`;
  }

  if (candidate.endsWith('/auth/callback')) {
    return candidate;
  }

  if (candidate.endsWith('/')) {
    return `${candidate}auth/callback`;
  }

  return `${candidate}/auth/callback`;
}

const oidcConfig = {
  issuer: process.env.OIDC_ISSUER,
  clientId: process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  redirectUri: normalizeRedirectUri(process.env.OIDC_REDIRECT_URI),
};

if (debugEnabled) {
  console.log(`${logPrefix} [DEBUG] web.js booting with DEBUG=true`);
  if (process.env.OIDC_REDIRECT_URI) {
    console.log(`${logPrefix} [DEBUG] OIDC redirect URI normalized to ${oidcConfig.redirectUri}`);
  }
}

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

fs.mkdirSync(sessionStorePath, { recursive: true });

app.use(
  session({
    store: new FileStore({
      path: sessionStorePath,
      logFn: () => {},
      ttl: 60 * 60 * 4,
    }),
    secret: process.env.SESSION_SECRET || 'actual-backup-dev-session',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: String(process.env.OIDC_REDIRECT_URI || '').startsWith('https://'),
      maxAge: 1000 * 60 * 60 * 4,
    },
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

function renderDashboard(req, res, options = {}) {
  const userId = getUserId(req);

  if (!userId || userId === 'anonymous') {
    const loginError = options.loginError || '';
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Actual Backup Portal</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; }
      .card { border: 1px solid #d0d7de; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
      a.button, button.button { display: inline-block; padding: 0.5rem 1rem; background: #0969da; color: white; text-decoration: none; border-radius: 6px; margin-right: 0.5rem; border: none; cursor: pointer; font-size: 1rem; }
      input { width: 100%; padding: 0.5rem; margin: 0.4rem 0; }
      .error { color: #cf222e; }
    </style>
  </head>
  <body>
    <h1>Actual Backup Portal</h1>
    ${oidcEnabled ? `
    <div class="card">
      <p>Please sign in to access your backup settings and backup history.</p>
      <a class="button" href="/auth/login">Login with SSO</a>
    </div>` : ''}
    ${localAuthEnabled ? `
    <div class="card">
      <p>Admin login</p>
      ${loginError ? `<p class="error">${loginError}</p>` : ''}
      <form method="POST" action="/auth/local-login">
        <label>Username<input name="username" autocomplete="username" /></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" /></label>
        <button class="button" type="submit">Login</button>
      </form>
    </div>` : ''}
  </body>
</html>`;

    return res.send(html);
  }

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
      <p><strong>Signed in as:</strong> ${getDisplayName(req)}</p>
      <p><strong>OIDC mode:</strong> ${oidcEnabled ? 'enabled' : 'demo fallback'}</p>
      <p><strong>Admin mode:</strong> ${isAdminUser(userId) ? 'yes' : 'no'}</p>
      <a class="button" href="/settings">Settings</a>
      <a class="button" href="/api/run">Run backup</a>
      <a class="button" href="/logout">Logout</a>
    </div>
	<div class="card">
	  <h2>Backups</h2>
	  <form method="POST" action="/backups/delete">
		<table>
		  <thead>
			<tr><th></th><th>Name</th><th>Size</th><th>Modified</th><th>Action</th></tr>
		  </thead>
		  <tbody>
			${backups.length === 0
			  ? '<tr><td colspan="5">No backups found for this user yet.</td></tr>'
			  : backups
				  .map(
					(backup) =>
					  `<tr><td><input type="checkbox" name="names" value="${backup.name.replace(/"/g, '&quot;')}" /></td><td>${backup.name}</td><td>${Math.round(backup.size / 1024)} KB</td><td>${backup.modifiedAt}</td><td><a href="/api/backups/${encodeURIComponent(backup.name)}">Download</a></td></tr>`
				  )
				  .join('')}
		  </tbody>
		</table>
		${backups.length > 0
		  ? `<button type="submit" class="button" style="margin-top:0.5rem;" onclick="return confirm('Delete selected backups? This cannot be undone.');">Delete selected</button>`
		  : ''}
	  </form>
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
  const parsedCron = parseCronForUI(config.CRON_SCHEDULE);
  const cronTimeValue = parsedCron.mode === 'simple'
    ? `${pad2(parsedCron.hour)}:${pad2(parsedCron.minute)}`
    : '02:00';
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Settings</title>
    <style>body{font-family:Arial,sans-serif;margin:2rem;} input,textarea{width:100%;padding:0.5rem;margin:0.4rem 0;} button{padding:0.55rem 1rem;background:#0969da;color:white;border:none;border-radius:6px;} a.button{display:inline-block;padding:0.5rem 1rem;background:#333;color:white;text-decoration:none;border-radius:6px;}</style>
  </head>
  <body>
    <h1>Backup Settings</h1>
    <p>Signed in as: <strong>${getDisplayName(req)}</strong></p>
    <a class="button" href="/">Back to dashboard</a>
    <form method="POST" action="/settings">
      <label>Actual Server URL<input name="ACTUAL_SERVER_URL" value="${(config.ACTUAL_SERVER_URL || '').replace(/"/g, '&quot;')}" /></label>
      <label>Actual Server Password<input name="ACTUAL_SERVER_PASSWORD" value="${(config.ACTUAL_SERVER_PASSWORD || '').replace(/"/g, '&quot;')}" /></label>
      <label>Actual Sync ID<input name="ACTUAL_SYNC_ID" value="${(config.ACTUAL_SYNC_ID || '').replace(/"/g, '&quot;')}" /></label>
      <label>Actual Encryption Password<input name="ACTUAL_ENCRYPTION_PASSWORD" value="${(config.ACTUAL_ENCRYPTION_PASSWORD || '').replace(/"/g, '&quot;')}" /></label>
      <div class="cron-picker">
        <label>Backup Schedule</label>

        <div id="simpleSchedule" style="${parsedCron.mode === 'advanced' ? 'display:none;' : ''}">
          <label>Run at <input type="time" id="cronTime" value="${cronTimeValue}" /></label>
          <div class="days">
            ${DAY_LABELS.map((label, i) => `
              <label style="display:inline-block;margin-right:0.75rem;width:auto;">
                <input type="checkbox" class="cron-day" value="${i}" ${parsedCron.mode === 'simple' && parsedCron.days.includes(i) ? 'checked' : ''} />
                ${label}
              </label>
            `).join('')}
          </div>
          <p style="color:#666;font-size:0.85rem;">Leave all days unchecked to run every day.</p>
        </div>

        <div id="advancedSchedule" style="${parsedCron.mode === 'advanced' ? '' : 'display:none;'}">
          <textarea id="cronRaw" placeholder="e.g. 0 2 * * *">${parsedCron.mode === 'advanced' ? parsedCron.raw.replace(/</g, '&lt;') : ''}</textarea>
        </div>

		<label>Keep most recent backups<input type="number" min="1" name="RETENTION_KEEP_COUNT" value="${config.RETENTION_KEEP_COUNT || 10}" /></label>
		<label style="display:block;">
		  <input type="checkbox" name="RETENTION_KEEP_MONTHLY" ${config.RETENTION_KEEP_MONTHLY === false || config.RETENTION_KEEP_MONTHLY === 'false' ? '' : 'checked'} style="width:auto;display:inline-block;margin-right:0.4rem;" />
		  Keep one backup per month
		</label>

		<label style="display:block;">
		  <input type="checkbox" name="RETENTION_KEEP_YEARLY" ${config.RETENTION_KEEP_YEARLY === false || config.RETENTION_KEEP_YEARLY === 'false' ? '' : 'checked'} style="width:auto;display:inline-block;margin-right:0.4rem;" />
		  Keep one backup per year
		</label>

        <label style="display:block;margin-top:0.25rem;">
          <input type="checkbox" id="advancedToggle" ${parsedCron.mode === 'advanced' ? 'checked' : ''} style="width:auto;display:inline-block;margin-right:0.4rem;" />
          Use a custom cron expression instead
        </label>

        <input type="hidden" name="CRON_SCHEDULE" id="CRON_SCHEDULE" value="${(config.CRON_SCHEDULE || '').replace(/"/g, '&quot;')}" />
      </div>
      <button type="submit">Save Settings</button>
    </form>
	<script>
    const advancedToggle = document.getElementById('advancedToggle');
    const simpleSchedule = document.getElementById('simpleSchedule');
    const advancedSchedule = document.getElementById('advancedSchedule');
    const cronHidden = document.getElementById('CRON_SCHEDULE');
    const cronTime = document.getElementById('cronTime');
    const cronRaw = document.getElementById('cronRaw');
    const dayBoxes = document.querySelectorAll('.cron-day');

    advancedToggle.addEventListener('change', () => {
      simpleSchedule.style.display = advancedToggle.checked ? 'none' : '';
      advancedSchedule.style.display = advancedToggle.checked ? '' : 'none';
    });

    document.querySelector('form').addEventListener('submit', () => {
      if (advancedToggle.checked) {
        cronHidden.value = cronRaw.value.trim();
        return;
      }

      const [hour, minute] = (cronTime.value || '02:00').split(':');
      const days = Array.from(dayBoxes).filter((box) => box.checked).map((box) => box.value);
      const dayField = days.length ? days.join(',') : '*';
      cronHidden.value = Number(minute) + ' ' + Number(hour) + ' * * ' + dayField;
    });
  </script>
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
	RETENTION_KEEP_COUNT: String(req.body.RETENTION_KEEP_COUNT || '10'),
	RETENTION_KEEP_MONTHLY: req.body.RETENTION_KEEP_MONTHLY === 'on' ? 'true' : 'false',
	RETENTION_KEEP_YEARLY: req.body.RETENTION_KEEP_YEARLY === 'on' ? 'true' : 'false',
	};

  setUserConfig(userId, payload);
  res.redirect('/');
});

app.get('/auth/login', async (req, res) => {
  if (!oidcEnabled) {
    return res.status(404).send('OIDC login is not configured');
  }

  const codeVerifier = openidClient.randomPKCECodeVerifier();
  const codeChallenge = await openidClient.calculatePKCECodeChallenge(codeVerifier);
  const state = openidClient.randomState();
  const nonce = openidClient.randomNonce();

  req.session.oidcState = state;
  req.session.oidcNonce = nonce;
  req.session.oidcCodeVerifier = codeVerifier;

  const authorizationUrl = openidClient.buildAuthorizationUrl(oidcClient, {
    redirect_uri: oidcConfig.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  res.redirect(authorizationUrl.href);
});

app.post('/auth/local-login', (req, res) => {
  if (!localAuthEnabled) {
    return res.status(404).send('Local login is not configured');
  }

  const { username, password } = req.body || {};
  const usernameMatches = isNonEmpty(username) && safeCompare(username, localAuthUsername);
  const passwordMatches = isNonEmpty(password) && safeCompare(password, localAuthPassword);

  if (!usernameMatches || !passwordMatches) {
    return renderDashboard(req, res, { loginError: 'Invalid username or password' });
  }

  req.session.userId = adminUserId;
  req.session.displayName = localAuthUsername;
  res.redirect('/');
});

app.get('/auth/callback', async (req, res) => {
  if (!oidcEnabled) {
    return res.status(404).send('OIDC login is not configured');
  }

  try {
    const currentUrl = new URL(req.originalUrl, `${req.protocol}://${req.headers.host}`);
    const tokenSet = await openidClient.authorizationCodeGrant(
      oidcClient,
      currentUrl,
      {
        pkceCodeVerifier: req.session.oidcCodeVerifier,
        expectedState: req.session.oidcState,
        expectedNonce: req.session.oidcNonce,
      }
    );

    const claims = tokenSet.claims();
    req.session.userId = claims.sub || claims.email || 'oidc-user';
    req.session.displayName = resolveDisplayName(claims, req.session.userId);
    req.session.oidcState = null;
    req.session.oidcNonce = null;
    req.session.oidcCodeVerifier = null;
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

app.post('/backups/delete', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const userDataDir = getUserDataDir(userId);

  let names = req.body.names || [];
  if (!Array.isArray(names)) {
    names = [names];
  }

  let deletedCount = 0;
  for (const rawName of names) {
    const safeName = path.basename(String(rawName)); // strip any path traversal attempt
    if (!safeName.endsWith('.zip')) continue;

    const filePath = path.join(userDataDir, safeName);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    } catch (error) {
      console.error(`${logPrefix} Failed to delete backup ${safeName} for ${userId}:`, error.message);
    }
  }

  res.redirect(`/?deleteStatus=${deletedCount > 0 ? 'success' : 'none'}&deleteCount=${deletedCount}`);
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

function resolveDisplayName(claims, fallbackUserId) {
  return (
    claims.preferred_username ||
    claims.nickname ||
    claims.name ||
    claims.email ||
    fallbackUserId
  );
}

function getDisplayName(req) {
  return req.session?.displayName || getUserId(req);
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseCronForUI(cron) {
  const trimmed = String(cron || '').trim();
  if (!trimmed) {
    return { mode: 'simple', hour: 2, minute: 0, days: [] };
  }

  const match = trimmed.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(\*|[0-6](?:,[0-6])*)$/);
  if (!match) {
    return { mode: 'advanced', raw: trimmed };
  }

  const [, minute, hour, dayField] = match;
  const days = dayField === '*' ? [] : dayField.split(',').map(Number);
  return { mode: 'simple', hour: Number(hour), minute: Number(minute), days };
}

function readSecret(envVar, fileEnvVar, defaultFile) {
  const inline = process.env[envVar];
  if (isNonEmpty(inline)) {
    return inline.trim();
  }

  const secretPath = process.env[fileEnvVar] || defaultFile;
  try {
    if (secretPath && fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
  } catch (error) {
    console.warn(`${logPrefix} Failed to read secret file ${secretPath}:`, error.message);
  }

  return '';
}

const localAuthUsername = readSecret('ADMIN_USERNAME', 'ADMIN_USERNAME_FILE', '/run/secrets/admin_username');
const localAuthPassword = readSecret('ADMIN_PASSWORD', 'ADMIN_PASSWORD_FILE', '/run/secrets/admin_password');
const localAuthEnabled = isNonEmpty(localAuthUsername) && isNonEmpty(localAuthPassword);

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // burn equivalent time either way
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}