const { getBackupList } = require('../backups');
const { getUserConfig } = require('../state');
const { getUserId, getDisplayName, isAdminUser, isOidcEnabled } = require('../auth');
const { localAuthEnabled } = require('../config');

function renderLoggedOutDashboard(loginError = '') {
  const oidcEnabled = isOidcEnabled();
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Actual Backup Portal</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; background-color: #f6f8fa; color: #24292f; }
      .card { border: 1px solid #d0d7de; border-radius: 8px; padding: 1.5rem; margin-top: 1rem; background-color: #ffffff; max-width: 360px; margin-left: auto; margin-right: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24); }
      h1 { text-align: center; }
      a.button { display: inline-block; padding: 0.5rem 1rem; background: #0969da; color: white; text-decoration: none; border-radius: 6px; text-align: center; width: 100%; box-sizing: border-box; }
      .error { color: #cf222e; background-color: #ffebe9; border: 1px solid rgba(248,81,73,0.2); border-radius: 6px; padding: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
      label { display: block; margin-bottom: 0.75rem; font-weight: 600; font-size: 0.875rem; }
      input { display: block; width: 100%; padding: 0.5rem; margin-top: 0.25rem; border: 1px solid #d0d7de; border-radius: 6px; box-sizing: border-box; }
      button.button { display: inline-block; padding: 0.5rem 1rem; background: #0969da; color: white; border: none; border-radius: 6px; width: 100%; font-size: 0.875rem; font-weight: 600; cursor: pointer; margin-top: 0.5rem; }
      button.button:hover { background-color: #0c57d0; }
    </style>
  </head>
  <body>
    <h1>Actual Backup Portal</h1>
    ${oidcEnabled ? `
    <div class="card">
      <p style="text-align: center; margin-bottom: 1.5rem;">Please sign in to access your backup settings and backup history.</p>
      <a class="button" href="/auth/login">Login with SSO</a>
    </div>` : ''}
    ${localAuthEnabled ? `
    <div class="card">
      <h2 style="margin-top: 0; font-size: 1.25rem; text-align: center;">Admin login</h2>
      ${loginError ? `<div class="error">${loginError}</div>` : ''}
      <form method="POST" action="/auth/local-login">
        <label>Username<input name="username" autocomplete="username" /></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" /></label>
        <button class="button" type="submit">Login</button>
      </form>
    </div>` : ''}
    ${!oidcEnabled && !localAuthEnabled ? `
    <div class="card">
      <p style="text-align: center; margin-bottom: 1.5rem;">Demo mode: Click to log in without credentials.</p>
      <a class="button" href="/auth/login">Login (Demo Mode)</a>
    </div>` : ''}
  </body>
</html>`;
}

function renderDashboard(req, res) {
  const userId = getUserId(req);

  if (!userId || userId === 'anonymous') {
    return res.send(renderLoggedOutDashboard(req.query.error || ''));
  }

  const backups = getBackupList(userId);
  const config = getUserConfig(userId);
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Actual Backup Portal</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; }
      .card { border: 1px solid #d0d7de; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
      a.button { display: inline-block; padding: 0.5rem 1rem; background: #0969da; color: white; text-decoration: none; border-radius: 6px; margin-right: 0.5rem; }
      table { border-collapse: collapse; width: 100%; }
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
      <a class="button" href="/settings">Settings</a>
      <a class="button" href="/run-backup">Run backup</a>
      <a class="button" href="/logout">Logout</a>
    </div>
    <div class="card">
      <h2>Backups</h2>
      <form method="POST" action="/backups/delete" onsubmit="return confirm('Delete the selected backups? This cannot be undone.');">
        <table>
          <thead>
            <tr><th></th><th>Name</th><th>Size</th><th>Modified</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${backups.length === 0
              ? '<tr><td colspan="5">No backups found for this user yet.</td></tr>'
              : backups
                  .map(
                    (backup) =>
                      `<tr><td><input type="checkbox" name="backupNames" value="${backup.name.replace(/"/g, '&quot;')}" /></td><td>${backup.name}</td><td>${Math.round(backup.size / 1024)} KB</td><td>${backup.modifiedAt}</td><td><a href="/api/backups/${encodeURIComponent(backup.name)}">Download</a></td></tr>`
                  )
                  .join('')}
          </tbody>
        </table>
        ${backups.length > 0
          ? '<button type="submit" style="margin-top:0.75rem;background:#d1242f;color:white;border:none;padding:0.5rem 1rem;border-radius:6px;cursor:pointer;">Delete selected</button>'
          : ''}
      </form>
    </div>
    <div class="card">
      <h2>Stored config snapshot</h2>
      <pre>${JSON.stringify(config, null, 2)}</pre>
    </div>
  </body>
</html>`;

  res.send(html);
}

module.exports = {
  renderDashboard,
};