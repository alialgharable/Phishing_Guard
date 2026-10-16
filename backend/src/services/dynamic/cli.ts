// cli.ts — runs INSIDE the container.
// Usage: node dist/dynamic/cli.js <url> '<optionsJson>'
import { detonate } from "./detonator";

const [url, optsJson] = process.argv.slice(2);
if (!url) {
  process.stderr.write("Usage: cli.js <url> [optionsJson]\n");
  process.exit(1);
}
detonate(url, optsJson ? JSON.parse(optsJson) : {})
  .then((r) =>
    process.stdout.write(
      JSON.stringify({
        ...r,
        screenshot: r.screenshot?.toString("base64") ?? null,
        faviconBytes: r.faviconBytes?.toString("base64") ?? null,
      }),
    ),
  )
  .catch((e) => {
    process.stderr.write(String(e));
    process.exit(1);
  });
