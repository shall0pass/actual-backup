let url = process.env.ACTUAL_SERVER_URL || 'http://localhost:5006';
let password = process.env.ACTUAL_SERVER_PASSWORD || 'MyFinances';
let sync_id = process.env.ACTUAL_SYNC_ID || 'test-sync';

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

const api = require('@actual-app/api');
const _7z = require('7zip-min');
const fdate = require('date-fns');
const fs = require('fs');

async function downloadBudget() {
  try {
    console.log('🔄 Starting init');
    await api.init({
      dataDir: './data',
      serverURL: url,
      password: password,
    });

    console.log('📥 Downloading budget');
    await api.downloadBudget(sync_id, password);

    console.log('🔁 Syncing');
    await api.sync();

    await api.shutdown();
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

downloadBudget();
