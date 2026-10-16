const targets = [
  ["public-https", "https://example.com/"],
  ["localhost", "http://127.0.0.1:8787/health"],
  ["metadata", "http://169.254.169.254/latest/meta-data/"],
  ["private", "http://10.0.0.1/"],
] as const;

async function main(): Promise<void> {
  const results = await Promise.all(
    targets.map(async ([name, url]) => {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(5000),
        });
        return { name, reachable: true, status: response.status };
      } catch (error) {
        return {
          name,
          reachable: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  const publicOk =
    results.find((result) => result.name === "public-https")?.reachable ===
    true;
  const blocked = results
    .filter((result) =>
      ["localhost", "metadata", "private"].includes(result.name),
    )
    .every((result) => !result.reachable);
  process.stdout.write(JSON.stringify({ ok: publicOk && blocked, results }));
  if (!(publicOk && blocked)) process.exitCode = 1;
}

void main();
