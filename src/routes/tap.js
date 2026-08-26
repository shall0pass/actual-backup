const express = require('express');
const { logPrefix } = require('../config');
const { findActualtapTarget } = require('../state');
const { TapError, processTapTransaction } = require('../tapTransaction');

const router = express.Router();

// Called by external devices (Tasker, Automate, Home Assistant, iOS
// Shortcuts) - authenticated purely by the X-API-KEY header, not a browser
// session. The key is "<userKey>-<budgetKey>"; findActualtapTarget resolves
// it to a specific user's specific budget config.
router.post('/transaction', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const target = findActualtapTarget(apiKey);

  if (!target) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { account } = req.body || {};
  if (!account || typeof account !== 'string') {
    return res.status(400).json({ error: 'Invalid account', message: '"account" is required.' });
  }

  try {
    const transaction = await processTapTransaction({ config: target.config, body: req.body || {} });
    res.json(transaction);
  } catch (err) {
    if (err instanceof TapError) {
      return res.status(err.status).json({ error: err.error, message: err.message });
    }

    console.error(`${logPrefix} Tap transaction failed for ${target.userId}/${target.configId}:`, err.message);
    res.status(500).json({ error: 'Internal error', message: err.message });
  }
});

module.exports = router;
