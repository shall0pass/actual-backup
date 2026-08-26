const express = require('express');
const { logPrefix } = require('../config');
const { findActualtapTarget } = require('../state');
const { TapError, processTapTransaction } = require('../tapTransaction');

const router = express.Router();

// This endpoint is reachable directly from the internet with no session/
// OIDC gate (external automations don't know how to do a browser login),
// so a wrong API key is the only thing standing between it and the
// internet. Throttle repeated failures per IP so guessing keys isn't
// practical even though the endpoint itself has no rate limit otherwise.
const FAILED_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 20;
const failedAttemptsByIp = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of failedAttemptsByIp) {
    if (now - entry.windowStart > FAILED_ATTEMPT_WINDOW_MS) {
      failedAttemptsByIp.delete(ip);
    }
  }
}, FAILED_ATTEMPT_WINDOW_MS).unref();

function isRateLimited(ip) {
  const entry = failedAttemptsByIp.get(ip);
  if (!entry) {
    return false;
  }
  if (Date.now() - entry.windowStart > FAILED_ATTEMPT_WINDOW_MS) {
    failedAttemptsByIp.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const entry = failedAttemptsByIp.get(ip);
  if (!entry || now - entry.windowStart > FAILED_ATTEMPT_WINDOW_MS) {
    failedAttemptsByIp.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

// Called by external devices (Tasker, Automate, Home Assistant, iOS
// Shortcuts) - authenticated purely by the X-API-KEY header, not a browser
// session. The key is "<userKey>-<budgetKey>"; findActualtapTarget resolves
// it to a specific user's specific budget config.
router.post('/transaction', async (req, res) => {
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts', message: 'Too many invalid API keys from this address. Try again later.' });
  }

  const apiKey = req.headers['x-api-key'];
  const target = findActualtapTarget(apiKey);

  if (!target) {
    recordFailedAttempt(req.ip);
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
