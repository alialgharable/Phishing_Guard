import { ScanOrchestrator } from "./src/services/scan/scanOrchestrator";

async function main() {
  const orchestrator = new ScanOrchestrator();
  const result = await orchestrator.scan("https://www.google.com");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
