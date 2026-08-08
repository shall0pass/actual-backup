const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseCronForUI(cron) {
  const trimmed = String(cron || '').trim();
  if (!trimmed) {
    return { mode: 'simple', hour: 2, minute: 0, days: [] };
  }

  const match = trimmed.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(\*|[0-6](?:,[0-6])*)$/);
  if (!match) {
    return { mode: 'advanced', raw: trimmed };
  }

  const [, minute, hour, dayField] = match;
  const days = dayField === '*' ? [] : dayField.split(',').map(Number);
  return { mode: 'simple', hour: Number(hour), minute: Number(minute), days };
}

// options: { isNew: boolean, configId: string|null }
function renderSettingsPage(userId, config, options = {}) {
  const { isNew = false, configId = null } = options;
  const parsedCron = parseCronForUI(config.CRON_SCHEDULE);
  const cronTimeValue = parsedCron.mode === 'simple'
    ? `${pad2(parsedCron.hour)}:${pad2(parsedCron.minute)}`
    : '02:00';
  const retentionKeepCount = config.RETENTION_KEEP_COUNT || '10';
  // Both monthly and yearly retention default to checked unless the user
  // has explicitly turned them off.
  const retentionKeepMonthly = !(config.RETENTION_KEEP_MONTHLY === false || config.RETENTION_KEEP_MONTHLY === 'false');
  const retentionKeepYearly = !(config.RETENTION_KEEP_YEARLY === false || config.RETENTION_KEEP_YEARLY === 'false');
  const formAction = isNew ? '/settings/new' : `/settings/${encodeURIComponent(configId)}`;
  const pageTitle = isNew ? 'Add Budget Configuration' : 'Edit Budget Configuration';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Settings</title>
    <style>body{font-family:Arial,sans-serif;margin:2rem;} input,textarea{width:100%;padding:0.5rem;margin:0.4rem 0;} button{padding:0.55rem 1rem;background:#0969da;color:white;border:none;border-radius:6px;} a.button{display:inline-block;padding:0.5rem 1rem;background:#333;color:white;text-decoration:none;border-radius:6px;}</style>
  </head>
  <script>
    const advancedToggle = document.getElementById('advancedToggle');
    const simpleSchedule = document.getElementById('simpleSchedule');
    const advancedSchedule = document.getElementById('advancedSchedule');
    const cronHidden = document.getElementById('CRON_SCHEDULE');
    const cronTime = document.getElementById('cronTime');
    const cronRaw = document.getElementById('cronRaw');
    const dayBoxes = document.querySelectorAll('.cron-day');

    advancedToggle.addEventListener('change', () => {
      simpleSchedule.style.display = advancedToggle.checked ? 'none' : '';
      advancedSchedule.style.display = advancedToggle.checked ? '' : 'none';
    });

    document.querySelector('form').addEventListener('submit', () => {
      if (advancedToggle.checked) {
        cronHidden.value = cronRaw.value.trim();
        return;
      }

      const [hour, minute] = (cronTime.value || '02:00').split(':');
      const days = Array.from(dayBoxes).filter((box) => box.checked).map((box) => box.value);
      const dayField = days.length ? days.join(',') : '*';
      cronHidden.value = Number(minute) + ' ' + Number(hour) + ' * * ' + dayField;
    });
  </script>
  <body>
    <h1>${pageTitle}</h1>
    <p>Signed in as: <strong>${userId}</strong></p>
    <a class="button" href="/">Back to dashboard</a>
    <form method="POST" action="${formAction}">
      <label>Configuration Name<input name="BACKUP_NAME" placeholder="e.g. Personal Budget" value="${(config.BACKUP_NAME || '').replace(/"/g, '&quot;')}" required /></label>
      <label>Actual Server URL<input name="ACTUAL_SERVER_URL" value="${(config.ACTUAL_SERVER_URL || '').replace(/"/g, '&quot;')}" /></label>
      <label>Actual Server Password<input name="ACTUAL_SERVER_PASSWORD" value="${(config.ACTUAL_SERVER_PASSWORD || '').replace(/"/g, '&quot;')}" /></label>
      <label>Actual Sync ID<input name="ACTUAL_SYNC_ID" value="${(config.ACTUAL_SYNC_ID || '').replace(/"/g, '&quot;')}" /></label>
      <label>Actual Encryption Password<input name="ACTUAL_ENCRYPTION_PASSWORD" value="${(config.ACTUAL_ENCRYPTION_PASSWORD || '').replace(/"/g, '&quot;')}" /></label>
      <div class="cron-picker">
        <label>Backup Schedule</label>

        <div id="simpleSchedule" style="${parsedCron.mode === 'advanced' ? 'display:none;' : ''}">
          <label>Run at <input type="time" id="cronTime" value="${cronTimeValue}" /></label>
          <div class="days">
            ${DAY_LABELS.map((label, i) => `
              <label style="display:inline-block;margin-right:0.75rem;width:auto;">
                <input type="checkbox" class="cron-day" value="${i}" ${parsedCron.mode === 'simple' && parsedCron.days.includes(i) ? 'checked' : ''} />
                ${label}
              </label>
            `).join('')}
          </div>
          <p style="color:#666;font-size:0.85rem;">Leave all days unchecked to run every day.</p>
        </div>

        <div id="advancedSchedule" style="${parsedCron.mode === 'advanced' ? '' : 'display:none;'}">
          <textarea id="cronRaw" placeholder="e.g. 0 2 * * *">${parsedCron.mode === 'advanced' ? parsedCron.raw.replace(/</g, '&lt;') : ''}</textarea>
        </div>

        <label style="display:block;margin-top:0.25rem;">
          <input type="checkbox" id="advancedToggle" ${parsedCron.mode === 'advanced' ? 'checked' : ''} style="width:auto;display:inline-block;margin-right:0.4rem;" />
          Use a custom cron expression instead
        </label>

        <input type="hidden" name="CRON_SCHEDULE" id="CRON_SCHEDULE" value="${(config.CRON_SCHEDULE || '').replace(/"/g, '&quot;')}" />
      </div>
      <div class="retention-policy">
        <label>Retention Policy</label>
        <label>Number of Backups to Keep<input type="number" name="RETENTION_KEEP_COUNT" min="1" step="1" value="${retentionKeepCount}" /></label>
        <label style="display:flex;align-items:center;gap:0.4rem;width:auto;">
          <input type="checkbox" name="RETENTION_KEEP_MONTHLY" value="true" style="width:auto;" ${retentionKeepMonthly ? 'checked' : ''} />
          Always keep one backup per month
        </label>
        <label style="display:flex;align-items:center;gap:0.4rem;width:auto;">
          <input type="checkbox" name="RETENTION_KEEP_YEARLY" value="true" style="width:auto;" ${retentionKeepYearly ? 'checked' : ''} />
          Always keep one backup per year
        </label>
      </div>
      <button type="submit">${isNew ? 'Add Configuration' : 'Save Configuration'}</button>
    </form>
    ${!isNew ? `
    <form method="POST" action="/settings/${encodeURIComponent(configId)}/delete" style="margin-top:1rem;" onsubmit="return confirm('Delete this configuration? This does not delete existing backup files, but its schedule will stop.');">
      <button type="submit" style="background:#d1242f;">Delete this configuration</button>
    </form>` : ''}
  </body>
</html>`;
}

module.exports = {
  DAY_LABELS,
  pad2,
  parseCronForUI,
  renderSettingsPage,
};