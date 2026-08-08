const cron = require('node-cron');
const { logPrefix } = require('./config');
const { readState } = require('./state');
const { runBackup } = require('./app');

const scheduleRegistry = new Map();

function registerUserSchedule(userId, config) {
  const normalizedUserId = String(userId || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
  const schedule = String(config.CRON_SCHEDULE || '').trim();
  const taskName = `backup-job-${normalizedUserId}`;

  if (scheduleRegistry.has(taskName)) {
    scheduleRegistry.get(taskName).stop();
    scheduleRegistry.delete(taskName);
  }

  if (!schedule) {
    return;
  }

  const task = cron.schedule(schedule, async () => {
    try {
      await runBackup({ userId, configOverride: config });
    } catch (error) {
      console.error(`${logPrefix} Scheduled backup failed for ${userId}:`, error.message);
    }
  });

  task.start();
  scheduleRegistry.set(taskName, task);
}

function restoreUserSchedules() {
  const state = readState();
  const users = Object.keys(state.users || {});

  for (const userId of users) {
    const config = state.users[userId] || {};
    registerUserSchedule(userId, config);
  }
}

module.exports = {
  scheduleRegistry,
  registerUserSchedule,
  restoreUserSchedules,
};