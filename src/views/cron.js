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

// Turns a cron expression into a short human-readable label for the
// dashboard, e.g. "Runs daily at 2:00 AM" or "Runs Mon, Wed at 6:30 PM".
function describeSchedule(cronExpr) {
  const trimmed = String(cronExpr || '').trim();
  if (!trimmed) {
    return 'No schedule set';
  }

  const parsed = parseCronForUI(trimmed);
  if (parsed.mode === 'advanced') {
    return `Custom schedule (${parsed.raw})`;
  }

  const hour12 = parsed.hour % 12 || 12;
  const meridiem = parsed.hour < 12 ? 'AM' : 'PM';
  const time = `${hour12}:${pad2(parsed.minute)} ${meridiem}`;

  if (!parsed.days.length) {
    return `Runs daily at ${time}`;
  }

  const dayNames = parsed.days.slice().sort((a, b) => a - b).map((d) => DAY_LABELS[d]);
  return `Runs ${dayNames.join(', ')} at ${time}`;
}

module.exports = {
  DAY_LABELS,
  pad2,
  parseCronForUI,
  describeSchedule,
};
