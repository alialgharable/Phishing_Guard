import { analyzeURL } from "./src/services/url/urlAnalyzer";

const res = analyzeURL("https://www.google.com");
console.log(JSON.stringify(res, null, 2));
