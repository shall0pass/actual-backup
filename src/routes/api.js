const express = require('express');
const fs = require('fs');
const path = require('path');
const { logPrefix } = require('../config');
const { requireAuth, getUserId } = require('../auth');
const { getUserConfig, setUserConfig } = require('../state');
const { registerUserSchedule } = require('../scheduler');
const { getUserDataDir, getBackupList } = require('../backups');
const { runBackup, loadUserConfig } = require('../app');

const router = express.Router();

router.get('/api/config', requireAuth, (req, res) => {
  const userId = getUserId(req);
  res.json({ userId, config: getUserConfig(userId) });
});

router.post('/api/config', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const saved = setUserConfig(userId, req.body || {});
  registerUserSchedule(userId, saved);
  res.json({ userId, config: saved });
});

router.get('/api/run', requireAuth, async (req, res) => {
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

router.get('/api/backups', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const backups = getBackupList(userId);
  res.json({ userId, backups });
});

router.get('/api/backups/:name', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const backupPath = path.join(getUserDataDir(userId), req.params.name);

  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: 'Backup not found' });
  }

  res.download(backupPath);
});

module.exports = router;