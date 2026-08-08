const { getBackupList } = require('../backups');
const { getUserConfig } = require('../state');
const { getUserId, getDisplayName, isAdminUser, isOidcEnabled } = require('../auth');

function renderLoggedOutDashboard() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Actual Backup Portal</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; }
      .card { border: 1px solid #d0d7de; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
      a.button { display: inline-block; padding: 0.5rem 1rem; background: #0969da; color: white; text-decoration: none; border-radius: 6px; margin-right: 0.5rem; }
    </style>
  </head>
  <body>
    <h1>Actual Backup Portal</h1>
    <div class="card">
      <p>Please sign in to access your backup settings and backup history.</p>
      <a class="button" href="/auth/login">Login</a>
    </div>
  </body>
</html>`;
}

function renderDashboard(req, res) {
  const userId = getUserId(req);

  if (!userId || userId === 'anonymous') {
    return res.send(renderLoggedOutDashboard());
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