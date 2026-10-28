const outcomes = {};
const filter = { urls: ['<all_urls>'] };
const restored = chrome.storage.local.get('outcomes').then(({ outcomes: stored = {} }) => Object.assign(outcomes, stored));

function record(url, outcome) {
  restored.then(() => {
    if (!(url in outcomes)) {
      outcomes[url] = outcome;
      chrome.storage.local.set({ outcomes });
    }
  });
}

chrome.webRequest.onBeforeRedirect.addListener((details) => {
  if (/^(chrome-extension|data):/.test(details.redirectUrl)) record(details.url, 'stubbed');
}, filter);

chrome.webRequest.onErrorOccurred.addListener((details) => {
  record(details.url, details.error === 'net::ERR_BLOCKED_BY_CLIENT' ? 'blocked' : details.error);
}, filter);

chrome.webRequest.onCompleted.addListener((details) => {
  record(details.url, `loaded (${details.statusCode})`);
}, filter);
