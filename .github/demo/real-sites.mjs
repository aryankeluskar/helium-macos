// Loads ad-heavy news and utility sites in one browser on a fresh profile and
// records, over the DevTools protocol (frames in other processes included),
// which requests went to ad and tracker domains and which of those got an
// answer, plus each page's requests, transferred bytes and load time. Writes
// demo-out/real-sites-<label>.json; real-sites.sh compares the browsers.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const [label, binary, profile, out] = process.argv.slice(2);
const sites = [
  'https://www.cnn.com/', 'https://www.dailymail.co.uk/home/index.html', 'https://weather.com/',
  'https://www.speedtest.net/', 'https://www.theverge.com/', 'https://www.foxnews.com/',
  'https://www.businessinsider.com/', 'https://www.cnet.com/', 'https://www.yahoo.com/',
  'https://www.wired.com/', 'https://www.huffpost.com/', 'https://www.independent.co.uk/',
];
const adAndTrackerDomains = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'googletagmanager.com', 'googletagservices.com', 'adservice.google.com', 'adnxs.com', 'criteo.com', 'criteo.net',
  'taboola.com', 'outbrain.com', 'amazon-adsystem.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net',
  'casalemedia.com', 'adsrvr.org', 'moatads.com', 'scorecardresearch.com', 'quantserve.com', 'quantcount.com',
  'facebook.net', 'hotjar.com', 'chartbeat.com', 'chartbeat.net', 'segment.io', 'segment.com', 'mixpanel.com',
  'bat.bing.com', 'clarity.ms', 'analytics.tiktok.com', 'sharethrough.com', 'teads.tv', '3lift.com',
  'indexww.com', 'yieldmo.com', 'media.net', 'adform.net', 'smartadserver.com', 'bidswitch.net',
  'spotxchange.com', 'springserve.com', 'permutive.com', 'permutive.app', 'id5-sync.com', 'rlcdn.com',
  'krxd.net', 'bluekai.com', 'demdex.net', 'omtrdc.net', 'everesttech.net', 'ads-twitter.com',
  'ads.linkedin.com', 'px.ads.linkedin.com', 'ct.pinterest.com', 'sc-static.net', 'adsafeprotected.com',
  'doubleverify.com', 'serving-sys.com', 'zemanta.com', 'gumgum.com', 'kargo.com', 'lijit.com',
  'sovrn.com', 'contextweb.com', 'districtm.io', 'adlightning.com', 'confiant-integrations.net',
  'amplitude.com', 'newrelic.com', 'nr-data.net', 'optimizely.com', 'parsely.com', 'cxense.com',
  'connatix.com', 'jwpltx.com', 'imasdk.googleapis.com', 'ad.gt', 'adsymptotic.com', 'tapad.com',
  'agkn.com', 'mathtag.com', 'turn.com', 'creativecdn.com', 'advertising.com',
  'nativo.com', 'mgid.com', 'revcontent.com', 'zergnet.com', 'liadm.com', 'liveintent.com',
];
const isAdOrTracker = (url) => {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return adAndTrackerDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
};

async function connect() {
  const [port, path] = readFileSync(`${profile}/DevToolsActivePort`, 'utf8').trim().split('\n');
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let next = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id === undefined) {
      for (const listener of listeners) listener(message);
      return;
    }
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`));
    else call.resolve(message.result ?? {});
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject, method });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(`${method} timed out`))), 30_000);
    });
  return { send, listen: (listener) => listeners.add(listener), unlisten: (listener) => listeners.delete(listener) };
}

async function openPage(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  return { targetId, sessionId };
}

async function blockerReady(cdp) {
  const { targetId, sessionId } = await openPage(cdp);
  await cdp.send('Page.navigate', { url: 'https://example.com/' }, sessionId);
  await sleep(4000);
  for (let attempt = 1; attempt <= 30; attempt++) {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?ready=${attempt}', {mode: 'no-cors', cache: 'no-store'}).then(() => 'answered', () => 'blocked')`,
      awaitPromise: true, returnByValue: true,
    }, sessionId).catch(() => ({ result: {} }));
    if (result.value === 'blocked') {
      await cdp.send('Target.closeTarget', { targetId });
      return attempt;
    }
    await sleep(5000);
  }
  await cdp.send('Target.closeTarget', { targetId });
  return null;
}

