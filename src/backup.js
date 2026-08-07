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

module.exports = {
  getUserDataDir,
  getBackupList,
};