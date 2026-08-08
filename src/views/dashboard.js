const { getBackupList } = require('../backups');
const { getUserConfigs } = require('../state');
const { getUserId, getDisplayName, isAdminUser, isOidcEnabled, isLocalAuthEnabled } = require('../auth');
const { escapeHtml } = require('./html');
const { renderPage } = require('./layout');
const { describeSchedule } = require('./cron');

function renderLoggedOutBody(loginError) {
  return `
    <h1>Actual Backup Portal</h1>
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

function renderConfigCard(userId, config) {
  const backups = getBackupList(userId, config.id);
  const label = escapeHtml(config.BACKUP_NAME || 'Untitled budget');
  const syncId = config.ACTUAL_SYNC_ID ? escapeHtml(config.ACTUAL_SYNC_ID) : 'Not set';
  const scheduleText = describeSchedule(config.CRON_SCHEDULE);
  const scheduled = Boolean(String(config.CRON_SCHEDULE || '').trim());

  const rows = backups.length === 0
    ? '<tr><td colspan="5"><div class="empty-state">No backups yet for this configuration.</div></td></tr>'
    : backups
        .map(
          (backup) => `
          <tr>
            <td class="select-cell" data-label="Select"><input type="checkbox" name="names" value="${escapeHtml(backup.name)}" /></td>
            <td data-label="Name" class="mono">${escapeHtml(backup.name)}</td>
            <td data-label="Size" class="num">${Math.round(backup.size / 1024)} KB</td>
            <td data-label="Modified" class="date">${escapeHtml(backup.modifiedAt)}</td>
            <td data-label="Action"><a href="/api/configs/${encodeURIComponent(config.id)}/backups/${encodeURIComponent(backup.name)}">Download</a></td>
          </tr>`
        )
        .join('');

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
        <a class="btn btn-secondary" href="/api/configs/${encodeURIComponent(config.id)}/run">Run backup</a>
        <form method="POST" action="/settings/${encodeURIComponent(config.id)}/delete" onsubmit="return confirm('Delete this configuration? Existing backup files are kept, but the schedule will stop.');">
          <button type="submit" class="btn btn-danger btn-block">Delete</button>
        </form>
      </div>
      <form method="POST" action="/backups/${encodeURIComponent(config.id)}/delete" onsubmit="return confirm('Delete the selected backups? This cannot be undone.');">
        <table class="backup-table">
          <thead>
            <tr><th></th><th>Name</th><th>Size</th><th>Modified</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        ${backups.length > 0 ? '<button type="submit" class="btn btn-danger" style="margin-top:0.75rem;">Delete selected</button>' : ''}
      </form>
    </div>`;
}

function renderDashboard(req, res, options = {}) {
  const userId = getUserId(req);

  if (!userId || userId === 'anonymous') {
    return res.send(renderPage({
      title: 'Actual Backup Portal',
      bodyHtml: renderLoggedOutBody(options.loginError || ''),
    }));
  }

  const configs = getUserConfigs(userId);

  const body = `
    <h1>Actual Backup Portal</h1>
    <div class="card">
      <p><strong>Signed in as</strong> ${escapeHtml(getDisplayName(req))}</p>
      <p class="muted">${isOidcEnabled() ? 'OIDC login enabled' : 'Demo fallback mode'} &middot; ${isAdminUser(userId) ? 'Admin' : 'Standard user'}</p>
      <div class="actions" style="margin-top:0.75rem;">
        <a class="btn btn-primary" href="/settings/new">+ Add budget configuration</a>
        <a class="btn btn-secondary" href="/logout">Logout</a>
      </div>
    </div>
    <h2>Budget backups</h2>
    ${configs.length === 0
      ? '<div class="card"><div class="empty-state"><p>No budget configurations yet.</p><p>Add one to start backing up an Actual budget.</p></div></div>'
      : configs.map((config) => renderConfigCard(userId, config)).join('')}
  `;

  res.send(renderPage({ title: 'Actual Backup Portal', bodyHtml: body }));
}

module.exports = {
  renderDashboard,
};
