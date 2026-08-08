const express = require('express');
const openidClient = require('openid-client');
const { logPrefix, oidcConfig, oidcEnabledInitial, adminUserId } = require('./config');

// Mutable at runtime: OIDC discovery can fail on boot, in which case we
// fall back to demo mode for the rest of the process lifetime.
let oidcEnabled = oidcEnabledInitial;
let oidcClient = null;

function isOidcEnabled() {
  return oidcEnabled;
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
    console.error(`${logPrefix} OIDC discovery failed, continuing in demo fallback mode:`, error.message);
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
    return res.status(401).json({ error: 'Authentication required' });
  }

  return next();
}

const router = express.Router();

router.get('/auth/login', async (req, res) => {
  if (!oidcEnabled) {
    req.session.userId = 'demo-user';
    return res.redirect('/');
  }

  const codeVerifier = openidClient.randomPKCECodeVerifier();
  const codeChallenge = await openidClient.calculatePKCECodeChallenge(codeVerifier);
  const state = openidClient.randomState();
  const nonce = openidClient.randomNonce();

  req.session.oidcState = state;
  req.session.oidcNonce = nonce;
  req.session.oidcCodeVerifier = codeVerifier;

  const authorizationUrl = openidClient.buildAuthorizationUrl(oidcClient, {
    redirect_uri: oidcConfig.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  console.log('LOGIN', {
    sessionId: req.sessionID,
    state,
    nonce,
    verifier: !!codeVerifier
  });
  res.redirect(authorizationUrl.href);
});

router.get('/auth/callback', async (req, res) => {
  if (!oidcEnabled) {
    req.session.userId = 'demo-user';
    return res.redirect('/');
  }

  try {
    const currentUrl = new URL(req.originalUrl, `${req.protocol}://${req.headers.host}`);
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
    req.session.userId = claims.sub || claims.email || 'oidc-user';
    req.session.displayName = resolveDisplayName(claims, req.session.userId);
    req.session.oidcState = null;
    req.session.oidcNonce = null;
    req.session.oidcCodeVerifier = null;
    console.log('CALLBACK', {
      sessionId: req.sessionID,
      state: req.session?.oidcState,
      nonce: req.session?.oidcNonce,
      verifier: !!req.session?.oidcCodeVerifier
    });
    res.redirect('/');
  } catch (error) {
    console.error(`${logPrefix} OIDC callback error:`, error);
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
  requireAuth,
  getUserId,
  getDisplayName,
  isAdminUser,
  resolveDisplayName,
};