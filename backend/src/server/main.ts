import { createHttpServer } from "./httpServer";
import { loadServerConfig } from "./config";

const config = loadServerConfig();
const server = createHttpServer(undefined, config);
server.listen(config.port, config.host, () => {
  console.log(
    `PhishGuard API listening on http://${config.host}:${config.port}`,
  );
});

function shutdown(): void {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
