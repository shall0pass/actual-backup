const express = require('express');
const fs = require('fs');
const path = require('path');
const { logPrefix } = require('../config');
const { requireAuth, getUserId, getUserEmail } = require('../auth');
const { getUserConfigs, getUserConfigById, upsertUserConfig, deleteUserConfigById } = require('../state');
const { registerConfigSchedule, unregisterConfigSchedule } = require('../scheduler');
const { getUserDataDir, getBackupList } = require('../backups');
const { runBackup, loadUserConfig } = require('../app');

const router = express.Router();

router.get('/api/configs', requireAuth, (req, res) => {
  const userId = getUserId(req);
  res.json({ userId, configs: getUserConfigs(userId) });
});

router.get('/api/configs/:configId', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const config = getUserConfigById(userId, req.params.configId);

  if (!config) {
    return res.status(404).json({ error: 'Configuration not found' });
  }

  res.json({ userId, config });
});

// Creates a new configuration when body.id is omitted (or doesn't belong to
// this user); updates the existing one otherwise.
router.post('/api/configs', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const body = req.body || {};
  const targetId = body.id && getUserConfigById(userId, body.id) ? body.id : null;

  const saved = upsertUserConfig(userId, targetId, body);
  registerConfigSchedule(userId, saved.id, saved);
  res.json({ userId, config: saved });
});

router.delete('/api/configs/:configId', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const { configId } = req.params;

  if (!getUserConfigById(userId, configId)) {
    return res.status(404).json({ error: 'Configuration not found' });
  }

  deleteUserConfigById(userId, configId);
  unregisterConfigSchedule(userId, configId);
  res.json({ ok: true, userId, configId });
});

router.get('/api/configs/:configId/run', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { configId } = req.params;

  if (!getUserConfigById(userId, configId)) {
    return res.status(404).json({ error: 'Configuration not found' });
  }

  try {
    const config = loadUserConfig(userId, configId);
    const result = await runBackup({ userId, configId, configOverride: config });
    res.json({ ok: true, userId, configId, result });
  } catch (error) {
    console.error(`${logPrefix} Backup run failed:`, error);
    res.status(500).json({ ok: false, userId, configId, error: error.message });
  }
});

router.get('/api/configs/:configId/backups', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const userEmail = getUserEmail(req);
  const { configId } = req.params;

  if (!getUserConfigById(userId, configId)) {
    return res.status(404).json({ error: 'Configuration not found' });
  }

  res.json({ userId, configId, backups: getBackupList(userId, configId, userEmail) });
});

router.get('/api/configs/:configId/backups/:name', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const userEmail = getUserEmail(req);
  const { configId } = req.params;

  if (!getUserConfigById(userId, configId)) {
    return res.status(404).json({ error: 'Configuration not found' });
  }

  const backupPath = path.join(getUserDataDir(userId, configId, userEmail), req.params.name);

  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: 'Backup not found' });
  }

  res.download(backupPath);
});

module.exports = router;
