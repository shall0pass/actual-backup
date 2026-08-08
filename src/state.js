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

module.exports = {
  ensureRuntimeDirs,
  readState,
  writeState,
  getUserConfigs,
  getUserConfigById,
  upsertUserConfig,
  deleteUserConfigById,
};
