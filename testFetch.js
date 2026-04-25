const fs = require('fs');

async function doFetch() {
  try {
    const res = await fetch('http://127.0.0.1:8000/api/v1/aiMatch/ai-match-influencer/66ceb059f13e55d5bbd19d67?type=brands');
    const text = await res.text();
    fs.writeFileSync('fetch-result.txt', `Status: ${res.status}\nBody: ${text}`);
  } catch(e) {
    fs.writeFileSync('fetch-result.txt', `Error: ${e.message}\nStack: ${e.stack}`);
  }
}
doFetch();
