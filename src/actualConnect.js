const actual = require('@actual-app/api');

const validateUrl = (url) => {
  if (!url || typeof url !== 'string') {
    throw new Error('ACTUAL_URL is not a valid string');
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('ACTUAL_URL must use http:// or https:// protocol');
    }
    return url.replace(/\/+$/, '');
  } catch (err) {
    throw new Error(`Invalid ACTUAL_URL format: ${err.message}`);
  }
};

// Deliberately reports one generic failure message regardless of *why* the
// request failed (DNS, refused, timeout, bad status). ACTUAL_SERVER_URL is
// end-user-supplied, and per-reason errors would let it be used as a probe
// to fingerprint hosts/ports on networks the caller couldn't otherwise reach.
const verifyConnectivity = async (url) => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (response.status < 200 || response.status >= 400) {
      throw new Error('unreachable');
    }
  } catch (err) {
    throw new Error('Could not reach the Actual server - check ACTUAL_SERVER_URL and that the server is running and accessible');
  }
};

const initializeActual = async (dataDir, serverURL, password, timeoutMs) => {
  try {
    await Promise.race([
      actual.init({ dataDir, serverURL, password }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)),
    ]);
  } catch (err) {
    if (err.message === 'TIMEOUT') {
      throw new Error(`Initialization timed out after ${timeoutMs / 1000} seconds`);
    }
    throw new Error(`Failed to initialize Actual API: ${err.message}`);
  }
};

const verifyAuthentication = async () => {
  try {
    const budgets = await actual.getBudgets();
    if (!budgets || budgets.length === 0) {
      throw new Error('ACTUAL_PASSWORD is incorrect (no budgets found)');
    }
    return budgets;
  } catch (err) {
    throw new Error(`Authentication failed: ${err.message}`);
  }
};

const verifyBudgetExists = (budgets, syncId) => {
  const budget = budgets.find((b) => b.groupId === syncId);
  if (!budget) {
    const availableIds = budgets.map((b) => b.groupId).join(', ');
    throw new Error(`Budget '${syncId}' not found. Available: ${availableIds}`);
  }
  return budget;
};

const downloadBudget = async (syncId, encryptionPassword, maxRetries, retryDelay) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (encryptionPassword) {
        await actual.downloadBudget(syncId, { password: encryptionPassword });
      } else {
        await actual.downloadBudget(syncId);
      }

      return;
    } catch (err) {
      lastError = err;

      if (err.message?.includes('decrypt') || err.message?.includes('encryption')) {
        throw new Error(`ACTUAL_ENCRYPTION_PASSWORD is incorrect: ${err.message}`);
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw new Error(
    `Failed to download budget after ${maxRetries} attempts: ${lastError.message || lastError.reason || lastError}`
  );
};

const verifyBudgetOpen = async () => {
  try {
    await actual.getAccounts();
  } catch (err) {
    if (err.message?.includes('No budget file is open')) {
      throw new Error(
        'Budget failed to open. This is likely due to a version mismatch between actual-backup and your Actual Budget server. ' +
          'Please ensure actual-backup is updated to match your Actual Budget server version.'
      );
    }
    throw new Error(`Failed to verify budget: ${err.message}`);
  }
};

const TIMEOUT = 30000;
const RETRY_COUNT = 3;
const RETRY_DELAY = 2000;

// Connects to an Actual server, downloads and opens the given budget, and
// leaves the global `actual` module ready for use. Callers are responsible
// for calling `actual.shutdown()` when done, and must run this (and any
// subsequent actual.* calls) inside withActualLock since @actual-app/api
// holds one global connection per process.
async function connectAndOpenBudget({ dataDir, serverUrl, password, syncId, encryptionPassword }) {
  if (!serverUrl || !password || !syncId) {
    throw new Error('Missing Actual server configuration: URL, password, and sync ID are all required.');
  }

  const url = validateUrl(serverUrl);
  await verifyConnectivity(url);
  await initializeActual(dataDir, url, password, TIMEOUT);
  const budgets = await verifyAuthentication();
  verifyBudgetExists(budgets, syncId);
  await downloadBudget(syncId, encryptionPassword, RETRY_COUNT, RETRY_DELAY);
  await verifyBudgetOpen();

  return { serverUrl: url };
}

module.exports = {
  actual,
  connectAndOpenBudget,
};
