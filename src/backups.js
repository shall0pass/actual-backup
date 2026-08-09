const fs = require('fs');
const path = require('path');
const { dataRoot } = require('./config');

// Each configuration's backups live in their own subdirectory, keyed by the
// email captured on the config at save time (see routes/pages.js and
// routes/api.js) plus the config's own id, so multiple budgets - even for
// the same login - never share or collide over files.
function resolveDataDir(configId, userEmail) {
  const normalizedConfigId = String(configId || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
  const normalizedEmail = String(userEmail || 'unknown').replace(/[^a-zA-Z0-9._@-]/g, '-');
  return path.join(dataRoot, normalizedEmail, normalizedConfigId);
}

function getUserDataDir(configId, userEmail) {
  const userDataDir = resolveDataDir(configId, userEmail);
  fs.mkdirSync(userDataDir, { recursive: true });
  return userDataDir;
}

function getBackupList(configId, userEmail) {
  const userDataDir = getUserDataDir(configId, userEmail);
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

function deleteBackup(configId, userEmail, name) {
  const userDataDir = getUserDataDir(configId, userEmail);
  // path.basename strips any directory components, so a name like
  // "../../etc/passwd" collapses to "passwd" and can't escape the user's dir.
  const safeName = path.basename(String(name || ''));

  if (!safeName.endsWith('.zip')) {
    return false;
  }

  const backupPath = path.join(userDataDir, safeName);

  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
    return true;
  }

  return false;
}

function deleteConfigData(configId, userEmail) {
  const userDataDir = resolveDataDir(configId, userEmail);

  if (!fs.existsSync(userDataDir)) {
    return false;
  }

  fs.rmSync(userDataDir, { recursive: true, force: true });
  return true;
}

module.exports = {
  getUserDataDir,
  getBackupList,
  deleteBackup,
  deleteConfigData,
};