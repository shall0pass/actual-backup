const { getBackupList } = require('../backups');
const { getUserConfigs } = require('../state');
const { getUserId, getDisplayName, getUserEmail, isAdminUser, isOidcEnabled, isLocalAuthEnabled } = require('../auth');
const { escapeHtml } = require('./html');
const { renderPage } = require('./layout');
const { describeSchedule } = require('./cron');

function formatServerTime() {
  // Backups are scheduled strictly in UTC (see scheduler.js), independent of
  // the container's TZ/system timezone setup. Showing UTC here — rather than
  // whatever TZ happens to resolve to — keeps this clock trustworthy even if
  // the container's timezone files aren't configured correctly.
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  }).format(new Date());
}

function renderHeader() {
  return `
    <div class="page-header">
      <h1>Actual Backup Portal</h1>
      <span class="page-header-clock mono">Server time: ${escapeHtml(formatServerTime())} UTC</span>
    </div>`;
}

function renderLoggedOutBody(loginError) {
  return `
    ${renderHeader()}
    ${isOidcEnabled() ? `
    <div class="card">
      <p>Sign in to access your backup settings and backup history.</p>
      <a class="btn btn-primary" href="/auth/login">Login with SSO</a>
    </div>` : ''}
    ${isLocalAuthEnabled() ? `
    <div class="card">
      <p>Admin login</p>
      ${loginError ? `<p class="error">${escapeHtml(loginError)}</p>` : ''}
      <form method="POST" action="/auth/local-login">
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" />
        <label for="password">Password</label>
        <input id="password" type="password" name="password" autocomplete="current-password" />
        <button type="submit" class="btn btn-primary btn-block" style="margin-top:0.85rem;">Login</button>
      </form>
    </div>` : ''}
  `;
}

const VISIBLE_BACKUP_COUNT = 4;

