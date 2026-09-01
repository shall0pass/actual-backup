const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { version: appVersion } = require('../package.json');

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

const isNonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

const DEFAULT_OIDC_SCOPES = 'openid profile email';

// 'openid' is required for OIDC to function at all, so it's always present
// even if a custom OIDC_SCOPES value omits it.
function normalizeScopes(rawScopes) {
  const trimmed = String(rawScopes || '').trim();
  const scopes = trimmed ? trimmed.split(/\s+/) : DEFAULT_OIDC_SCOPES.split(' ');
  if (!scopes.includes('openid')) {
    scopes.unshift('openid');
  }
  return scopes.join(' ');
}

const oidcConfig = {
  issuer: process.env.OIDC_ISSUER,
  clientId: process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  redirectUri: normalizeRedirectUri(process.env.OIDC_REDIRECT_URI),
  scopes: normalizeScopes(process.env.OIDC_SCOPES),
};

if (debugEnabled) {
  console.log(`${logPrefix} [DEBUG] web.js booting with DEBUG=true`);
  if (process.env.OIDC_REDIRECT_URI) {
    console.log(`${logPrefix} [DEBUG] OIDC redirect URI normalized to ${oidcConfig.redirectUri}`);
  }
}

// Whether OIDC *can* be enabled based on env vars. auth.js owns the live,
// mutable `oidcEnabled` flag (discovery can fail at runtime and fall back
// to demo mode), this is just the initial computed value.
const oidcEnabledInitial = Boolean(
  isNonEmpty(oidcConfig.issuer) &&
    isNonEmpty(oidcConfig.clientId) &&
    isNonEmpty(oidcConfig.clientSecret) &&
    isNonEmpty(oidcConfig.redirectUri)
);

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

const sessionSecretFile = path.join(dataRoot, '.session-secret');

// Falling back to a fixed literal here would mean anyone who's seen this
// source (or the default docker-compose.yml) knows the value used to sign
// session cookies. Instead, when SESSION_SECRET isn't provided, generate a
// random one on first boot and persist it so sessions survive restarts.
function getOrCreateSessionSecret() {
  if (isNonEmpty(process.env.SESSION_SECRET)) {
    return process.env.SESSION_SECRET.trim();
  }

  try {
    if (fs.existsSync(sessionSecretFile)) {
      const existing = fs.readFileSync(sessionSecretFile, 'utf8').trim();
      if (isNonEmpty(existing)) {
        return existing;
      }
    }
  } catch (error) {
    console.warn(`${logPrefix} Failed to read session secret file ${sessionSecretFile}:`, error.message);
  }

  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(sessionSecretFile, generated, { mode: 0o600 });
  } catch (error) {
    console.warn(`${logPrefix} Failed to persist generated session secret to ${sessionSecretFile}:`, error.message);
  }

  return generated;
}

module.exports = {
  appVersion,
  debugEnabled,
  logPrefix,
  port,
  dataRoot,
  stateFile,
  sessionStorePath,
  adminUserId,
  oidcConfig,
  oidcEnabledInitial,
  isNonEmpty,
  localAuthUsername,
  localAuthPassword,
  localAuthEnabled,
  getOrCreateSessionSecret,
};