// @actual-app/api holds one global connection/open-budget per Node process,
// so any two callers touching it concurrently (a scheduled backup and a
// tap-to-pay request, or two tap-to-pay requests for different budgets)
// would corrupt each other's session. This serializes all such access
// process-wide.
let tail = Promise.resolve();

function withActualLock(fn) {
  const run = tail.then(fn, fn);
  // Swallow the result/error here so one caller's rejection doesn't block
  // the next caller in the chain; each caller still gets its own outcome
  // via the returned promise.
  tail = run.then(() => {}, () => {});
  return run;
}

module.exports = { withActualLock };
