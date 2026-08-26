const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataRoot, stateFile } = require('./config');

function ensureRuntimeDirs() {
  fs.mkdirSync(dataRoot, { recursive: true });
  if (!fs.existsSync(stateFile)) {
    fs.writeFileSync(stateFile, JSON.stringify({ users: {} }, null, 2));
  }
}

function readState() {
  ensureRuntimeDirs();
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  state.users = state.users || {};
  return state;
}

function writeState(state) {
  ensureRuntimeDirs();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

// Each user can have multiple backup configurations (one per Actual budget
// they want backed up), keyed by a generated id under state.users[userId].configs.

function getUserConfigs(userId) {
  const state = readState();
  const configs = state.users[userId]?.configs || {};
  return Object.values(configs);
}

function getUserConfigById(userId, configId) {
  if (!configId) {
    return null;
  }
  const state = readState();
  return state.users[userId]?.configs?.[configId] || null;
}

// Creates a new configuration (configId omitted/null) or updates an existing
// one (configId provided). Returns the saved configuration, including its id.
function upsertUserConfig(userId, configId, update) {
  const state = readState();
  state.users[userId] = state.users[userId] || { configs: {} };
  state.users[userId].configs = state.users[userId].configs || {};

  const id = configId || crypto.randomUUID();
  const existing = state.users[userId].configs[id] || {};

  state.users[userId].configs[id] = {
    ...existing,
    ...update,
    id,
  };

  writeState(state);
  return state.users[userId].configs[id];
}

function deleteUserConfigById(userId, configId) {
  const state = readState();
  const configs = state.users[userId]?.configs;
  if (!configs || !configs[configId]) {
    return false;
  }

  delete configs[configId];
  writeState(state);
  return true;
}

// ActualTap tap-to-pay support: each user has one enable toggle + one
// API key, and each of their budget configs has its own enable toggle +
// API key (both generated client-side as 32 hex characters - see the
// "Generate" buttons in views/dashboard.js and views/settings.js). The
// value entered into Tasker/Automate/Home Assistant is the two joined
// with a dash (e.g. "<32 hex chars>-<32 hex chars>"), which
// findActualtapTarget resolves back to a specific user's specific budget.
// The key-length check below accepts 8-64 hex characters per half so
// keys generated before the length was increased from 8 to 32 keep
// working without forcing a regeneration.

function getUserActualtap(userId) {
  const state = readState();
  return state.users[userId]?.actualtap || { enabled: false, apiKey: '' };
}

function setUserActualtap(userId, update) {
  const state = readState();
  state.users[userId] = state.users[userId] || { configs: {} };
  state.users[userId].actualtap = {
    ...(state.users[userId].actualtap || {}),
    ...update,
  };

  writeState(state);
  return state.users[userId].actualtap;
}

const KEY_SEGMENT_PATTERN = /^[0-9a-f]{8,64}$/i;

// Constant-time comparison so that guessing a key can't be sped up by
// timing how many leading characters matched (a plain !== on user-supplied
// secrets is vulnerable to this). Mirrors the safeCompare pattern already
// used for local-login credentials in auth.js.
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // burn equivalent time either way
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function findActualtapTarget(combinedApiKey) {
  const raw = String(combinedApiKey || '');
  const separatorIndex = raw.indexOf('-');
  if (separatorIndex <= 0 || separatorIndex === raw.length - 1) {
    return null;
  }

  const userKey = raw.slice(0, separatorIndex);
  const configKey = raw.slice(separatorIndex + 1);
  if (!KEY_SEGMENT_PATTERN.test(userKey) || !KEY_SEGMENT_PATTERN.test(configKey)) {
    return null;
  }

  const state = readState();

  for (const [userId, userRecord] of Object.entries(state.users || {})) {
    const userActualtap = userRecord.actualtap;
    if (!userActualtap?.enabled || !userActualtap.apiKey || !safeCompare(userActualtap.apiKey, userKey)) {
      continue;
    }

    for (const config of Object.values(userRecord.configs || {})) {
      const enabled = config.ACTUALTAP_ENABLED === true || config.ACTUALTAP_ENABLED === 'true';
      if (enabled && config.ACTUALTAP_API_KEY && safeCompare(config.ACTUALTAP_API_KEY, configKey)) {
        return { userId, configId: config.id, config };
      }
    }
  }

  return null;
}

module.exports = {
  ensureRuntimeDirs,
  readState,
  writeState,
  getUserConfigs,
  getUserConfigById,
  upsertUserConfig,
  deleteUserConfigById,
  getUserActualtap,
  setUserActualtap,
  findActualtapTarget,
};