async function measure(cdp, url) {
  const { targetId, sessionId } = await openPage(cdp);
  const sessions = new Set([sessionId]);
  const requests = new Map();
  let started = 0;
  let loaded = null;
  const listener = async (message) => {
    if (!sessions.has(message.sessionId)) return;
    const { method, params } = message;
    if (method === 'Target.attachedToTarget') {
      const child = params.sessionId;
      sessions.add(child);
      try {
        await cdp.send('Network.enable', {}, child);
        await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, child);
      } catch {}
      cdp.send('Runtime.runIfWaitingForDebugger', {}, child).catch(() => {});
      return;
    }
    const key = `${message.sessionId}:${params?.requestId}`;
    if (method === 'Network.requestWillBeSent') {
      requests.set(key, { url: params.request.url, state: 'pending', bytes: 0 });
    } else if (method === 'Network.responseReceived') {
      const request = requests.get(key);
      if (request) request.state = 'answered';
    } else if (method === 'Network.loadingFinished') {
      const request = requests.get(key);
      if (request) {
        request.state = 'answered';
        request.bytes = params.encodedDataLength ?? 0;
      }
    } else if (method === 'Network.loadingFailed') {
      const request = requests.get(key);
      if (request && request.state !== 'answered') {
        request.state = /BLOCKED_BY_CLIENT|blocked/i.test(`${params.errorText} ${params.blockedReason ?? ''}`) ? 'blocked' : 'failed';
      }
    } else if (method === 'Page.loadEventFired' && message.sessionId === sessionId && loaded === null) {
      loaded = Date.now() - started;
    }
  };
  cdp.listen(listener);
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);
  started = Date.now();
  await cdp.send('Page.navigate', { url }, sessionId).catch(() => {});
  await sleep(20_000);
  cdp.unlisten(listener);
  await cdp.send('Target.closeTarget', { targetId }).catch(() => {});

  const all = [...requests.values()];
  const ads = all.filter((request) => isAdOrTracker(request.url));
  const count = (list, state) => list.filter((request) => request.state === state).length;
  return {
    url,
    requests: all.length,
    answered: count(all, 'answered'),
    megabytes: Math.round(all.reduce((sum, request) => sum + request.bytes, 0) / 1e4) / 100,
    loadSeconds: loaded === null ? null : Math.round(loaded / 100) / 10,
    adRequests: ads.length,
    adAnswered: count(ads, 'answered'),
    adBlocked: count(ads, 'blocked'),
    adHostsAnswered: [...new Set(ads.filter((request) => request.state === 'answered')
      .map((request) => new URL(request.url).hostname))].slice(0, 12),
  };
}

mkdirSync(profile, { recursive: true });
rmSync(`${profile}/DevToolsActivePort`, { force: true });
const log = openSync(`${out}/real-sites-${label}.log`, 'a');
const browser = spawn(binary, [
  `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--window-size=1280,900', 'about:blank',
], { stdio: ['ignore', log, log] });
for (let i = 0; i < 60 && !existsSync(`${profile}/DevToolsActivePort`); i++) await sleep(1000);
await sleep(15_000);
const cdp = await connect();
const ready = await blockerReady(cdp);
const pages = [];
for (const url of sites) {
  try {
    pages.push(await measure(cdp, url));
  } catch (error) {
    pages.push({ url, error: String(error) });
  }
}
writeFileSync(`${out}/real-sites-${label}.json`, JSON.stringify({ label, blockerReadyAfterTries: ready, pages }, null, 2));
await cdp.send('Browser.close').catch(() => {});
await Promise.race([new Promise((resolve) => browser.on('exit', resolve)), sleep(20_000)]);
browser.kill('SIGKILL');
process.exit(0);
