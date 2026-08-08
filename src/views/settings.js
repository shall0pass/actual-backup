const { escapeHtml } = require('./html');
const { renderPage } = require('./layout');
const { DAY_LABELS, pad2, parseCronForUI } = require('./cron');

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

  const body = `
    <h1>${pageTitle}</h1>
    <p class="muted">Signed in as <strong>${escapeHtml(userId)}</strong></p>
    <a class="btn btn-secondary" href="/">Back to dashboard</a>

    <form method="POST" action="${formAction}" id="configForm">
      <div class="card">
        <label for="BACKUP_NAME">Configuration name</label>
        <input id="BACKUP_NAME" name="BACKUP_NAME" placeholder="e.g. Personal Budget" value="${escapeHtml(config.BACKUP_NAME || '')}" required />

        <label for="ACTUAL_SERVER_URL">Actual server URL</label>
        <input id="ACTUAL_SERVER_URL" name="ACTUAL_SERVER_URL" value="${escapeHtml(config.ACTUAL_SERVER_URL || '')}" />

        <label for="ACTUAL_SERVER_PASSWORD">Actual server password</label>
        <input id="ACTUAL_SERVER_PASSWORD" type="password" name="ACTUAL_SERVER_PASSWORD" value="${escapeHtml(config.ACTUAL_SERVER_PASSWORD || '')}" />

        <label for="ACTUAL_SYNC_ID">Actual sync ID</label>
        <input id="ACTUAL_SYNC_ID" name="ACTUAL_SYNC_ID" value="${escapeHtml(config.ACTUAL_SYNC_ID || '')}" />

        <label for="ACTUAL_ENCRYPTION_PASSWORD">Actual encryption password</label>
        <input id="ACTUAL_ENCRYPTION_PASSWORD" type="password" name="ACTUAL_ENCRYPTION_PASSWORD" value="${escapeHtml(config.ACTUAL_ENCRYPTION_PASSWORD || '')}" />
      </div>

      <div class="card">
        <h2 style="margin-top:0;">Backup schedule</h2>

        <div id="simpleSchedule" style="${parsedCron.mode === 'advanced' ? 'display:none;' : ''}">
          <label for="cronTime">Run at</label>
          <input type="time" id="cronTime" value="${cronTimeValue}" />
          <div class="day-grid">
            ${DAY_LABELS.map((label, i) => `
              <label>
                <input type="checkbox" class="cron-day" value="${i}" ${parsedCron.mode === 'simple' && parsedCron.days.includes(i) ? 'checked' : ''} />
                ${label}
              </label>
            `).join('')}
          </div>
          <p class="muted">Leave all days unchecked to run every day.</p>
        </div>

        <div id="advancedSchedule" style="${parsedCron.mode === 'advanced' ? '' : 'display:none;'}">
          <label for="cronRaw">Cron expression</label>
          <textarea id="cronRaw" placeholder="e.g. 0 2 * * *">${parsedCron.mode === 'advanced' ? escapeHtml(parsedCron.raw) : ''}</textarea>
        </div>

        <label class="checkbox-row">
          <input type="checkbox" id="advancedToggle" ${parsedCron.mode === 'advanced' ? 'checked' : ''} />
          Use a custom cron expression instead
        </label>

        <input type="hidden" name="CRON_SCHEDULE" id="CRON_SCHEDULE" value="${escapeHtml(config.CRON_SCHEDULE || '')}" />
      </div>

      <div class="card">
        <h2 style="margin-top:0;">Retention policy</h2>
        <label for="RETENTION_KEEP_COUNT">Number of backups to keep</label>
        <input type="number" id="RETENTION_KEEP_COUNT" name="RETENTION_KEEP_COUNT" min="1" step="1" value="${retentionKeepCount}" />

        <label class="checkbox-row">
          <input type="checkbox" name="RETENTION_KEEP_MONTHLY" value="true" ${retentionKeepMonthly ? 'checked' : ''} />
          Always keep one backup per month
        </label>
        <label class="checkbox-row">
          <input type="checkbox" name="RETENTION_KEEP_YEARLY" value="true" ${retentionKeepYearly ? 'checked' : ''} />
          Always keep one backup per year
        </label>
      </div>

      <button type="submit" class="btn btn-primary btn-block" style="margin-top:1rem;">${isNew ? 'Add configuration' : 'Save configuration'}</button>
    </form>

    ${!isNew ? `
    <form method="POST" action="/settings/${encodeURIComponent(configId)}/delete" style="margin-top:1rem;" onsubmit="return confirm('Delete this configuration? This does not delete existing backup files, but its schedule will stop.');">
      <button type="submit" class="btn btn-danger btn-block">Delete this configuration</button>
    </form>` : ''}

    <script>
      // Placed at the end of the body (after the form markup above) so
      // getElementById calls below actually find their elements.
      (function () {
        const advancedToggle = document.getElementById('advancedToggle');
        const simpleSchedule = document.getElementById('simpleSchedule');
        const advancedSchedule = document.getElementById('advancedSchedule');
        const cronHidden = document.getElementById('CRON_SCHEDULE');
        const cronTime = document.getElementById('cronTime');
        const cronRaw = document.getElementById('cronRaw');
        const dayBoxes = document.querySelectorAll('.cron-day');
        const form = document.getElementById('configForm');

        advancedToggle.addEventListener('change', () => {
          simpleSchedule.style.display = advancedToggle.checked ? 'none' : '';
          advancedSchedule.style.display = advancedToggle.checked ? '' : 'none';
        });

        form.addEventListener('submit', () => {
          if (advancedToggle.checked) {
            cronHidden.value = cronRaw.value.trim();
            return;
          }

          const [hour, minute] = (cronTime.value || '02:00').split(':');
          const days = Array.from(dayBoxes).filter((box) => box.checked).map((box) => box.value);
          const dayField = days.length ? days.join(',') : '*';
          cronHidden.value = Number(minute) + ' ' + Number(hour) + ' * * ' + dayField;
        });
      })();
    </script>
  `;

  return renderPage({ title: pageTitle, bodyHtml: body });
}

module.exports = {
  renderSettingsPage,
};
