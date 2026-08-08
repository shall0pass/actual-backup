const express = require('express');
const { logPrefix } = require('../config');
const { getUserId, getDisplayName, isOidcEnabled, requireAuth } = require('../auth');
const { getUserConfigById, upsertUserConfig, deleteUserConfigById } = require('../state');
const { registerConfigSchedule, unregisterConfigSchedule } = require('../scheduler');
const { renderDashboard } = require('../views/dashboard');
const { renderSettingsPage } = require('../views/settings');
const { deleteBackup } = require('../backups');
const { runBackup } = require('../app');

const router = express.Router();

function buildConfigPayload(body) {
  return {
    BACKUP_NAME: String(body.BACKUP_NAME || ''),
    ACTUAL_SERVER_URL: String(body.ACTUAL_SERVER_URL || ''),
    ACTUAL_SERVER_PASSWORD: String(body.ACTUAL_SERVER_PASSWORD || ''),
    ACTUAL_SYNC_ID: String(body.ACTUAL_SYNC_ID || ''),
    ACTUAL_ENCRYPTION_PASSWORD: String(body.ACTUAL_ENCRYPTION_PASSWORD || ''),
    CRON_SCHEDULE: String(body.CRON_SCHEDULE || ''),
    RETENTION_KEEP_COUNT: String(body.RETENTION_KEEP_COUNT || '10'),
    RETENTION_KEEP_MONTHLY: body.RETENTION_KEEP_MONTHLY === 'true' ? 'true' : 'false',
    RETENTION_KEEP_YEARLY: body.RETENTION_KEEP_YEARLY === 'true' ? 'true' : 'false',
  };
}

router.get('/', (req, res) => {
  renderDashboard(req, res);
});

router.post('/backups/:configId/delete', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const { configId } = req.params;

  if (!getUserConfigById(userId, configId)) {
    return res.status(404).send('Configuration not found');
  }

  const selected = req.body.names;
  const names = Array.isArray(selected) ? selected : selected ? [selected] : [];

  let deletedCount = 0;
  for (const name of names) {
    if (deleteBackup(userId, configId, name)) {
      deletedCount++;
    }
  }

  res.redirect(`/?deleteStatus=${deletedCount > 0 ? 'success' : 'none'}&deleteCount=${deletedCount}`);
});

router.post('/configs/:configId/run', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { configId } = req.params;
  const config = getUserConfigById(userId, configId);

  if (!config) {
    return res.status(404).send('Configuration not found');
  }

  const label = encodeURIComponent(config.BACKUP_NAME || 'Untitled budget');

  try {
    await runBackup({ userId, configId, configOverride: config });
    res.redirect(`/?runStatus=success&runConfig=${label}`);
  } catch (error) {
    console.error(`${logPrefix} Manual backup run failed for ${userId}/${configId}:`, error.message);
    res.redirect(`/?runStatus=error&runConfig=${label}&runError=${encodeURIComponent(error.message)}`);
  }
});

router.get('/health', (req, res) => {
  res.json({ ok: true, oidcEnabled: isOidcEnabled(), userId: getUserId(req) });
});

// NOTE: the literal "/settings/new" routes must be registered before the
// "/settings/:configId" routes below, or Express would match "new" as a
// configId (in practice harmless since real ids are generated UUIDs, but
// registration order is what makes the literal route win either way).
router.get('/settings/new', (req, res) => {
  const userId = getUserId(req);
  if (!userId || userId === 'anonymous') {
    return res.redirect('/auth/login');
  }

  res.send(renderSettingsPage(getDisplayName(req), {}, { isNew: true }));
});

router.post('/settings/new', (req, res) => {
  const userId = getUserId(req);
  if (!userId || userId === 'anonymous') {
    return res.redirect('/auth/login');
  }

  const saved = upsertUserConfig(userId, null, buildConfigPayload(req.body));
  registerConfigSchedule(userId, saved.id, saved);
  res.redirect('/');
});

router.get('/settings/:configId', (req, res) => {
  const userId = getUserId(req);
  if (!userId || userId === 'anonymous') {
    return res.redirect('/auth/login');
  }

  const config = getUserConfigById(userId, req.params.configId);
  if (!config) {
    return res.status(404).send('Configuration not found');
  }

  res.send(renderSettingsPage(getDisplayName(req), config, { isNew: false, configId: req.params.configId }));
});

router.post('/settings/:configId', (req, res) => {
  const userId = getUserId(req);
  if (!userId || userId === 'anonymous') {
    return res.redirect('/auth/login');
  }

  const { configId } = req.params;
  if (!getUserConfigById(userId, configId)) {
    return res.status(404).send('Configuration not found');
  }

  const saved = upsertUserConfig(userId, configId, buildConfigPayload(req.body));
  registerConfigSchedule(userId, saved.id, saved);
  res.redirect('/');
});

router.post('/settings/:configId/delete', (req, res) => {
  const userId = getUserId(req);
  if (!userId || userId === 'anonymous') {
    return res.redirect('/auth/login');
  }

  const { configId } = req.params;
  if (!getUserConfigById(userId, configId)) {
    return res.status(404).send('Configuration not found');
  }

  deleteUserConfigById(userId, configId);
  unregisterConfigSchedule(userId, configId);
  res.redirect('/');
});

module.exports = router;