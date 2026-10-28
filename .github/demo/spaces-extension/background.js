const spaces = [
  {title: 'Work', color: 'blue', urls: ['https://github.com/imputnet/helium', 'https://news.ycombinator.com', 'https://lobste.rs']},
  {title: 'Personal', color: 'pink', urls: ['https://www.wikipedia.org', 'https://old.reddit.com', 'https://example.com']},
  {title: 'Research', color: 'green', urls: ['https://arxiv.org', 'https://en.wikipedia.org/wiki/Arc_(web_browser)', 'https://www.chromium.org']},
];

async function createSpaces() {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  for (const space of spaces) {
    const tabIds = [];
    for (const url of space.urls) {
      const tab = await chrome.tabs.create({url, active: false});
      tabIds.push(tab.id);
    }
    const groupId = await chrome.tabs.group({tabIds});
    await chrome.tabGroups.update(groupId, {title: space.title, color: space.color});
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const {created} = await chrome.storage.local.get('created');
  if (created) return;
  await chrome.storage.local.set({created: true});
  createSpaces();
});

chrome.runtime.onStartup.addListener(() => {});
chrome.tabs.onActivated.addListener(() => {});
setInterval(() => chrome.runtime.getPlatformInfo(), 20_000);
