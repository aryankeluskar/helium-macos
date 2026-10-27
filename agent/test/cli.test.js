import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { countingProxy, helium, heliumJson, launchChromium, profileFor, refOf, stopDaemon } from './helpers.js';
import { startSite } from './site.js';

describe('helium CLI against headless Chromium', () => {
  let chrome;
  let site;
  let proxy;
  let env;
  let home;
  let daemonPid;
  let userTab;
  let agentTab;
  let refs = {};

  before(async () => {
    chrome = await launchChromium();
    site = await startSite();
    proxy = await countingProxy(chrome.port);
    home = path.join(chrome.dir, 'agent-home');
    const profile = profileFor(path.join(chrome.dir, 'proxied-profile'), proxy.port, chrome.wsPath);
    env = { ...process.env, HELIUM_USER_DATA_DIR: profile, HELIUM_AGENT_HOME: home };
    delete env.HELIUM_CDP_URL;
  });

  after(async () => {
    if (env) await stopDaemon(env);
    proxy?.close();
    site?.close();
    await chrome?.close();
  });

  const run = (...args) => helium(args, env);
  const ok = async (...args) => {
    const result = await run(...args);
    assert.equal(result.code, 0, `helium ${args.join(' ')} failed: ${result.stderr}`);
    return result.stdout;
  };
  const evaluate = async (js) => (await heliumJson(['eval', js], env)).value;

  test('tabs lists the user tab and starts the daemon', async () => {
    const tabs = await heliumJson(['tabs'], env);
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].url, 'about:blank');
    assert.equal(tabs[0].agent, false);
    userTab = tabs[0].id;
    const status = await heliumJson(['daemon', 'status'], env);
    assert.equal(status.connected, true);
    daemonPid = status.pid;
  });

  test('the socket is private', () => {
    assert.equal(fs.statSync(home).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(home, 'daemon.sock')).mode & 0o777, 0o600);
  });

  test('open creates an agent window, and later opens add tabs to it', async () => {
    const out = await ok('open', `${site.url}/next`);
    assert.match(out, /^Opened [0-9A-F]{8} {2}Next page {2}http:\/\/127\.0\.0\.1:\d+\/next/);
    const second = await heliumJson(['open', `${site.url}/`], env);
    agentTab = second.tab.id;
    assert.equal(second.tab.title, 'Helium test page');

    const tabs = await heliumJson(['tabs'], env);
    const agentTabs = tabs.filter((t) => t.agent);
    assert.equal(agentTabs.length, 2);
    assert.equal(tabs.find((t) => t.current).id, agentTab);
    assert.equal(tabs.find((t) => t.id === userTab).agent, false);

    const windowOf = async (targetId) => (await heliumJson(['repl', `return (await cdp('Browser.getWindowForTarget', { targetId: '${targetId}' })).windowId`], env)).value;
    const agentWindow = await windowOf(agentTabs[0].id);
    assert.equal(await windowOf(agentTabs[1].id), agentWindow);
    assert.notEqual(await windowOf(userTab), agentWindow);
  });

  test('snapshot gives refs for interactive and meaningful nodes', async () => {
    const out = await ok('snapshot');
    assert.match(out, /^Tab [0-9A-F]{8} {2}Helium test page/);
    assert.match(out, /- heading "Test page" \[level=1\] \[ref=e\d+\]/);
    assert.match(out, /- link "link to next" \[url=\/next\] \[ref=e\d+\]/);
    assert.match(out, /- combobox "Color" \[options: Red \| Green \| Blue\] \[ref=e\d+\]: Red/);
    refs = {
      name: refOf(out, /textbox "Name"/),
      color: refOf(out, /combobox "Color"/),
      counter: refOf(out, /button "Click me"/),
      later: refOf(out, /button "Load later"/),
      bottom: refOf(out, /Bottom of page/),
      link: refOf(out, /link "link to next"/),
    };
    const json = await heliumJson(['snapshot'], env);
    assert.ok(json.refs >= 10);
  });

  test('click changes the page', async () => {
    const out = await ok('click', refs.counter);
    assert.match(out, /^Clicked e\d+ \(button "Click me"\)/);
    assert.equal(await evaluate("document.getElementById('counter').textContent"), 'Clicked 1');
    await ok('click', refOf(await ok('snapshot'), /button "Clicked 1"/));
    assert.equal(await evaluate('window.clicks'), 2);
  });

  test('wait for text, for a selector, and for idle', async () => {
    const snapshot = await ok('snapshot');
    await ok('click', refOf(snapshot, /button "Load later"/));
    const out = await ok('wait', '--text', 'Loaded later');
    assert.equal(out.trim(), 'Found text "Loaded later".');
    assert.match(await ok('wait', '--selector', '#status'), /Found #status/);
    assert.match(await ok('wait', '--idle'), /idle/);
    const missing = await run('wait', '--text', 'never shows up', '--timeout', '300');
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /Timed out after 0s waiting for text "never shows up"/);
  });

  test('scroll moves the page and brings refs into view', async () => {
    const snapshot = await ok('snapshot');
    const down = await heliumJson(['scroll', 'down'], env);
    assert.ok(down.top > 0);
    const toRef = await heliumJson(['scroll', refOf(snapshot, /Bottom of page/)], env);
    assert.equal(toRef.atBottom, true);
    const up = await heliumJson(['scroll', 'up'], env);
    assert.ok(up.top < toRef.top);
  });

  test('read returns markdown with link URLs', async () => {
    const out = await ok('read');
    assert.match(out, /^# Helium test page\nhttp:\/\/127\.0\.0\.1:\d+\/\n/);
    assert.match(out, /^# Test page$/m);
    assert.match(out, new RegExp(`Some readable text with a \\[link to next\\]\\(${site.url}/next\\)\\.`));
    assert.match(out, /^- First item\n- Second item$/m);
  });

  test('screenshot writes a PNG', async () => {
    const file = path.join(chrome.dir, 'shots', 'page.png');
    const out = await ok('screenshot', '-o', file);
    assert.match(out, /^Saved .*page\.png \(\d/);
    const bytes = fs.readFileSync(file);
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const full = path.join(chrome.dir, 'shots', 'full.png');
    await ok('screenshot', '--full', '-o', full);
    assert.ok(fs.readFileSync(full).readUInt32BE(20) > 3000, 'full-page screenshot is taller than the page');
  });

  test('eval returns values and reports errors', async () => {
    assert.equal(await evaluate('1 + 2'), 3);
    assert.deepEqual(await evaluate('({ a: [1, 2], b: document.title })'), { a: [1, 2], b: 'Helium test page' });
    assert.equal(await evaluate('await new Promise((r) => setTimeout(() => r("later"), 50))'), 'later');
    assert.equal((await ok('eval', 'location.pathname')).trim(), '/');
    const failed = await run('eval', 'throw new Error("boom")');
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /JavaScript error: Error: boom/);
  });

  test('select picks an option by label or value', async () => {
    const snapshot = await ok('snapshot');
    const color = refOf(snapshot, /combobox "Color"/);
    assert.match(await ok('select', color, 'Green'), /Selected "Green" \(value "g"\)/);
    assert.equal(await evaluate("document.querySelector('select').value"), 'g');
    await ok('select', color, 'b');
    assert.equal(await evaluate("document.querySelector('select').value"), 'b');
    const missing = await run('select', color, 'Purple');
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /has no option "Purple"\. Options: Red, Green, Blue/);
    await ok('select', color, 'Green');
  });

  test('type and submit a form', async () => {
    const snapshot = await ok('snapshot');
    const out = await ok('type', refOf(snapshot, /textbox "Name"/), 'Ada Lovelace', '--submit');
    assert.match(out, /Typed into e\d+ \(textbox "Name"\) and pressed Enter/);
    assert.match(out, /Now at: Submitted — http:\/\/127\.0\.0\.1:\d+\/submitted\?name=Ada\+Lovelace&color=g/);
    assert.match(await ok('snapshot'), /paragraph \[ref=e\d+\]: name=Ada Lovelace color=g/);
    assert.match(await ok('read'), /# Submitted\n\nname=Ada Lovelace color=g/);
  });

  test('back and forward move through history', async () => {
    assert.match(await ok('back'), /^Back to [0-9A-F]{8} {2}Helium test page/);
    assert.match(await ok('forward'), /^Forward to [0-9A-F]{8} {2}Submitted/);
    await ok('back');
  });

  test('press sends keys to the focused element', async () => {
    const snapshot = await ok('snapshot');
    await ok('type', refOf(snapshot, /textbox "Name"/), 'Grace');
    await ok('press', 'Shift+Tab');
    await ok('press', 'Tab');
    const out = await ok('press', 'Enter');
    assert.match(out, /Pressed Enter\nNow at: Submitted — .*name=Grace/);
    await ok('back');
  });

  test('snapshot, click and read reach into same-origin iframes', async () => {
    await ok('open', `${site.url}/frame`);
    const snapshot = await ok('snapshot');
    assert.match(snapshot, /- iframe \[ref=e\d+\]:\n {2}- button "Frame button" \[ref=e\d+\]/);
    await ok('click', refOf(snapshot, /button "Frame button"/));
    assert.match(await ok('snapshot'), /button "Pressed"/);
    assert.match(await ok('read'), /Frame text/);
    assert.match(await ok('close'), /^Closed [0-9A-F]{8} {2}Frame page/);
  });

  test("close without a tab refuses to close the user's tab", async () => {
    await ok('read', '--tab', userTab.slice(0, 8));
    const result = await run('close');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /is one of your own tabs; pass its id to close it/);
    await ok('snapshot', '--tab', agentTab.slice(0, 8));
  });

  test('stale or unknown refs give a clear error', async () => {
    const result = await run('click', 'e999');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown ref "e999"|No refs for tab/);
  });

  test('repl runs async JS with the page API', async () => {
    const code = `
      const page = await openTab('${site.url}/next');
      const snapshot = await page.snapshot();
      const home = snapshot.split('\\n').find((line) => line.includes('link "Home"')).match(/ref=(e\\d+)/)[1];
      await page.click(home);
      await page.waitFor('Test page');
      console.log('title', await page.title());
      const text = await page.text();
      const shot = await page.screenshot('repl.png');
      const value = await page.eval((a, b) => a + b, 2, 3);
      await page.close();
      return { tabCount: (await tabs()).length, text: text.slice(0, 11), shot, value };
    `;
    const result = await helium(['repl', '--json'], { ...env }, { input: code });
    assert.equal(result.code, 0, result.stderr);
    const { value, logs } = JSON.parse(result.stdout);
    assert.deepEqual(logs, ['title Helium test page']);
    assert.equal(value.text, '# Test page');
    assert.equal(value.value, 5);
    assert.equal(value.tabCount, 3);
    assert.ok(fs.existsSync(value.shot));
    fs.rmSync(value.shot);
    assert.equal((await ok('repl', '(await cdp("Browser.getVersion")).product.split("/")[0]')).trim(), 'Chrome');
  });

  test('close removes a tab', async () => {
    const before = await heliumJson(['tabs'], env);
    const out = await ok('close', agentTab.slice(0, 8));
    assert.match(out, /^Closed [0-9A-F]{8}/);
    const afterClose = await heliumJson(['tabs'], env);
    assert.equal(afterClose.length, before.length - 1);
    assert.ok(!afterClose.some((t) => t.id === agentTab));
  });

  test('downloads lists what the session downloaded', async () => {
    await ok('open', `${site.url}/download`);
    await ok('click', refOf(await ok('snapshot'), /link "Get the report"/));
    let download;
    for (let i = 0; i < 50 && download?.state !== 'completed'; i++) {
      download = (await heliumJson(['downloads'], env)).session.find((d) => d.filename === 'report.csv');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(download?.state, 'completed');
    assert.ok(download.path.startsWith(chrome.dir), download.path);
    assert.equal(fs.readFileSync(download.path, 'utf8'), 'name,color\nAda,green\n');
    assert.match(await ok('downloads'), /completed +.*report\.csv/);
    await ok('close');
  });

  test("the user's tab was never touched", async () => {
    const tabs = await heliumJson(['tabs'], env);
    assert.equal(tabs.find((t) => t.id === userTab).url, 'about:blank');
  });

  test('every command went through one daemon and one browser connection', async () => {
    const status = await heliumJson(['daemon', 'status'], env);
    assert.equal(status.pid, daemonPid);
    assert.equal(status.browserConnections, 1);
    assert.equal(proxy.connections, 1);
  });
});
