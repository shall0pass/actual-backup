const actual = require('@actual-app/api');
const _7z = require('7zip-min');
const fdate = require('date-fns');
const fs = require('fs');
const path = require('path');
const { version: appVersion } = require('./package.json');

const debugEnabled = String(process.env.DEBUG || 'false').toLowerCase() === 'true';
const dataRoot = path.resolve(process.env.BACKUP_DATA_ROOT || './data');
const defaultUserId = String(process.env.BACKUP_USER_ID || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
const storeFile = path.join(dataRoot, '.actual-backup-store.json');
const logPrefix = `[actual-backup v${appVersion}]`;

if (debugEnabled) {
  console.log(`${logPrefix} [DEBUG] app.js booting with DEBUG=true`);
}

function loadUserConfig(userId = defaultUserId) {
  try {
    if (!fs.existsSync(storeFile)) {
      return {};
    }

    const raw = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    return raw.users?.[userId] || {};
  } catch (error) {
    console.warn('⚠️ Failed to read persisted settings store:', error.message);
    return {};
  }
}

function resolveScopedDir(userId = defaultUserId) {
  const safeUserId = String(userId || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
  const targetDir = path.join(dataRoot, safeUserId);
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
}

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

const verifyConnectivity = async (url) => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (response.status < 200 || response.status >= 400) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      throw new Error('Connection timed out - check if server is accessible');
    }
    if (err.cause?.code === 'ENOTFOUND') {
      throw new Error('Cannot resolve hostname - check if ACTUAL_URL is correct');
    }
    if (err.cause?.code === 'ECONNREFUSED') {
      throw new Error('Connection refused - check if server is running');
    }
    throw new Error(`Network error: ${err.message}`);
  }
};

async function runBackup({ userId = defaultUserId, configOverride = {} } = {}) {
  const activeUserId = String(userId || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
  const activeDataDir = resolveScopedDir(activeUserId);
  const persistedConfig = loadUserConfig(activeUserId);

  const actual_url = configOverride.ACTUAL_SERVER_URL || persistedConfig.ACTUAL_SERVER_URL || '';
  const password = configOverride.ACTUAL_SERVER_PASSWORD || persistedConfig.ACTUAL_SERVER_PASSWORD || '';
  const sync_id = configOverride.ACTUAL_SYNC_ID || persistedConfig.ACTUAL_SYNC_ID || '';
  const ACTUAL_ENCRYPTION_PASSWORD = configOverride.ACTUAL_ENCRYPTION_PASSWORD || persistedConfig.ACTUAL_ENCRYPTION_PASSWORD || '';

  if (!actual_url || !password || !sync_id) {
    throw new Error('Missing Actual backup configuration for this user. Save ACTUAL_SERVER_URL, ACTUAL_SERVER_PASSWORD, and ACTUAL_SYNC_ID in the web UI before running a backup.');
  }

  const initializeActual = async (serverURL, password, timeoutMs) => {
    try {
      await Promise.race([
        actual.init({ dataDir: activeDataDir, serverURL, password }),
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
          'Budget failed to open. This is likely due to a version mismatch between ActualTap and your Actual Budget server. ' +
            'Please ensure ActualTap is updated to match your Actual Budget server version.'
        );
      }
      throw new Error(`Failed to verify budget: ${err.message}`);
    }
  };

  const compressBudget = () => {
    const today = fdate.format(new Date(), 'yyyy-MM-dd-HH-mm');
    const budgetList = fs.readdirSync(activeDataDir);

    for (const element of budgetList) {
      if (element.endsWith('.zip')) {
        console.log(`⏩ Skipping file: ${element}`);
        continue;
      }

      const metadataPath = path.join(activeDataDir, element, 'metadata.json');
      try {
        const data = fs.readFileSync(metadataPath, 'utf8');
        const obj = JSON.parse(data);

        const fileName = `${obj.budgetName}-${today}`;
        const inPath = path.join(activeDataDir, element);
        const outPath = path.join(activeDataDir, `${fileName}.zip`);

        _7z.pack(inPath, outPath, (err) => {
          if (err) {
            console.error(`${logPrefix} ❌ Compression error for ${inPath}:`, err);
          } else {
            console.log(`${logPrefix} ✅ Compressed: ${outPath}`);
          }
        });
      } catch (error) {
        console.error(`❌ Error processing ${metadataPath}:`, error);
      }
    }
  };

  const applyRetentionPolicy = () => {
    const files = fs.readdirSync(activeDataDir)
      .filter((name) => name.endsWith('.zip'))
      .map((name) => ({
        name,
        fullPath: path.join(activeDataDir, name),
        date: parseDateFromName(name),
      }))
      .filter((file) => file.date !== null)
      .sort((a, b) => b.date - a.date);

    const latest10 = new Set(files.slice(0, 10).map((f) => f.name));
    const monthlyKeep = new Set();
    const seenMonths = new Set();

    for (const file of files) {
      const key = `${file.date.getFullYear()}-${file.date.getMonth() + 1}`;
      if (!seenMonths.has(key)) {
        seenMonths.add(key);
        monthlyKeep.add(file.name);
      }
    }

    const keep = new Set([...latest10, ...monthlyKeep]);

    for (const file of files) {
      if (!keep.has(file.name)) {
        fs.unlinkSync(file.fullPath);
        console.log(`🗑️ Deleted old backup: ${file.name}`);
      }
    }
  };

  const TIMEOUT = 30000;
  const RETRY_COUNT = 3;
  const RETRY_DELAY = 2000;

  try {
    const url = validateUrl(actual_url);
    await verifyConnectivity(url);
    await initializeActual(url, password, TIMEOUT);
    const budgets = await verifyAuthentication();
    verifyBudgetExists(budgets, sync_id);
    await downloadBudget(sync_id, ACTUAL_ENCRYPTION_PASSWORD, RETRY_COUNT, RETRY_DELAY);
    await verifyBudgetOpen();
    await actual.shutdown();


    console.log(`${logPrefix} ✅ Budget sync complete.`);
    compressBudget();
    applyRetentionPolicy();

    return {
      userId: activeUserId,
      dataDir: activeDataDir,
      sync_id,
      serverUrl: url,
    };
  } catch (err) {
    console.error(`${logPrefix} ❌ Error during download or sync:`, err);
    throw err;
  }
}

function parseDateFromName(name) {
  const match = name.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [_, year, month, day, hour, minute] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
}

async function main() {
  return await runBackup();
}

module.exports = {
  runBackup,
  resolveScopedDir,
  loadUserConfig,
};

if (require.main === module) {
  main().then(() => {
    if (debugEnabled) {
      console.log(`${logPrefix} [DEBUG] app.js completed successfully and is exiting`);
    }
  }).catch((error) => {
    console.error(`${logPrefix} [DEBUG] app.js failed and is exiting with code 1`);
    console.error(error);
    process.exit(1);
  });
}
