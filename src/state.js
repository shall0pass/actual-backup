const fs = require('fs');
const path = require('path');
const { dataRoot, stateFile } = require('./config');

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

function setUserConfig(userId, update) {
  const state = readState();
  state.users = state.users || {};
  state.users[userId] = {
    ...(state.users[userId] || {}),
    ...update,
  };
  writeState(state);
  return state.users[userId];
}

module.exports = {
  ensureRuntimeDirs,
  readState,
  writeState,
  getUserConfig,
  setUserConfig,
};