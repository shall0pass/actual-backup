const { randomUUID } = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { actual, connectAndOpenBudget } = require('./actualConnect');
const { withActualLock } = require('./actualLock');

// The schema pattern (validated by the route layer) guarantees YYYY-MM-DD
// shape; this catches impossible dates like 2026-02-31 that a Date
// round-trip silently rolls over.
function isValidDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// iOS Shortcuts/Tasker/Automate pass the Tap-to-Pay amount as locale-
// formatted text, so the string may carry a currency symbol and use either
// "," or "." as the decimal separator (e.g. "£12.34", "12,34", "1.234,56 €").
function parseAmount(raw) {
  let value = raw.replace(/[^\d.,-]/g, '');
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    value = lastComma > lastDot ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  } else if (lastComma > -1) {
    const isDecimalComma = value.indexOf(',') === lastComma && value.length - lastComma - 1 !== 3;
    value = isDecimalComma ? value.replace(',', '.') : value.replace(/,/g, '');
  }

  return parseFloat(value);
}

function createTransaction(body) {
  const { payee, amount: rawAmount, notes, date, type = 'payment' } = body;
  const amount = typeof rawAmount === 'string' ? parseAmount(rawAmount) : rawAmount;
  const isDeposit = type === 'deposit';
  const transactionAmount = amount !== undefined && !isNaN(amount) ? Math.round(amount * 100) * (isDeposit ? 1 : -1) : 0;

  return {
    id: randomUUID(),
    payee_name: payee || 'Unknown',
    amount: transactionAmount,
    notes: notes || '',
    date: date || new Date().toLocaleDateString('en-CA'),
    cleared: false,
  };
}

async function getAccountId(accountName) {
  const accounts = await actual.getAccounts();
  const account = accounts.find((acc) => acc.name.toLowerCase() === accountName.toLowerCase());
  return { accountId: account?.id, accounts };
}

class TapError extends Error {
  constructor(status, error, message) {
    super(message);
    this.status = status;
    this.error = error;
  }
}

// Connects to the given budget config, creates the transaction, syncs, and
// shuts the connection down again - the same "connect briefly, do the work,
// disconnect" pattern runBackup uses, since @actual-app/api only supports
// one open budget per process at a time.
async function processTapTransaction({ config, body }) {
  if (body.date && !isValidDate(body.date)) {
    throw new TapError(400, 'Invalid date', `"${body.date}" is not a valid calendar date. Expected format: YYYY-MM-DD`);
  }

  const transaction = createTransaction(body);
  const accountName = body.account;

  return withActualLock(async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'actual-backup-tap-'));

    try {
      await connectAndOpenBudget({
        dataDir,
        serverUrl: config.ACTUAL_SERVER_URL,
        password: config.ACTUAL_SERVER_PASSWORD,
        syncId: config.ACTUAL_SYNC_ID,
        encryptionPassword: config.ACTUAL_ENCRYPTION_PASSWORD,
      });

      const { accountId, accounts } = await getAccountId(accountName);
      if (!accountId) {
        throw new TapError(400, 'Invalid account', `Account "${accountName}" not found. Available accounts: ${accounts.map((a) => a.name).join(', ')}`);
      }

      const result = await actual.addTransactions(accountId, [transaction]);
      if (result !== 'ok') {
        const errorMessage = result?.errors ? result.errors.join(', ') : JSON.stringify(result);
        throw new Error(`Failed to add transaction: ${errorMessage}`);
      }

      try {
        await actual.sync();
      } catch (syncErr) {
        throw new TapError(500, 'Sync failed', 'Transaction was saved locally but failed to sync to the server. It may be lost on restart.');
      }

      return transaction;
    } finally {
      await actual.shutdown().catch(() => {});
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
}

module.exports = {
  TapError,
  isValidDate,
  processTapTransaction,
};
