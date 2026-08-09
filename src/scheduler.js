const cron = require('node-cron');
const { logPrefix } = require('./config');
const { readState } = require('./state');
const { runBackup } = require('./app');

const scheduleRegistry = new Map();

function scheduleKey(userId, configId) {
  const normalizedUserId = String(userId || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
  const normalizedConfigId = String(configId || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
  return `backup-job-${normalizedUserId}-${normalizedConfigId}`;
}

function registerConfigSchedule(userId, configId, config) {
  const taskName = scheduleKey(userId, configId);
  const schedule = String(config?.CRON_SCHEDULE || '').trim();

  if (scheduleRegistry.has(taskName)) {
    scheduleRegistry.get(taskName).stop();
    scheduleRegistry.delete(taskName);
  }

  if (!schedule) {
    return;
  }

  // CRON_SCHEDULE is always stored/interpreted as UTC (see views/settings.js
  // for the optional local-time entry that converts to UTC before saving).
  // Scheduling explicitly against UTC here means backups run at the
  // intended time regardless of whether the container's system timezone
  // (TZ / /etc/localtime) is configured correctly.
  const task = cron.schedule(schedule, async () => {
    try {
      await runBackup({ userId, configId, configOverride: config });
    } catch (error) {
      console.error(`${logPrefix} Scheduled backup failed for ${userId}/${configId}:`, error.message);
    }
  }, { timezone: 'Etc/UTC' });

  task.start();
  scheduleRegistry.set(taskName, task);
}

function unregisterConfigSchedule(userId, configId) {
  const taskName = scheduleKey(userId, configId);
  if (scheduleRegistry.has(taskName)) {
    scheduleRegistry.get(taskName).stop();
    scheduleRegistry.delete(taskName);
  }
}

function restoreAllSchedules() {
  const state = readState();

  for (const [userId, userRecord] of Object.entries(state.users || {})) {
    const configs = userRecord.configs || {};
    for (const [configId, config] of Object.entries(configs)) {
      registerConfigSchedule(userId, configId, config);
    }
  }
}

module.exports = {
  scheduleRegistry,
  registerConfigSchedule,
  unregisterConfigSchedule,
  restoreAllSchedules,
};