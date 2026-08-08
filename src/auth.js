const express = require('express');
const crypto = require('crypto');
const openidClient = require('openid-client');

const {
  logPrefix,
  oidcConfig,
  oidcEnabledInitial,
  adminUserId,
  localAuthUsername,
  localAuthPassword,
  localAuthEnabled,
} = require('./config');

// Mutable at runtime: OIDC discovery can fail on boot.
let oidcEnabled = oidcEnabledInitial;
let oidcClient = null;

function isOidcEnabled() {
  return oidcEnabled;
}

function isLocalAuthEnabled() {
  return localAuthEnabled;
}

async function initializeOidc() {
  if (!oidcEnabled) {
    return null;
  }

  try {
    oidcClient = await openidClient.discovery(
      new URL(oidcConfig.issuer),
      oidcConfig.clientId,
      oidcConfig.clientSecret
    );

    return oidcClient;
  } catch (error) {
    console.error(
      `${logPrefix} OIDC discovery failed, continuing without OIDC:`,
      error.message
    );

    oidcEnabled = false;
    oidcClient = null;

    return null;
  }
}

function getUserId(req) {
  return req.session?.userId || 'anonymous';
}

function getDisplayName(req) {
  return req.session?.displayName || getUserId(req);
}

function isAdminUser(userId) {
  return userId === adminUserId;
}

function resolveDisplayName(claims, fallbackUserId) {
  return (
    claims.preferred_username ||
    claims.nickname ||
    claims.name ||
    claims.email ||
    fallbackUserId
  );
}

function requireAuth(req, res, next) {
  const userId = getUserId(req);

  if (!userId || userId === 'anonymous') {
    return res.status(401).json({
      error: 'Authentication required',
    });
  }

  return next();
}

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));

  if (bufA.length !== bufB.length) {
    // Perform a comparison anyway so the failure path does not
    // immediately return based solely on the length difference.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

const router = express.Router();

router.get('/auth/login', async (req, res) => {
  if (!oidcEnabled) {
    if (localAuthEnabled) {
      return res.redirect('/');
    }

    return res.status(404).send('No authentication method is configured');
  }

  const codeVerifier = openidClient.randomPKCECodeVerifier();
  const codeChallenge =
    await openidClient.calculatePKCECodeChallenge(codeVerifier);

  const state = openidClient.randomState();
  const nonce = openidClient.randomNonce();

  req.session.oidcState = state;
  req.session.oidcNonce = nonce;
  req.session.oidcCodeVerifier = codeVerifier;

  const authorizationUrl = openidClient.buildAuthorizationUrl(
    oidcClient,
    {
      redirect_uri: oidcConfig.redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }
  );

  res.redirect(authorizationUrl.href);
});

router.post('/auth/local-login', (req, res) => {
  if (!localAuthEnabled) {
    return res.status(404).send('Local login is not configured');
  }

  const { username, password } = req.body || {};

  const usernameMatches =
    typeof username === 'string' &&
    username.trim().length > 0 &&
    safeCompare(username.trim(), localAuthUsername);

  const passwordMatches =
    typeof password === 'string' &&
    password.length > 0 &&
    safeCompare(password, localAuthPassword);

  if (!usernameMatches || !passwordMatches) {
    return res.redirect('/?error=' + encodeURIComponent('Invalid username or password'));
  }

  req.session.userId = adminUserId;
  req.session.displayName = localAuthUsername;

  res.redirect('/');
});

router.get('/auth/callback', async (req, res) => {
  if (!oidcEnabled) {
    return res.status(404).send('OIDC login is not configured');
  }

  try {
    const currentUrl = new URL(
      req.originalUrl,
      `${req.protocol}://${req.headers.host}`
    );

    const tokenSet = await openidClient.authorizationCodeGrant(
      oidcClient,
      currentUrl,
      {
        pkceCodeVerifier: req.session.oidcCodeVerifier,
        expectedState: req.session.oidcState,
        expectedNonce: req.session.oidcNonce,
      }
    );

    const claims = tokenSet.claims();

    req.session.userId =
      claims.sub ||
      claims.email ||
      'oidc-user';

    req.session.displayName =
      resolveDisplayName(
        claims,
        req.session.userId
      );

    req.session.oidcState = null;
    req.session.oidcNonce = null;
    req.session.oidcCodeVerifier = null;

    res.redirect('/');
  } catch (error) {
    console.error(
      `${logPrefix} OIDC callback error:`,
      error
    );

    res.status(500).send('OIDC sign-in failed');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = {
  router,
  initializeOidc,
  isOidcEnabled,
  isLocalAuthEnabled,
  requireAuth,
  getUserId,
  getDisplayName,
  isAdminUser,
  resolveDisplayName,
};