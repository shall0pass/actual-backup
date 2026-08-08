const fs = require('fs');
const path = require('path');
const { dataRoot } = require('./config');

function getUserDataDir(userId) {
  const normalizedUserId = String(userId || 'anonymous').replace(/[^a-zA-Z0-9._-]/g, '-');
  const userDataDir = path.join(dataRoot, normalizedUserId);
  fs.mkdirSync(userDataDir, { recursive: true });
  return userDataDir;
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

function deleteBackup(userId, name) {
  const userDataDir = getUserDataDir(userId);
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