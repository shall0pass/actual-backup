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
// 8-character API key, and each of their budget configs has its own
// enable toggle + 8-character API key. The value entered into Tasker/
// Automate/Home Assistant is the two joined with a dash
// (e.g. "abcdefgh-12345678"), which findActualtapTarget resolves back to
// a specific user's specific budget.

function generateShortApiKey() {
  return crypto.randomBytes(4).toString('hex');
}

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

const COMBINED_KEY_PATTERN = /^([0-9a-f]{8})-([0-9a-f]{8})$/i;

function findActualtapTarget(combinedApiKey) {
  const match = COMBINED_KEY_PATTERN.exec(String(combinedApiKey || ''));
  if (!match) {
    return null;
  }

  const [, userKey, configKey] = match;
  const state = readState();

  for (const [userId, userRecord] of Object.entries(state.users || {})) {
    const userActualtap = userRecord.actualtap;
    if (!userActualtap?.enabled || userActualtap.apiKey !== userKey) {
      continue;
    }

    for (const config of Object.values(userRecord.configs || {})) {
      const enabled = config.ACTUALTAP_ENABLED === true || config.ACTUALTAP_ENABLED === 'true';
      if (enabled && config.ACTUALTAP_API_KEY === configKey) {
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
  generateShortApiKey,
  getUserActualtap,
  setUserActualtap,
  findActualtapTarget,
};
