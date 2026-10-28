// Drives Hydrogen's spaces with synthetic keyboard, mouse and trackpad input on
// a GitHub Mac and reads which space is current from a test extension, so the
// space bar, `+`, renaming, Ctrl+1…9, new tabs, swipes and relaunch are checked
// rather than only recorded. Appends to demo-out/verify.md.
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const [app, profile, out, swipeTool, axTool, extension] = process.argv.slice(2);
const report = `${out}/verify.md`;
const keys = { 1: 18, 2: 19, 3: 20, 4: 21, 9: 25, t: 17, w: 13, a: 0, return: 36, escape: 53 };
const browserArgs = [
  `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  `--load-extension=${extension}`, '--force-prefers-no-reduced-motion', '--window-position=0,25', '--window-size=1024,710',
];
const passed = [];

function record(ok, text, detail) {
  passed.push(ok);
  appendFileSync(report, `- ${ok ? '✅' : '❌'} ${text}\n${detail ? `  - ${detail}\n` : ''}`);
}

function tool(path, ...args) {
  return execFileSync(path, args.map(String), { timeout: 30_000, encoding: 'utf8' }).trim();
}
const input = (...args) => tool(swipeTool, ...args);
const press = (name, ...modifiers) => input('key', keys[name], ...modifiers);
const swipeAsync = (...args) =>
  new Promise((resolve) => spawn(swipeTool, ['swipe', ...args.map(String)]).on('exit', resolve));

function capture(name, rect) {
  try {
    execFileSync('screencapture', ['-x', ...(rect ? ['-R', rect.join(',')] : []), `${out}/${name}.png`], { timeout: 20_000 });
  } catch {}
}

async function connect() {
  const [port, path] = readFileSync(`${profile}/DevToolsActivePort`, 'utf8').trim().split('\n');
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let next = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
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
      setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(`${method} timed out`))), 20_000);
    });
  return { send, close: () => socket.close() };
}

class Browser {
  async launch() {
    rmSync(`${profile}/DevToolsActivePort`, { force: true });
    const log = openSync(`${out}/spaces-hydrogen.log`, 'a');
    this.process = spawn(`${app}/Contents/MacOS/Hydrogen`, browserArgs, { stdio: ['ignore', log, log] });
    for (let i = 0; i < 60 && !existsSync(`${profile}/DevToolsActivePort`); i++) await sleep(1000);
    await sleep(1000);
    this.cdp = await connect();
    this.worker = null;
  }

  async quit() {
    const exited = new Promise((resolve) => this.process.on('exit', resolve));
    this.cdp?.close();
    this.process.kill('SIGTERM');
    if (await Promise.race([exited.then(() => true), sleep(30_000).then(() => false)])) return;
    this.process.kill('SIGKILL');
    await Promise.race([exited, sleep(10_000)]);
  }

  async attachWorker() {
    for (let i = 0; i < 90; i++) {
      const { targetInfos } = await this.cdp.send('Target.getTargets');
      for (const target of targetInfos) {
        if (target.type !== 'service_worker' || !target.url.endsWith('/background.js')) continue;
        const { sessionId } = await this.cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
        if ((await this.evaluate('chrome.runtime.getManifest().name', sessionId)) === 'Demo spaces') {
          this.worker = sessionId;
          return;
        }
        await this.cdp.send('Target.detachFromTarget', { sessionId });
      }
      await sleep(1000);
    }
    throw new Error("the test extension's service worker never started");
  }

  async evaluate(expression, sessionId = this.worker) {
    const { result, exceptionDetails } = await this.cdp.send(
      'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }

  async inWorker(expression) {
    try {
      return await this.evaluate(expression);
    } catch {
      await this.attachWorker();
      return this.evaluate(expression);
    }
  }

  state() {
    return this.inWorker(`(async () => {
      const windows = await chrome.windows.getAll({windowTypes: ['normal']});
      const window = windows.find((w) => w.focused) ?? windows[0];
      const tabs = await chrome.tabs.query({windowId: window.id});
      const groups = await chrome.tabGroups.query({windowId: window.id});
      const start = (group) => Math.min(...tabs.filter((t) => t.groupId === group.id).map((t) => t.index));
      groups.sort((a, b) => start(a) - start(b));
      const active = tabs.find((t) => t.active);
      return {
        spaces: groups.map((g) => g.title),
        space: groups.findIndex((g) => g.id === active.groupId),
        url: active.url || active.pendingUrl || '',
        tabs: tabs.length,
        windows: windows.length,
      };
    })()`);
  }

  activateTab(fragment) {
    return this.inWorker(`(async () => {
      const [tab] = (await chrome.tabs.query({})).filter((t) => (t.url || t.pendingUrl || '').includes(${JSON.stringify(fragment)}));
      await chrome.tabs.update(tab.id, {active: true});
    })()`);
  }
}

const describe = (state) =>
  `space ${state.space + 1} of ${state.spaces.length} (${state.spaces[state.space] ?? 'none'}), tab ${state.url}`;

async function check(text, action) {
  try {
    const result = await action();
    record(result.ok, text, result.detail);
  } catch (error) {
    record(false, text, `the check failed to run: ${error.message.split('\n')[0]}`);
  }
}

class Geometry {
  measure() {
    const [x, y, width, height] = input('bounds', 'Hydrogen').split(' ').map(Number);
    let sidebarRight = x + 200;
    let note = 'the page area wasn\'t found, so the sidebar is assumed 200 pt wide';
    try {
      const [webX] = tool(axTool, 'webarea', 'Hydrogen').split(' ').map(Number);
      if (webX > x + 100 && webX < x + 500) {
        sidebarRight = webX - 1;
        note = `sidebar ${sidebarRight - x} pt wide`;
      }
    } catch {}
    Object.assign(this, { x, y, width, height, sidebarRight, note });
    this.barY = y + height - 24;
    this.stripX = x + 70;
    this.stripY = y + Math.round(height / 2);
  }

  dot(index, titles) {
    const pitches = titles.map((title) => (/^\p{Extended_Pictographic}/u.test(title ?? '') ? 24 : 12));
    const total = pitches.reduce((a, b) => a + b, 0);
    let left = (this.x + this.sidebarRight) / 2 - total / 2;
    for (let i = 0; i < index; i++) left += pitches[i];
    return [Math.round(left + pitches[index] / 2), this.barY];
  }

  plus() {
    return [this.sidebarRight - 17, this.barY];
  }

  sidebar() {
    return [this.x, this.y, this.sidebarRight - this.x + 1, this.height];
  }

  bar() {
    return [this.x, this.y + this.height - 48, this.sidebarRight - this.x + 1, 48];
  }
}

const wait = (ms = 1200) => sleep(ms);

async function main() {
  mkdirSync(`${profile}/Default`, { recursive: true });
  writeFileSync(`${profile}/Default/Preferences`, JSON.stringify({
    helium: { browser: { layout: 2 }, completed_onboarding: true },
    vertical_tabs: { collapsed_state: false, expand_on_hover: true },
    session: { restore_on_startup: 1 },
  }));
  appendFileSync(report, '\n### Spaces, driven with synthetic keyboard, mouse and trackpad input\n\n');

  const browser = new Browser();
  await browser.launch();
  await browser.attachWorker();
  let state;
  for (let i = 0; i < 60; i++) {
    state = await browser.state();
    if (state.spaces.length === 3 && state.tabs >= 10) break;
    await sleep(1000);
  }
  await sleep(8000);
  input('activate', 'Hydrogen');
  await wait();
  const geometry = new Geometry();
  geometry.measure();
  appendFileSync(report, `Window ${geometry.width}×${geometry.height} pt, ${geometry.note}; test spaces: ${state.spaces.join(', ')}.\n\n`);
  capture('spaces-start', geometry.sidebar());

  const goTo = async (space) => {
    press(String(space + 1), 'ctrl');
    await wait();
  };

  await check('Ctrl+1…9 jumps to space N (Ctrl+2, Ctrl+3, Ctrl+1), and Ctrl+9 with three spaces does nothing', async () => {
    const seen = [];
    for (const n of [2, 3, 1]) {
      press(String(n), 'ctrl');
      await wait();
      seen.push((await browser.state()).space + 1);
    }
    press('9', 'ctrl');
    await wait();
    seen.push((await browser.state()).space + 1);
    return { ok: seen.join() === '2,3,1,1', detail: `landed on spaces ${seen.join(', ')} (expected 2, 3, 1, 1)` };
  });

  await check('The sidebar lists only the current space\'s tabs (`spaces-current-only.png`)', async () => {
    await goTo(0);
    const tree = tool(axTool, 'dump', 'Hydrogen');
    writeFileSync(`${out}/spaces-ax.txt`, tree);
    capture('spaces-current-only', geometry.sidebar());
    const lines = tree.split('\n').filter((line) => !line.startsWith('window '));
    const has = (text) => lines.some((line) => line.includes(text));
    const own = ['Hacker News', 'Lobsters'].filter(has);
    const others = ['Wikipedia', 'Example Domain', 'arXiv'].filter(has);
    return {
      ok: own.length === 2 && others.length === 0,
      detail: `Work's tabs listed: ${own.join(', ') || 'none'}; other spaces' tabs listed: ${others.join(', ') || 'none'}`,
    };
  });

  await check('Clicking a dot in the space bar switches to that space (`space-bar.png`)', async () => {
    capture('space-bar', geometry.bar());
    const seen = [];
    for (const index of [2, 1, 0]) {
      input('click', ...geometry.dot(index, state.spaces));
      await wait();
      seen.push((await browser.state()).space + 1);
    }
    return { ok: seen.join() === '3,2,1', detail: `clicks on dots 3, 2, 1 landed on spaces ${seen.join(', ')}` };
  });

  await check('Each space reopens on the tab you left it on', async () => {
    await goTo(0);
    await browser.activateTab('lobste.rs');
    await wait(600);
    await goTo(1);
    await goTo(0);
    const now = await browser.state();
    return { ok: now.space === 0 && now.url.includes('lobste.rs'), detail: `back in Work: ${now.url}` };
  });

  await check('Cmd+T opens the new tab in the current space, and closing it stays in that space', async () => {
    await goTo(1);
    const before = await browser.state();
    press('t', 'cmd');
    await wait(1500);
    const opened = await browser.state();
    press('escape');
    press('w', 'cmd');
    await wait();
    const closed = await browser.state();
    return {
      ok: opened.space === 1 && opened.tabs === before.tabs + 1 && closed.space === 1 && closed.tabs === before.tabs,
      detail: `new tab in space ${opened.space + 1} (${opened.tabs} tabs); after closing it: ${describe(closed)}`,
    };
  });

  const swipe = async (distance, seconds, hold = 0) => {
    await swipeAsync(geometry.stripX, geometry.stripY, distance, seconds, hold);
    await wait();
    return (await browser.state()).space + 1;
  };

  await check('Two-finger swipes move one space at a time and stop at the first and last space', async () => {
    await goTo(0);
    const seen = [];
    for (const distance of [-420, -420, -420, 420, 420, 420]) seen.push(await swipe(distance, 0.35));
    return { ok: seen.join() === '2,3,3,2,1,1', detail: `from space 1, three swipes left then three right: ${seen.join(', ')} (expected 2, 3, 3, 2, 1, 1)` };
  });

  await check('A quick short flick pages, like Arc', async () => {
    await goTo(0);
    const forward = await swipe(-100, 0.12);
    const back = await swipe(100, 0.12);
    return { ok: forward === 2 && back === 1, detail: `a 100 pt flick left landed on space ${forward}, then right on space ${back}` };
  });

  await check('Dragging a quarter of the way, resting, then lifting snaps back to the same space', async () => {
    await goTo(0);
    const after = await swipe(-100, 0.4, 0.2);
    return { ok: after === 1, detail: `after a 100 pt drag held still for 0.2 s before lifting: space ${after} (expected 1)` };
  });

  await check('Resting the fingers mid-swipe keeps the space under them until they lift', async () => {
    await goTo(0);
    const gesture = swipeAsync(geometry.stripX, geometry.stripY, -260, 0.5, 1.5);
    await sleep(1400);
    const during = (await browser.state()).space + 1;
    capture('swipe-resting', geometry.sidebar());
    await gesture;
    await wait();
    const after = (await browser.state()).space + 1;
    return {
      ok: during === 1 && after === 2,
      detail: `0.9 s into resting at 65% of the way: space ${during} (expected 1); after lifting: space ${after} (expected 2, the nearer one) (\`swipe-resting.png\`)`,
    };
  });

  await check('`+` in the space bar makes a new space and switches to it (`space-bar-new.png`)', async () => {
    await goTo(0);
    input('click', ...geometry.plus());
    await wait(1500);
    state = await browser.state();
    capture('space-bar-new', geometry.bar());
    return {
      ok: state.spaces.length === 4 && state.space === 3,
      detail: `${state.spaces.length} spaces; current: ${describe(state)}`,
    };
  });

  await check('Right-clicking a dot opens the space editor; a name that starts with an emoji becomes its icon (`space-icon.png`)', async () => {
    input('click', ...geometry.dot(0, state.spaces), 'right');
    await wait(1500);
    const editor = tool(axTool, 'dump', 'Hydrogen');
    writeFileSync(`${out}/space-editor-ax.txt`, editor);
    capture('space-editor', geometry.sidebar().map((v, i) => (i === 2 ? v + 300 : v)));
    press('a', 'cmd');
    input('type', '🏠 Home');
    await wait(500);
    press('return');
    await wait();
    state = await browser.state();
    await goTo(0);
    capture('space-icon', geometry.sidebar());
    return {
      ok: state.spaces[0] === '🏠 Home',
      detail: `the first space is now named "${state.spaces[0]}"; editor windows seen: ${editor.split('\n').filter((l) => l.startsWith('window ')).length}`,
    };
  });

  await check('Spaces, their names and the current space come back after quitting and reopening (`spaces-relaunch.png`)', async () => {
    await goTo(2);
    const before = await browser.state();
    await browser.quit();
    await sleep(2000);
    await browser.launch();
    await browser.attachWorker();
    await sleep(8000);
    input('activate', 'Hydrogen');
    await wait();
    geometry.measure();
    const after = await browser.state();
    capture('spaces-relaunch', geometry.sidebar());
    const tree = tool(axTool, 'dump', 'Hydrogen');
    writeFileSync(`${out}/spaces-relaunch-ax.txt`, tree);
    const otherSpaces = ['Hacker News', 'Wikipedia'].filter((t) => tree.split('\n').some((l) => !l.startsWith('window ') && l.includes(t)));
    return {
      ok: after.spaces.join() === before.spaces.join() && after.space === before.space,
      detail: `before: ${before.spaces.join(', ')} on space ${before.space + 1}; after: ${after.spaces.join(', ')} on space ${after.space + 1}; other spaces' tabs listed after relaunch: ${otherSpaces.join(', ') || 'none'}`,
    };
  });

  await browser.quit();
  appendFileSync(report, `\n${passed.filter(Boolean).length} of ${passed.length} spaces checks passed. Trackpad feel and haptics still need a real trackpad.\n`);
}

main()
  .catch((error) => {
    record(false, 'The spaces checks stopped early', error.message.split('\n')[0]);
  })
  .finally(() => process.exit(0));