function renderConfigCard(userId, config, userEmail) {
  const backups = getBackupList(userId, config.id, userEmail);
  const label = escapeHtml(config.BACKUP_NAME || 'Untitled budget');
  const syncId = config.ACTUAL_SYNC_ID ? escapeHtml(config.ACTUAL_SYNC_ID) : 'Not set';
  const scheduleText = describeSchedule(config.CRON_SCHEDULE);
  const scheduled = Boolean(String(config.CRON_SCHEDULE || '').trim());
  const tableId = `backups-${config.id}`;

  const rows = backups.length === 0
    ? '<tr><td colspan="5"><div class="empty-state">No backups yet for this configuration.</div></td></tr>'
    : backups
        .map(
          (backup, index) => `
          <tr${index >= VISIBLE_BACKUP_COUNT ? ' class="extra-row" style="display:none;"' : ''}>
            <td class="select-cell" data-label="Select"><input type="checkbox" name="names" value="${escapeHtml(backup.name)}" /></td>
            <td data-label="Name" class="mono">${escapeHtml(backup.name)}</td>
            <td data-label="Size" class="num">${Math.round(backup.size / 1024)} KB</td>
            <td data-label="Modified" class="date">${escapeHtml(backup.modifiedAt)}</td>
            <td data-label="Action"><a href="/api/configs/${encodeURIComponent(config.id)}/backups/${encodeURIComponent(backup.name)}">Download</a></td>
          </tr>`
        )
        .join('');

  const hasMoreBackups = backups.length > VISIBLE_BACKUP_COUNT;

  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>${label}</h2>
          <p class="muted mono">Sync ID: ${syncId}</p>
        </div>
        <span class="status-pill ${scheduled ? '' : 'idle'}"><span class="dot"></span>${escapeHtml(scheduleText)}</span>
      </div>
      <div class="actions" style="margin-top:0.75rem;">
        <a class="btn btn-secondary" href="/settings/${encodeURIComponent(config.id)}">Edit</a>
        <form method="POST" action="/configs/${encodeURIComponent(config.id)}/run">
          <button type="submit" class="btn btn-secondary btn-block">Run backup</button>
        </form>
        <form method="POST" action="/settings/${encodeURIComponent(config.id)}/delete" onsubmit="return confirm('Delete this configuration? Existing backup files are kept, but the schedule will stop.');">
          <button type="submit" class="btn btn-danger btn-block">Delete</button>
        </form>
      </div>
      <form method="POST" action="/backups/${encodeURIComponent(config.id)}/delete" onsubmit="return confirm('Delete the selected backups? This cannot be undone.');">
        <table class="backup-table" id="${tableId}">
          <thead>
            <tr><th></th><th>Name</th><th>Size</th><th>Modified</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        ${hasMoreBackups
          ? `<button type="button" class="btn btn-secondary btn-toggle-backups" data-target="${tableId}" data-show-label="Show all ${backups.length} backups" style="margin-top:0.75rem;">Show all ${backups.length} backups</button>`
          : ''}
        ${backups.length > 0 ? '<button type="submit" class="btn btn-danger" style="margin-top:0.75rem;">Delete selected</button>' : ''}
      </form>
    </div>`;
}

function renderBackupsToggleScript() {
  return `
    <script>
      (function () {
        document.addEventListener('click', function (event) {
          var btn = event.target.closest('.btn-toggle-backups');
          if (!btn) return;

          var table = document.getElementById(btn.dataset.target);
          if (!table) return;

          var rows = table.querySelectorAll('.extra-row');
          var isHidden = rows.length > 0 && rows[0].style.display === 'none';

          rows.forEach(function (row) {
            row.style.display = isHidden ? '' : 'none';
          });

          btn.textContent = isHidden ? 'Show less' : btn.dataset.showLabel;
        });
      })();
    </script>`;
}

function renderStatusBanner(req) {
  const { runStatus, runConfig, runError, deleteStatus, deleteCount } = req.query || {};
  const label = runConfig ? escapeHtml(runConfig) : 'configuration';

  if (runStatus === 'success') {
    return `<div class="card banner-success">Backup completed for <strong>${label}</strong>.</div>`;
  }
  if (runStatus === 'error') {
    return `<div class="card banner-error">Backup failed for <strong>${label}</strong>${runError ? `: ${escapeHtml(runError)}` : ''}</div>`;
  }
  if (deleteStatus === 'success') {
    const count = escapeHtml(deleteCount || '');
    return `<div class="card banner-success">Deleted ${count} backup${deleteCount === '1' ? '' : 's'}.</div>`;
  }
  if (deleteStatus === 'none') {
    return `<div class="card banner-error">No backups were deleted.</div>`;
  }
  return '';
}

function renderDashboard(req, res, options = {}) {
  const userId = getUserId(req);
  const userEmail = getUserEmail(req);

  if (!userId || userId === 'anonymous') {
    return res.send(renderPage({
      title: 'Actual Backup Portal',
      bodyHtml: renderLoggedOutBody(options.loginError || ''),
    }));
  }

  const configs = getUserConfigs(userId);

  const body = `
    ${renderHeader()}
    <div class="card">
      <p><strong>Signed in as</strong> ${escapeHtml(getDisplayName(req))}</p>
      <p><strong>Email: </strong> ${escapeHtml(getUserEmail(req))}</p>
      <p class="muted">${isOidcEnabled() ? 'OIDC login enabled' : 'Demo fallback mode'} &middot; ${isAdminUser(userId) ? 'Admin' : 'Standard user'}</p>
      <div class="actions" style="margin-top:0.75rem;">
        <a class="btn btn-primary" href="/settings/new">+ Add budget configuration</a>
        <a class="btn btn-secondary" href="/logout">Logout</a>
      </div>
    </div>
    ${renderStatusBanner(req)}
    <h2>Budget backups</h2>
    ${configs.length === 0
      ? '<div class="card"><div class="empty-state"><p>No budget configurations yet.</p><p>Add one to start backing up an Actual budget.</p></div></div>'
      : configs.map((config) => renderConfigCard(userId, config, userEmail)).join('')}
    ${configs.length > 0 ? renderBackupsToggleScript() : ''}
  `;

  res.send(renderPage({ title: 'Actual Backup Portal', bodyHtml: body }));
}

module.exports = {
  renderDashboard,
};