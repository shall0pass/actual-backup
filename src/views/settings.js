const { escapeHtml } = require('./html');
const { renderPage } = require('./layout');
const { DAY_LABELS, pad2, parseCronForUI } = require('./cron');

// options: { isNew: boolean, configId: string|null }
function renderSettingsPage(displayName, config, options = {}) {
  const { isNew = false, configId = null, userApiKey = '' } = options;
  const actualtapEnabled = config.ACTUALTAP_ENABLED === true || config.ACTUALTAP_ENABLED === 'true';
  const actualtapApiKey = config.ACTUALTAP_API_KEY || '';
  const combinedKeyPreview = userApiKey
    ? `${escapeHtml(userApiKey)}-${escapeHtml(actualtapApiKey || 'generate-a-key-below')}`
    : 'Enable tap-to-pay for your account on the dashboard first';
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
    <p class="muted">Signed in as <strong>${escapeHtml(displayName)}</strong></p>
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
        <h2 style="margin-top:0;">Tap-to-Pay for this budget</h2>
        <label class="checkbox-row">
          <input type="checkbox" id="actualtapConfigEnabledBox" ${actualtapEnabled ? 'checked' : ''} />
          Enable tap-to-pay for this budget
        </label>
        <input type="hidden" name="ACTUALTAP_ENABLED" id="actualtapConfigEnabledHidden" value="${actualtapEnabled ? 'true' : 'false'}" />

        <div id="actualtapConfigKeySection" style="margin-top:0.75rem;${actualtapEnabled ? '' : 'display:none;'}">
          <label for="actualtapConfigApiKey">This budget's tap-to-pay API key</label>
          <div class="actions">
            <input id="actualtapConfigApiKey" name="ACTUALTAP_API_KEY" class="mono" style="flex:1;" value="${escapeHtml(actualtapApiKey)}" readonly />
            <button type="button" class="btn btn-secondary" id="actualtapConfigGenerateBtn">Generate</button>
          </div>
          <p class="muted">Full API key to use in Tasker/Automate/Home Assistant for this budget: <code>${combinedKeyPreview}</code></p>
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0;">Backup schedule</h2>

        <div id="simpleSchedule" style="${parsedCron.mode === 'advanced' ? 'display:none;' : ''}">
          <label class="checkbox-row">
            <input type="checkbox" id="useLocalTime" checked />
            Enter time in my local timezone
          </label>
          <p class="muted" style="margin-top:0;">Converted to UTC when you save. Near daylight-saving changes, the actual run time may shift by an hour.</p>

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
          <label for="cronRaw">Cron expression (UTC)</label>
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
    <form method="POST" action="/settings/${encodeURIComponent(configId)}/delete" style="margin-top:1rem;" onsubmit="return confirm('Delete this configuration? This will also permanently delete all of its backup files. This cannot be undone.');">
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
        const useLocalTime = document.getElementById('useLocalTime');

        const actualtapBox = document.getElementById('actualtapConfigEnabledBox');
        const actualtapHidden = document.getElementById('actualtapConfigEnabledHidden');
        const actualtapSection = document.getElementById('actualtapConfigKeySection');
        const actualtapGenerateBtn = document.getElementById('actualtapConfigGenerateBtn');
        const actualtapKeyInput = document.getElementById('actualtapConfigApiKey');

        actualtapBox.addEventListener('change', () => {
          actualtapHidden.value = actualtapBox.checked ? 'true' : 'false';
          actualtapSection.style.display = actualtapBox.checked ? '' : 'none';
        });

        actualtapGenerateBtn.addEventListener('click', () => {
          const bytes = new Uint8Array(4);
          crypto.getRandomValues(bytes);
          actualtapKeyInput.value = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
        });

        function pad2(n) {
          return String(n).padStart(2, '0');
        }

        // Normalizes a day-of-week difference into -1, 0, or 1 (a timezone
        // offset can push a wall-clock time into the previous/next day, but
        // never further than that).
        function normalizedDayShift(a, b) {
          let diff = a - b;
          if (diff > 1) diff -= 7;
          if (diff < -1) diff += 7;
          return diff;
        }

        function shiftDays(days, delta) {
          if (!days.length) return days; // "every day" stays "every day"
          return days.map((d) => ((d + delta) % 7 + 7) % 7);
        }

        // Converts an { hour, minute, days } wall-clock reading between the
        // browser's local timezone and UTC. Uses today's date only to
        // resolve the current UTC offset, so it's not aware of DST changes
        // that happen between now and the actual scheduled run.
        function convertClock(hour, minute, days, direction) {
          const now = new Date();

          if (direction === 'toUtc') {
            const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
            const shift = normalizedDayShift(local.getUTCDay(), local.getDay());
            return { hour: local.getUTCHours(), minute: local.getUTCMinutes(), days: shiftDays(days, shift) };
          }

          const utcBase = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0));
          const shift = normalizedDayShift(utcBase.getDay(), utcBase.getUTCDay());
          return { hour: utcBase.getHours(), minute: utcBase.getMinutes(), days: shiftDays(days, shift) };
        }

        function readInputs() {
          const days = Array.from(dayBoxes).filter((box) => box.checked).map((box) => Number(box.value));
          const [hour, minute] = (cronTime.value || '02:00').split(':').map(Number);
          return { hour, minute, days };
        }

        function writeInputs({ hour, minute, days }) {
          cronTime.value = pad2(hour) + ':' + pad2(minute);
          dayBoxes.forEach((box) => {
            box.checked = days.includes(Number(box.value));
          });
        }

        advancedToggle.addEventListener('change', () => {
          simpleSchedule.style.display = advancedToggle.checked ? 'none' : '';
          advancedSchedule.style.display = advancedToggle.checked ? '' : 'none';
        });

        // The time/day inputs are always rendered from the saved (UTC)
        // schedule. If "use local timezone" starts checked, convert the
        // displayed values to local time once, up front, so what the user
        // sees matches what they'll be editing.
        if (useLocalTime.checked) {
          const initial = readInputs();
          writeInputs(convertClock(initial.hour, initial.minute, initial.days, 'toLocal'));
        }

        useLocalTime.addEventListener('change', () => {
          const current = readInputs();
          const direction = useLocalTime.checked ? 'toLocal' : 'toUtc';
          writeInputs(convertClock(current.hour, current.minute, current.days, direction));
        });

        form.addEventListener('submit', () => {
          if (advancedToggle.checked) {
            cronHidden.value = cronRaw.value.trim();
            return;
          }

          let { hour, minute, days } = readInputs();
          if (useLocalTime.checked) {
            ({ hour, minute, days } = convertClock(hour, minute, days, 'toUtc'));
          }

          const dayField = days.length ? days.join(',') : '*';
          cronHidden.value = minute + ' ' + hour + ' * * ' + dayField;
        });
      })();
    </script>
  `;

  return renderPage({ title: pageTitle, bodyHtml: body });
}

module.exports = {
  renderSettingsPage,
};