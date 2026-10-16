const { findBrandMatches } = require("./dist/src/services/url/similarityAnalyzer");

console.log(JSON.stringify(findBrandMatches("https://www.google.com"), null, 2));
