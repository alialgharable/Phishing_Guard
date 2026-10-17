import { loadConfig } from "./config.js";
import { checkChromium, checkReady } from "./diagnostics.js";
import { createServer } from "./http.js";
import { PlaywrightIsolationBackend } from "./browser-sandbox.js";

const config = loadConfig();
if (!config.apiToken) {
  console.error("SANDBOX_API_TOKEN is required; refusing to start unauthenticated sandbox service.");
  process.exit(1);
}
const backend = new PlaywrightIsolationBackend(config);
const server = createServer({
  token: config.apiToken,
  analyze: (input) => backend.analyze(input),
  health: async () => {
    const browser = await checkChromium();
    return browser.ok
      ? { status: "ok", browser: browser.browser, version: browser.version, sandbox: "ready" }
      : { status: "error", browser: browser.browser, sandbox: "not_ready", message: browser.error };
  },
  ready: () => checkReady(config),
});
server.listen(config.port, config.host, () => {
  console.log(`PhishGuard sandbox service listening on ${config.host}:${config.port}`);
});
