const fs = require('fs');
const path = require('path');
const { dataRoot } = require('./config');

// Each configuration's backups live in their own subdirectory so that
// multiple budgets for the same user never share (or collide over) files.
function getUserDataDir(userId, configId) {
  const normalizedUserId = String(userId || 'anonymous').replace(/[^a-zA-Z0-9._-]/g, '-');
  const normalizedConfigId = String(configId || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
  const userDataDir = path.join(dataRoot, normalizedUserId, normalizedConfigId);
  fs.mkdirSync(userDataDir, { recursive: true });
  return userDataDir;
}

function getBackupList(userId, configId) {
  const userDataDir = getUserDataDir(userId, configId);
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

function deleteBackup(userId, configId, name) {
  const userDataDir = getUserDataDir(userId, configId);
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

module.exports = {
  getUserDataDir,
  getBackupList,
  deleteBackup,
};