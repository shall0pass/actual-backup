const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs');

const { port, sessionStorePath, oidcConfig, logPrefix, debugEnabled, getOrCreateSessionSecret } = require('./config');
const auth = require('./auth');
const { restoreAllSchedules } = require('./scheduler');
const pageRoutes = require('./routes/pages');
const apiRoutes = require('./routes/api');

const app = express();
app.set('trust proxy', 1);

fs.mkdirSync(sessionStorePath, { recursive: true });

app.use(
  session({
    store: new FileStore({
      path: sessionStorePath,
      logFn: () => {},
      ttl: 60 * 60 * 4,
    }),
    secret: getOrCreateSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: String(oidcConfig.redirectUri || '').startsWith('https://'),
      maxAge: 1000 * 60 * 60 * 4,
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(auth.router);
app.use(pageRoutes);
app.use(apiRoutes);

async function start() {
  await auth.initializeOidc();
  restoreAllSchedules();
  app.listen(port, '0.0.0.0', () => {
    console.log(`${logPrefix} ✅ Web portal listening on http://0.0.0.0:${port}`);
    if (debugEnabled) {
      console.log(`${logPrefix} [DEBUG] web.js now serving requests on port`, port);
    }
  });
}

process.on('SIGTERM', () => {
  console.log(`${logPrefix} [DEBUG] web.js received SIGTERM, shutting down gracefully`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`${logPrefix} [DEBUG] web.js received SIGINT, shutting down gracefully`);
  process.exit(0);
});

start().catch((error) => {
  console.error(`${logPrefix} Failed to start web portal:`, error);
  console.error(`${logPrefix} [DEBUG] web.js startup failed, exiting with code 1`);
  process.exit(1);
});