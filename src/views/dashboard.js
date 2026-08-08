const { getBackupList } = require('../backups');
const { getUserConfigs } = require('../state');
const { getUserId, getDisplayName, isAdminUser, isOidcEnabled, isLocalAuthEnabled } = require('../auth');

function renderLoggedOutDashboard(loginError = '') {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Actual Backup Portal</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; }
      .card { border: 1px solid #d0d7de; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
      a.button, button.button { display: inline-block; padding: 0.5rem 1rem; background: #0969da; color: white; text-decoration: none; border-radius: 6px; margin-right: 0.5rem; border: none; cursor: pointer; font-size: 1rem; }
      input { width: 100%; padding: 0.5rem; margin: 0.4rem 0; }
      .error { color: #cf222e; }
    </style>
  </head>
  <body>
    <h1>Actual Backup Portal</h1>
    ${isOidcEnabled() ? `
    <div class="card">
      <p>Please sign in to access your backup settings and backup history.</p>
      <a class="button" href="/auth/login">Login with SSO</a>
    </div>` : ''}
    ${isLocalAuthEnabled() ? `
    <div class="card">
      <p>Admin login</p>
      ${loginError ? `<p class="error">${loginError}</p>` : ''}
      <form method="POST" action="/auth/local-login">
        <label>Username<input name="username" autocomplete="username" /></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" /></label>
        <button class="button" type="submit">Login</button>
      </form>
    </div>` : ''}
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[char]));
}

function renderConfigCard(userId, config) {
  const backups = getBackupList(userId, config.id);
  const label = escapeHtml(config.BACKUP_NAME || 'Untitled budget');
  const syncId = config.ACTUAL_SYNC_ID ? escapeHtml(config.ACTUAL_SYNC_ID) : '(not set)';
  const scheduleInfo = config.CRON_SCHEDULE
    ? `Schedule: <code>${escapeHtml(config.CRON_SCHEDULE)}</code>`
    : 'No schedule set';

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
        <h2 style="margin:0;">${label}</h2>
        <div>
          <a class="button" href="/settings/${encodeURIComponent(config.id)}">Edit</a>
          <a class="button" href="/api/configs/${encodeURIComponent(config.id)}/run">Run backup</a>
          <form method="POST" action="/settings/${encodeURIComponent(config.id)}/delete" style="display:inline;" onsubmit="return confirm('Delete this configuration? Existing backup files are kept, but the schedule will stop.');">
            <button type="submit" class="button" style="background:#d1242f;">Delete</button>
          </form>
        </div>
      </div>
      <p style="color:#666;font-size:0.85rem;">Sync ID: ${syncId} &middot; ${scheduleInfo}</p>
      <form method="POST" action="/backups/${encodeURIComponent(config.id)}/delete" onsubmit="return confirm('Delete the selected backups? This cannot be undone.');">
        <table>
          <thead>
            <tr><th></th><th>Name</th><th>Size</th><th>Modified</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${backups.length === 0
              ? '<tr><td colspan="5">No backups found for this configuration yet.</td></tr>'
              : backups
                  .map(
                    (backup) =>
                      `<tr><td><input type="checkbox" name="names" value="${escapeHtml(backup.name)}" /></td><td>${escapeHtml(backup.name)}</td><td>${Math.round(backup.size / 1024)} KB</td><td>${backup.modifiedAt}</td><td><a href="/api/configs/${encodeURIComponent(config.id)}/backups/${encodeURIComponent(backup.name)}">Download</a></td></tr>`
                  )
                  .join('')}
          </tbody>
        </table>
        ${backups.length > 0
          ? '<button type="submit" style="margin-top:0.75rem;background:#d1242f;color:white;border:none;padding:0.5rem 1rem;border-radius:6px;cursor:pointer;">Delete selected</button>'
          : ''}
      </form>
    </div>`;
}

function renderDashboard(req, res, options = {}) {
  const userId = getUserId(req);

  if (!userId || userId === 'anonymous') {
    return res.send(renderLoggedOutDashboard(options.loginError || ''));
  }

  const configs = getUserConfigs(userId);

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Actual Backup Portal</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; }
      .card { border: 1px solid #d0d7de; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
      a.button, button.button { display: inline-block; padding: 0.5rem 1rem; background: #0969da; color: white; text-decoration: none; border-radius: 6px; margin-right: 0.5rem; border: none; cursor: pointer; font-size: 1rem; }
      table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
      th, td { border-bottom: 1px solid #d0d7de; padding: 0.5rem; text-align: left; }
      input, textarea { width: 100%; padding: 0.5rem; margin-bottom: 0.5rem; }
      textarea { min-height: 90px; }
    </style>
  </head>
  <body>
    <h1>Actual Backup Portal</h1>
    <div class="card">
      <p><strong>Signed in as:</strong> ${getDisplayName(req)}</p>
      <p><strong>OIDC mode:</strong> ${isOidcEnabled() ? 'enabled' : 'demo fallback'}</p>
      <p><strong>Admin mode:</strong> ${isAdminUser(userId) ? 'yes' : 'no'}</p>
      <a class="button" href="/settings/new">+ Add budget configuration</a>
      <a class="button" href="/logout">Logout</a>
    </div>
    <h2>Budget backups</h2>
    ${configs.length === 0
      ? '<div class="card"><p>No budget configurations yet. Add one to start backing up an Actual budget.</p></div>'
      : configs.map((config) => renderConfigCard(userId, config)).join('')}
  </body>
</html>`;

  res.send(html);
}

module.exports = {
  renderDashboard,
};