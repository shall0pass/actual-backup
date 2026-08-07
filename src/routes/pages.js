const express = require('express');
const { getUserId, isOidcEnabled } = require('../auth');
const { getUserConfig, setUserConfig } = require('../state');
const { registerUserSchedule } = require('../scheduler');
const { renderDashboard } = require('../views/dashboard');
const { renderSettingsPage } = require('../views/settings');
const { runBackup, loadUserConfig } = require('../app');
const { deleteBackup } = require('../backups');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/', (req, res) => {
  renderDashboard(req, res);
});

router.get('/run-backup', requireAuth, async (req, res) => {
  const userId = getUserId(req);

  try {
    const config = loadUserConfig(userId);
    await runBackup({ userId, configOverride: config });
  } catch (error) {
    console.error('Backup run failed:', error);
  }

  res.redirect('/');
});

router.post('/backups/delete', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const selected = req.body.backupNames;
  const names = Array.isArray(selected) ? selected : selected ? [selected] : [];

  for (const name of names) {
    deleteBackup(userId, name);
  }

  res.redirect('/');
});

router.get('/health', (req, res) => {
  res.json({ ok: true, oidcEnabled: isOidcEnabled(), userId: getUserId(req) });
});

router.get('/settings', (req, res) => {
  const userId = getUserId(req);
  if (!userId || userId === 'anonymous') {
    return res.redirect('/auth/login');
  }

  const config = getUserConfig(userId);
  res.send(renderSettingsPage(userId, config));
});

router.post('/settings', (req, res) => {
  const userId = getUserId(req);
  if (!userId || userId === 'anonymous') {
    return res.redirect('/auth/login');
  }

  const payload = {
    ACTUAL_SERVER_URL: String(req.body.ACTUAL_SERVER_URL || ''),
    ACTUAL_SERVER_PASSWORD: String(req.body.ACTUAL_SERVER_PASSWORD || ''),
    ACTUAL_SYNC_ID: String(req.body.ACTUAL_SYNC_ID || ''),
    ACTUAL_ENCRYPTION_PASSWORD: String(req.body.ACTUAL_ENCRYPTION_PASSWORD || ''),
    CRON_SCHEDULE: String(req.body.CRON_SCHEDULE || ''),
    BACKUP_NAME: String(req.body.BACKUP_NAME || ''),
  };

  const saved = setUserConfig(userId, payload);
  registerUserSchedule(userId, saved);
  res.redirect('/');
});

module.exports = router;


