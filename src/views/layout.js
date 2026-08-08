// Design tokens: a quiet "ledger" palette (cool paper background, ink-navy
// text, a single emerald accent for primary actions/status) instead of the
// default blue-link-on-white look. Data-ish values (sync IDs, filenames,
// cron expressions, sizes) use a monospace face to read like data.
const STYLES = `
  :root {
    --bg: #F5F6F8;
    --surface: #FFFFFF;
    --border: #E3E6EB;
    --ink: #182230;
    --ink-muted: #5B6472;
    --accent: #1F7A5C;
    --accent-hover: #17614A;
    --accent-soft: #E3F3EC;
    --danger: #B3261E;
    --danger-hover: #90201A;
    --radius: 12px;
    --radius-sm: 8px;
    --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  }

  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: var(--font-body);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  .page { max-width: 760px; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }

  h1, h2, h3 { font-weight: 700; letter-spacing: -0.01em; margin: 0 0 0.5rem; color: var(--ink); }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  p { margin: 0.35rem 0; }
  a { color: var(--accent); }
  code, .mono { font-family: var(--font-mono); font-size: 0.85em; }
  .muted { color: var(--ink-muted); font-size: 0.85rem; }
  .error { color: var(--danger); font-size: 0.9rem; }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.1rem;
    margin-top: 1rem;
    box-shadow: 0 1px 2px rgba(20, 24, 32, 0.04);
  }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; flex-wrap: wrap; }
  .card-header h2 { margin: 0; }

  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

  .btn, button, input[type="submit"] {
    font-family: var(--font-body);
    font-size: 0.95rem;
    font-weight: 600;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    padding: 0.65rem 1rem;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    line-height: 1.1;
    transition: background-color 0.15s ease, transform 0.05s ease;
  }
  .btn:active, button:active { transform: scale(0.98); }
  .btn-primary, button[type="submit"] { background: var(--accent); color: #fff; }
  .btn-primary:hover, button[type="submit"]:hover { background: var(--accent-hover); }
  .btn-secondary { background: var(--surface); color: var(--ink); border-color: var(--border); }
  .btn-secondary:hover { background: var(--bg); }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-danger:hover { background: var(--danger-hover); }
  .btn-block { width: 100%; }

  .status-pill { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; font-weight: 600; padding: 0.3rem 0.65rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent-hover); white-space: nowrap; }
  .status-pill .dot { width: 6px; height: 6px; border-radius: 999px; background: var(--accent); flex: none; }
  .status-pill.idle { background: #F1F2F5; color: var(--ink-muted); }
  .status-pill.idle .dot { background: var(--ink-muted); }

  label { display: block; font-size: 0.85rem; font-weight: 600; color: var(--ink-muted); margin: 0.85rem 0 0.3rem; }
  input, textarea, select {
    width: 100%;
    font-family: var(--font-body);
    font-size: 1rem;
    padding: 0.65rem 0.75rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
  }
  input:focus-visible, textarea:focus-visible, select:focus-visible, a:focus-visible, button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  textarea { min-height: 90px; font-family: var(--font-mono); }

  .checkbox-row { display: flex; align-items: center; gap: 0.5rem; font-weight: 500; color: var(--ink); margin: 0.6rem 0 0; }
  .checkbox-row input { width: auto; }

  .day-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.4rem; margin: 0.6rem 0; }
  .day-grid label { margin: 0; padding: 0.5rem 0.25rem; border: 1px solid var(--border); border-radius: var(--radius-sm); text-align: center; font-weight: 600; color: var(--ink-muted); }
  .day-grid input { width: auto; display: block; margin: 0 auto 0.25rem; }

  .backup-table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; }
  .backup-table th, .backup-table td { text-align: left; padding: 0.55rem 0.5rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
  .backup-table th { color: var(--ink-muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
  .backup-table td.num, .backup-table td.date { font-family: var(--font-mono); font-size: 0.82rem; color: var(--ink-muted); }

  .empty-state { text-align: center; padding: 1.25rem 1rem; color: var(--ink-muted); }

  .banner-success { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-hover); font-weight: 600; }
  .banner-error { border-color: var(--danger); background: #FBEAEA; color: var(--danger-hover); font-weight: 600; }

  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; }
  }

  @media (max-width: 640px) {
    .page { padding: 1rem 0.85rem 3rem; }
    h1 { font-size: 1.3rem; }

    .actions { flex-direction: column; align-items: stretch; }
    .actions .btn, .actions form { width: 100%; }
    .actions form button { width: 100%; }

    .backup-table thead { display: none; }
    .backup-table, .backup-table tbody, .backup-table tr, .backup-table td { display: block; width: 100%; }
    .backup-table tr { border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 0.6rem; padding: 0.5rem 0.65rem; }
    .backup-table td { border: none; padding: 0.25rem 0; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
    .backup-table td::before { content: attr(data-label); font-weight: 600; color: var(--ink-muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; }
    .backup-table td.select-cell { justify-content: flex-start; }
    .backup-table td.select-cell::before { content: none; }
  }

  @media (max-width: 420px) {
    .day-grid { grid-template-columns: repeat(4, 1fr); }
  }
`;

function renderPage({ title = 'Actual Backup Portal', bodyHtml = '' } = {}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>${STYLES}</style>
  </head>
  <body>
    <div class="page">
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

module.exports = {
  STYLES,
  renderPage,
};