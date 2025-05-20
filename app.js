let url = process.env.ACTUAL_SERVER_URL || 'http://localhost:5006' //"http://localhost:5006" //url of your server that the script can use to access your budget files
let password = process.env.ACTUAL_SERVER_PASSWORD || 'MyFinances' //"" //password of your server
let sync_id = process.env.ACTUAL_SYNC_ID || 'test-sync' //""// found in advanced settings in  actualbudget, looks something like 'ace017dc-ee96-4b24-a1f4-e6db10c96e53'

let api = require('@actual-app/api');
let _7z = require('7zip-min');
let fdate = require('date-fns');
let fs = require('fs');

async function downloadBudget() {

    console.log('Starting init');
    await api.init({
      // Budget data will be cached locally here, in subdirectories for each file.
      dataDir: '/app/data',
      // This is the URL of your running server
      serverURL: url,
      // This is the password you use to log into the server
      password: password,
    });
    // // This is the ID from Settings → Show advanced settings → Sync ID
    console.log('Finished init.  Starting download.');
    await api.downloadBudget(sync_id, password);

    await api.sync();
    await api.shutdown();

    compressBudget();
};

function compressBudget() {
  const today = fdate.format(Date(),'yyyy-MM-dd-HH-mm');
  let fileName;
  const budgetList = fs.readdirSync('/app/data');
  console.log(budgetList);
  budgetList.forEach((element) => {

    if (element.endsWith('.zip')) {
      console.log(`Skipping file: ${element}`);
      return;
    }

    fs.readFile('/app/data/' + element +'/metadata.json', 'utf8', (err, data) => {
      if (err) {
        console.error('Error reading file:', err);
        return;
      }

      try {
        // Parsing JSON string to JavaScript object
        const obj = JSON.parse(data);
        fileName = obj.budgetName + '-' + today;
        var inPath = '/app/data/' + element; // has the budget-id
        var outPath = '/app/data/' + fileName + '.zip'; // name of output zip file
        _7z.pack(inPath, outPath, err => {console.log(err)});
      } catch (error) {
        console.error('Error parsing JSON:', error);
      }
    })
  });
}

downloadBudget();
