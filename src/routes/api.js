const express = require('express');
const fs = require('fs');
const path = require('path');
const { logPrefix } = require('../config');
const { requireAuth, getUserId, getUserEmail } = require('../auth');
const { getUserConfigs, getUserConfigById, upsertUserConfig, deleteUserConfigById } = require('../state');
const { registerConfigSchedule, unregisterConfigSchedule } = require('../scheduler');
const { getUserDataDir, getBackupList, deleteConfigData, sanitizeBackupName } = require('../backups');
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
// this user); updates the existing one otherwise. USER_EMAIL is always taken
// from the authenticated session, never from the request body - a scheduled
// run has no session to fall back on, so this is the one place it's
// captured, and callers shouldn't be able to point their backups at an
// arbitrary directory by supplying their own USER_EMAIL.
router.post('/api/configs', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const body = req.body || {};
  const targetId = body.id && getUserConfigById(userId, body.id) ? body.id : null;
  const payload = { ...body, USER_EMAIL: getUserEmail(req) };

  const saved = upsertUserConfig(userId, targetId, payload);
  registerConfigSchedule(userId, saved.id, saved);
  res.json({ userId, config: saved });
});

router.delete('/api/configs/:configId', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const { configId } = req.params;
  const config = getUserConfigById(userId, configId);

  if (!config) {
    return res.status(404).json({ error: 'Configuration not found' });
  }

  deleteUserConfigById(userId, configId);
  unregisterConfigSchedule(userId, configId);

  try {
    deleteConfigData(configId, config.USER_EMAIL);
  } catch (error) {
    console.error(`${logPrefix} Failed to delete backup files for ${userId}/${configId}:`, error.message);
  }

  res.json({ ok: true, userId, configId });
});

router.get('/api/configs/:configId/run', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { configId } = req.params;
  const config = loadUserConfig(userId, configId);

  if (!getUserConfigById(userId, configId)) {
    return res.status(404).json({ error: 'Configuration not found' });
  }

  try {
    // runBackup reads USER_EMAIL from the persisted config itself, so the
    // backup directory matches whatever a scheduled run of this same
    // configuration would use.
    const result = await runBackup({ userId, configId, configOverride: config });
    res.json({ ok: true, userId, configId, result });
  } catch (error) {
    console.error(`${logPrefix} Backup run failed:`, error);
    res.status(500).json({ ok: false, userId, configId, error: error.message });
  }
});

router.get('/api/configs/:configId/backups', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const { configId } = req.params;
  const config = getUserConfigById(userId, configId);

  if (!config) {
    return res.status(404).json({ error: 'Configuration not found' });
  }

  res.json({ userId, configId, backups: getBackupList(configId, config.USER_EMAIL) });
});

router.get('/api/configs/:configId/backups/:name', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const { configId } = req.params;
  const config = getUserConfigById(userId, configId);

  if (!config) {
    return res.status(404).json({ error: 'Configuration not found' });
  }

  const safeName = sanitizeBackupName(req.params.name);
  if (!safeName) {
    return res.status(400).json({ error: 'Invalid backup name' });
  }

  const backupPath = path.join(getUserDataDir(configId, config.USER_EMAIL), safeName);

  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: 'Backup not found' });
  }

  res.download(backupPath);
});

module.exports = router;