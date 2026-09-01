const _7z = require('7zip-min');
const fdate = require('date-fns');
const fs = require('fs');
const path = require('path');
const { debugEnabled, logPrefix } = require('./config');
const { getUserConfigById } = require('./state');
const { getUserDataDir } = require('./backups');
const { actual, connectAndOpenBudget } = require('./actualConnect');
const { withActualLock } = require('./actualLock');

const defaultUserId = String(process.env.BACKUP_USER_ID || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
// Standalone/cron-only usage (`node app.js`, no web UI) needs to know which
// saved configuration to run; defaults to "default" but can be overridden.
const defaultConfigId = String(process.env.BACKUP_CONFIG_ID || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');

if (debugEnabled) {
  console.log(`${logPrefix} [DEBUG] app.js booting with DEBUG=true`);
}

function loadUserConfig(userId = defaultUserId, configId = defaultConfigId) {
  return getUserConfigById(userId, configId) || {};
}

async function runBackup({ userId = defaultUserId, userEmail, configId = defaultConfigId, configOverride = {} } = {}) {
  const activeUserId = String(userId || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
  const activeConfigId = String(configId || 'default').replace(/[^a-zA-Z0-9._-]/g, '-');
  const persistedConfig = loadUserConfig(activeUserId, activeConfigId);
  // Email is captured onto the config record when it's saved (see
  // routes/pages.js and routes/api.js), because a scheduled run has no live
  // login session to pull it from. An explicit userEmail/configOverride
  // value can still override it (e.g. a one-off run with fresh settings),
  // but the persisted config is the reliable source of truth so scheduled
  // and manually-triggered runs of the same config always agree on where
  // backups land.
  const activeUserEmail = String(
    userEmail || configOverride.USER_EMAIL || persistedConfig.USER_EMAIL || 'unknown'
  ).replace(/[^a-zA-Z0-9._@-]/g, '-');
  const activeDataDir = getUserDataDir(activeConfigId, activeUserEmail);

  const actual_url = configOverride.ACTUAL_SERVER_URL || persistedConfig.ACTUAL_SERVER_URL || '';
  const password = configOverride.ACTUAL_SERVER_PASSWORD || persistedConfig.ACTUAL_SERVER_PASSWORD || '';
  const sync_id = configOverride.ACTUAL_SYNC_ID || persistedConfig.ACTUAL_SYNC_ID || '';
  const ACTUAL_ENCRYPTION_PASSWORD = configOverride.ACTUAL_ENCRYPTION_PASSWORD || persistedConfig.ACTUAL_ENCRYPTION_PASSWORD || '';

  const keepCountRaw = configOverride.RETENTION_KEEP_COUNT ?? persistedConfig.RETENTION_KEEP_COUNT;
  const retentionKeepCount = Number.isFinite(Number(keepCountRaw)) && Number(keepCountRaw) > 0
    ? Math.floor(Number(keepCountRaw))
    : 10;

  const keepMonthlyRaw = configOverride.RETENTION_KEEP_MONTHLY ?? persistedConfig.RETENTION_KEEP_MONTHLY;
  const retentionKeepMonthly = keepMonthlyRaw === undefined || keepMonthlyRaw === ''
    ? true
    : (keepMonthlyRaw === true || keepMonthlyRaw === 'true' || keepMonthlyRaw === 'on');

  const keepYearlyRaw = configOverride.RETENTION_KEEP_YEARLY ?? persistedConfig.RETENTION_KEEP_YEARLY;
  const retentionKeepYearly = keepYearlyRaw === undefined || keepYearlyRaw === ''
    ? true
    : (keepYearlyRaw === true || keepYearlyRaw === 'true' || keepYearlyRaw === 'on');

  if (!actual_url || !password || !sync_id) {
    throw new Error('Missing Actual backup configuration for this budget. Save ACTUAL_SERVER_URL, ACTUAL_SERVER_PASSWORD, and ACTUAL_SYNC_ID in the web UI before running a backup.');
  }

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

    const keep = new Set(files.slice(0, retentionKeepCount).map((f) => f.name));

    if (retentionKeepMonthly) {
      const seenMonths = new Set();
      for (const file of files) {
        const key = `${file.date.getFullYear()}-${file.date.getMonth() + 1}`;
        if (!seenMonths.has(key)) {
          seenMonths.add(key);
          keep.add(file.name);
        }
      }
    }

    if (retentionKeepYearly) {
      const seenYears = new Set();
      for (const file of files) {
        const key = `${file.date.getFullYear()}`;
        if (!seenYears.has(key)) {
          seenYears.add(key);
          keep.add(file.name);
        }
      }
    }

    for (const file of files) {
      if (!keep.has(file.name)) {
        fs.unlinkSync(file.fullPath);
        console.log(`🗑️ Deleted old backup: ${file.name}`);
      }
    }
  };

  try {
    const { serverUrl: url } = await withActualLock(() =>
      connectAndOpenBudget({
        dataDir: activeDataDir,
        serverUrl: actual_url,
        password,
        syncId: sync_id,
        encryptionPassword: ACTUAL_ENCRYPTION_PASSWORD,
      }).then(async (result) => {
        await actual.shutdown();
        return result;
      })
    );

    console.log(`${logPrefix} ✅ Budget sync complete.`);
    compressBudget();
    applyRetentionPolicy();

    return {
      userId: activeUserId,
      configId: activeConfigId,
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