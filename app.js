const os = require("os");
const actual = require("@actual-app/api");
const _7z = require('7zip-min');
const fdate = require('date-fns');
const fs = require('fs');

let actual_url = process.env.ACTUAL_SERVER_URL || 'http://localhost:5006';
let password = process.env.ACTUAL_SERVER_PASSWORD || 'MyFinances';
let sync_id = process.env.ACTUAL_SYNC_ID || 'test-sync';
let ACTUAL_ENCRYPTION_PASSWORD = '';

const path = require('path');

if (!process.env.ACTUAL_SERVER_URL) {
  console.warn('⚠️ Using default server URL');
}
if (!process.env.ACTUAL_SERVER_PASSWORD) {
  console.warn('⚠️ Using default server password');
}
if (!process.env.ACTUAL_SYNC_ID) {
  console.warn('⚠️ Using default sync ID');
}


// Validate and normalize URL format
const validateUrl = (url) => {
  if (!url || typeof url !== "string") {
    throw new Error("ACTUAL_URL is not a valid string");
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("ACTUAL_URL must use http:// or https:// protocol");
    }
    return url.replace(/\/+$/, ""); // Remove trailing slashes
  } catch (err) {
    throw new Error(`Invalid ACTUAL_URL format: ${err.message}`);
  }
};

// Verify network connectivity
const verifyConnectivity = async (url) => {
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (response.status < 200 || response.status >= 400) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }
  } catch (err) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      throw new Error("Connection timed out - check if server is accessible");
    }
    if (err.cause?.code === "ENOTFOUND") {
      throw new Error("Cannot resolve hostname - check if ACTUAL_URL is correct");
    }
    if (err.cause?.code === "ECONNREFUSED") {
      throw new Error("Connection refused - check if server is running");
    }
    throw new Error(`Network error: ${err.message}`);
  }
};

// Initialize Actual API
const initializeActual = async (serverURL, password, timeoutMs) => {
  const dataDir = './data' //fs.mkdtempSync(path.join(os.tmpdir(), "local_dir"));

  try {
    await Promise.race([
      actual.init({ dataDir, serverURL, password }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs)),
    ]);
  } catch (err) {
    if (err.message === "TIMEOUT") {
      throw new Error(`Initialization timed out after ${timeoutMs / 1000} seconds`);
    }
    throw new Error(`Failed to initialize Actual API: ${err.message}`);
  }
};

// Verify authentication and return budgets
const verifyAuthentication = async () => {
  try {
    const budgets = await actual.getBudgets();
    if (!budgets || budgets.length === 0) {
      throw new Error("ACTUAL_PASSWORD is incorrect (no budgets found)");
    }
    return budgets;
  } catch (err) {
    throw new Error(`Authentication failed: ${err.message}`);
  }
};

// Verify budget exists
const verifyBudgetExists = (budgets, syncId) => {
  const budget = budgets.find((b) => b.groupId === syncId);
  if (!budget) {
    const availableIds = budgets.map((b) => b.groupId).join(", ");
    throw new Error(`Budget '${syncId}' not found. Available: ${availableIds}`);
  }
  return budget;
};

// Download budget with retry logic
const downloadBudget = async (syncId, encryptionPassword, maxRetries, retryDelay) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // logger.info(`Downloading budget (attempt ${attempt}/${maxRetries})`);

      if (encryptionPassword) {
        await actual.downloadBudget(syncId, { password: encryptionPassword });
      } else {
        await actual.downloadBudget(syncId);
      }

      return; // Success!
    } catch (err) {
      lastError = err;

      // Check for encryption errors - don't retry these
      if (err.message?.includes("decrypt") || err.message?.includes("encryption")) {
        throw new Error(`ACTUAL_ENCRYPTION_PASSWORD is incorrect: ${err.message}`);
      }

      // Log the error and retry if we have attempts left
      // logger.warn(`Budget download attempt ${attempt}/${maxRetries} failed: ${err.message || err.reason || err}`);

      if (attempt < maxRetries) {
        // logger.info(`Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `Failed to download budget after ${maxRetries} attempts: ${lastError.message || lastError.reason || lastError}`
  );
};

// Verify budget is actually open and usable
const verifyBudgetOpen = async () => {
  try {
    await actual.getAccounts();
  } catch (err) {
    if (err.message?.includes("No budget file is open")) {
      throw new Error(
        "Budget failed to open. This is likely due to a version mismatch between ActualTap and your Actual Budget server. " +
          "Please ensure ActualTap is updated to match your Actual Budget server version."
      );
    }
    throw new Error(`Failed to verify budget: ${err.message}`);
  }
};


async function main() {
  //const { ACTUAL_URL, ACTUAL_PASSWORD, ACTUAL_SYNC_ID, ACTUAL_ENCRYPTION_PASSWORD } = fastify.config;

  const TIMEOUT = 30000;
  const RETRY_COUNT = 3;
  const RETRY_DELAY = 2000;

  try {
    const url = validateUrl(actual_url);
    await verifyConnectivity(url);
    await initializeActual(url, password, TIMEOUT);
    const budgets = await verifyAuthentication();
    const budget = verifyBudgetExists(budgets, sync_id);
    await downloadBudget(sync_id, ACTUAL_ENCRYPTION_PASSWORD, RETRY_COUNT, RETRY_DELAY);
    await verifyBudgetOpen();

    await actual.shutdown();
    console.log('✅ Budget sync complete. Starting compression.');

    compressBudget();
applyRetentionPolicy();
  } catch (err) {
    console.error('❌ Error during download or sync:', err);
    process.exit(1);
  }
}

function compressBudget() {
  const today = fdate.format(new Date(), 'yyyy-MM-dd-HH-mm');
  const budgetList = fs.readdirSync('./data');

  for (const element of budgetList) {
    if (element.endsWith('.zip')) {
      console.log(`⏩ Skipping file: ${element}`);
      continue;
    }

    const metadataPath = `./data/${element}/metadata.json`;
    try {
      const data = fs.readFileSync(metadataPath, 'utf8');
      const obj = JSON.parse(data);

      const fileName = `${obj.budgetName}-${today}`;
      const inPath = `./data/${element}`;
      const outPath = `./data/${fileName}.zip`;

      _7z.pack(inPath, outPath, err => {
        if (err) {
          console.error(`❌ Compression error for ${inPath}:`, err);
        } else {
          console.log(`✅ Compressed: ${outPath}`);
        }
      });
    } catch (error) {
      console.error(`❌ Error processing ${metadataPath}:`, error);
    }
  }
}

function applyRetentionPolicy() {
  const files = fs.readdirSync('./data')
    .filter(name => name.endsWith('.zip'))
    .map(name => ({
      name,
      fullPath: path.join('./data', name),
      date: parseDateFromName(name)
    }))
    .filter(file => file.date !== null)
    .sort((a, b) => b.date - a.date); // Newest first

  const latest10 = new Set(files.slice(0, 10).map(f => f.name));

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
}

function parseDateFromName(name) {
  const match = name.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [_, year, month, day, hour, minute] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
}

main();
