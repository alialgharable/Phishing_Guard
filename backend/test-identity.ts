import { analyzeIdentity } from "./src/services/brand/identityAnalyzer";

console.log(JSON.stringify(analyzeIdentity("Google", "Some visible text", [], []), null, 2));
