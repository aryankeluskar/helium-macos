import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect } from './cdp.js';
import { findEndpoint } from './endpoint.js';
import { keyEvents } from './keys.js';
import * as scripts from './page-scripts.js';
import { buildSnapshot } from './snapshot.js';
import { HeliumError, readJson, shortId, sleep, writePrivateJson } from './util.js';

const WORLD = 'helium-agent';
const NOT_TEXT = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'slider', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'image']);

export class Browser {
  static async connect({ env = process.env, statePath } = {}) {
    const endpoint = await findEndpoint(env);
    const connection = await connect(endpoint);
    const browser = new Browser(connection, endpoint, statePath);
    await browser.init();
    return browser;
  }

  constructor(connection, endpoint, statePath) {
    this.cdp = connection;
    this.endpoint = endpoint;
    this.statePath = statePath;
    this.targets = new Map();
    this.tabs = new Map();
    this.sessions = new Map();
    this.attaching = new Map();
    this.agentTabs = new Set();
    this.current = null;
    this.downloadLog = new Map();
    this.downloadEvents = false;
  }

  async init() {
    const cdp = this.cdp;
    cdp.on('Target.targetCreated', ({ targetInfo }) => this.trackTarget(targetInfo));
    cdp.on('Target.targetInfoChanged', ({ targetInfo }) => this.targets.set(targetInfo.targetId, targetInfo));
    cdp.on('Target.targetDestroyed', ({ targetId }) => this.forget(targetId));
    cdp.on('Target.detachedFromTarget', ({ sessionId }) => {
      const tab = this.sessions.get(sessionId);
      this.sessions.delete(sessionId);
      if (tab) this.tabs.delete(tab.id);
    });
    cdp.on('Page.frameStartedLoading', ({ frameId }, sessionId) => this.mainFrame(sessionId, frameId, (tab) => (tab.loading = true)));
    cdp.on('Page.frameStoppedLoading', ({ frameId }, sessionId) => this.mainFrame(sessionId, frameId, (tab) => (tab.loading = false)));
    cdp.on('Page.frameNavigated', ({ frame }, sessionId) => {
      if (!frame.parentId) this.mainFrame(sessionId, frame.id, (tab) => (tab.refs = new Map()));
    });
    cdp.on('Page.javascriptDialogOpening', (dialog, sessionId) => this.handleDialog(dialog, sessionId));
    cdp.on('Browser.downloadWillBegin', ({ guid, url, suggestedFilename }) => {
      this.downloadLog.set(guid, { guid, url, filename: suggestedFilename, state: 'inProgress', receivedBytes: 0, totalBytes: 0, started: new Date().toISOString() });
    });
    cdp.on('Browser.downloadProgress', ({ guid, state, receivedBytes, totalBytes, filePath }) => {
      const download = this.downloadLog.get(guid);
      if (download) Object.assign(download, { state, receivedBytes, totalBytes }, filePath ? { path: filePath } : {});
    });

    await cdp.send('Target.setDiscoverTargets', { discover: true });
    const { targetInfos } = await cdp.send('Target.getTargets');
    for (const info of targetInfos) this.targets.set(info.targetId, info);
    const saved = (this.statePath && readJson(this.statePath)) || {};
    for (const id of saved.agentTabs ?? []) if (this.targets.has(id)) this.agentTabs.add(id);
    if (this.targets.has(saved.current)) this.current = saved.current;
    try {
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true });
      this.downloadEvents = true;
    } catch {}
  }

  disconnect() {
    this.cdp.close();
  }

  trackTarget(info) {
    this.targets.set(info.targetId, info);
    if (info.type === 'page' && info.openerId && this.agentTabs.has(info.openerId)) {
      this.agentTabs.add(info.targetId);
      this.save();
    }
  }

  forget(targetId) {
    this.targets.delete(targetId);
    const tab = this.tabs.get(targetId);
    if (tab) this.sessions.delete(tab.sessionId);
    this.tabs.delete(targetId);
    if (this.agentTabs.delete(targetId) || this.current === targetId) {
      if (this.current === targetId) this.current = null;
      this.save();
    }
  }

  save() {
    if (!this.statePath) return;
    try {
      writePrivateJson(this.statePath, { agentTabs: [...this.agentTabs], current: this.current });
    } catch {}
  }

  mainFrame(sessionId, frameId, update) {
    const tab = this.sessions.get(sessionId);
    if (tab && frameId === tab.id) update(tab);
  }

  async handleDialog({ type, message, defaultPrompt }, sessionId) {
    const tab = this.sessions.get(sessionId);
    if (!tab || !(this.agentTabs.has(tab.id) || tab.busy > 0)) return;
    tab.notes.push(`A ${type} dialog said "${message}"; it was accepted.`);
    await this.cdp.send('Page.handleJavaScriptDialog', { accept: true, promptText: defaultPrompt ?? '' }, sessionId).catch(() => {});
  }

  pages() {
    return [...this.targets.values()].filter((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  }

  async listTabs() {
    const { targetInfos } = await this.cdp.send('Target.getTargets');
    for (const info of targetInfos) this.targets.set(info.targetId, info);
    return this.pages().map((t, i) => this.describeTab(t, i + 1));
  }

  effectiveCurrent() {
    try {
      return this.currentTab();
    } catch {
      return null;
    }
  }

  describeTab(info, index) {
    const tab = { id: info.targetId, title: info.title, url: info.url, agent: this.agentTabs.has(info.targetId), current: info.targetId === this.effectiveCurrent() };
    return index ? { index, ...tab } : tab;
  }

  async tabInfo(id) {
    const { targetInfo } = await this.cdp.send('Target.getTargetInfo', { targetId: id });
    this.targets.set(id, targetInfo);
    return this.describeTab(targetInfo);
  }

  async resolveTab(spec, { makeCurrent = true } = {}) {
    if (spec === undefined || spec === null || spec === '') return this.currentTab();
    const value = String(spec).trim().toLowerCase();
    const tabs = await this.listTabs();
    let match = /^\d{1,3}$/.test(value) ? tabs[Number(value) - 1] : undefined;
    if (!match) {
      const found = tabs.filter((t) => t.id.toLowerCase().startsWith(value));
      if (found.length > 1) throw new HeliumError(`Tab "${spec}" matches ${found.length} tabs; use more characters of the id.`);
      match = found[0];
    }
    if (!match) throw new HeliumError(`No tab "${spec}". Run \`helium tabs\` to list tabs.`);
    if (makeCurrent && this.current !== match.id) {
      this.current = match.id;
      this.save();
    }
    return match.id;
  }

  currentTab() {
    if (this.current && this.targets.has(this.current)) return this.current;
    const agentTab = [...this.agentTabs].reverse().find((id) => this.targets.has(id));
    if (agentTab) return agentTab;
    throw new HeliumError('There is no agent tab yet. Open one with `helium open <url>`, or pass --tab <id> (see `helium tabs`).');
  }

  async session(id) {
    const existing = this.tabs.get(id);
    if (existing) return existing;
    if (!this.attaching.has(id)) {
      const attach = (async () => {
        const { sessionId } = await this.cdp.send('Target.attachToTarget', { targetId: id, flatten: true });
        const tab = { id, sessionId, refs: new Map(), loading: false, busy: 0, notes: [] };
        this.sessions.set(sessionId, tab);
        this.tabs.set(id, tab);
        await this.cdp.send('Page.enable', {}, sessionId);
        if (this.agentTabs.has(id)) await this.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId).catch(() => {});
        return tab;
      })();
      this.attaching.set(id, attach);
      attach.finally(() => this.attaching.delete(id)).catch(() => {});
    }
    return this.attaching.get(id);
  }

  async send(id, method, params = {}, timeoutMs) {
    const tab = await this.session(id);
    return this.cdp.send(method, params, tab.sessionId, timeoutMs);
  }

  async withTab(spec, action) {
    const id = await this.resolveTab(spec);
    const tab = await this.session(id);
    tab.busy++;
    try {
      const result = await action(id, tab);
      const notes = tab.notes.splice(0);
      return notes.length ? { ...result, notes } : result;
    } finally {
      tab.busy--;
      if (!tab.busy) this.cdp.send('Runtime.releaseObjectGroup', { objectGroup: WORLD }, tab.sessionId).catch(() => {});
    }
  }

  async evaluate(id, expression, { isolated = false, userGesture = false, timeoutMs } = {}) {
    const params = { expression, returnByValue: true, awaitPromise: true, userGesture };
    if (isolated) {
      const { executionContextId } = await this.send(id, 'Page.createIsolatedWorld', { frameId: id, worldName: WORLD });
      params.contextId = executionContextId;
    }
    const result = await this.send(id, 'Runtime.evaluate', params, timeoutMs);
    if (result.exceptionDetails) throw new HeliumError(`JavaScript error: ${describeException(result.exceptionDetails)}`);
    return result.result.value;
  }

  async run(id, fn, ...args) {
    return this.evaluate(id, `(${fn})(...${JSON.stringify(args)})`, { isolated: true });
  }

  async element(id, ref) {
    const tab = await this.session(id);
    const entry = tab.refs.get(ref);
    if (!entry) {
      throw new HeliumError(
        tab.refs.size
          ? `Unknown ref "${ref}" for tab ${shortId(id)}. Refs come from the latest \`helium snapshot\` of that tab.`
          : `No refs for tab ${shortId(id)}: take a \`helium snapshot\` first (refs reset when the page navigates).`,
      );
    }
    const { executionContextId } = await this.send(id, 'Page.createIsolatedWorld', { frameId: entry.frameId ?? id, worldName: WORLD });
    let object;
    try {
      ({ object } = await this.send(id, 'DOM.resolveNode', { backendNodeId: entry.backendNodeId, executionContextId, objectGroup: WORLD }));
    } catch {
      throw new HeliumError(`Ref "${ref}" no longer exists on the page. Take a new \`helium snapshot\`.`);
    }
    const resolved = await this.send(id, 'Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: scripts.toElement.toString(), objectGroup: WORLD });
    if (resolved.result.subtype === 'null') throw new HeliumError(`Ref "${ref}" no longer exists on the page. Take a new \`helium snapshot\`.`);
    return { ...entry, ref, objectId: resolved.result.objectId };
  }

  async callOn(id, objectId, fn, ...args) {
    const result = await this.send(id, 'Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: fn.toString(),
      arguments: args.map((value) => ({ value })),
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new HeliumError(`JavaScript error: ${describeException(result.exceptionDetails)}`);
    return result.result.value;
  }

  async newAgentWindow() {
    const { targetId } = await this.cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, focus: false });
    this.agentTabs.add(targetId);
    this.save();
    return targetId;
  }

  async newAgentTab() {
    const alive = (id) => this.targets.has(id);
    const opener = this.agentTabs.has(this.current) && alive(this.current) ? this.current : [...this.agentTabs].reverse().find(alive);
    if (!opener) return null;
    const created = new Promise((resolve) => {
      const finish = (targetId) => {
        clearTimeout(timer);
        this.cdp.off('Target.targetCreated', listener);
        resolve(targetId);
      };
      const listener = ({ targetInfo }) => {
        if (targetInfo.type === 'page' && targetInfo.openerId === opener) finish(targetInfo.targetId);
      };
      const timer = setTimeout(() => finish(null), 5000);
      this.cdp.on('Target.targetCreated', listener);
    });
    try {
      await this.evaluate(opener, "window.open('about:blank', '_blank', 'noopener,noreferrer'), true", { isolated: true, userGesture: true, timeoutMs: 5000 });
    } catch {
      return null;
    }
    const id = await created;
    if (id) {
      this.agentTabs.add(id);
      this.save();
    }
    return id;
  }

  async open(url, { tab, newWindow = false } = {}) {
    let id;
    const existing = tab !== undefined && tab !== null && tab !== '';
    if (existing) id = await this.resolveTab(tab);
    else if (!newWindow) id = await this.newAgentTab();
    if (!id) id = await this.newAgentWindow();
    this.current = id;
    this.save();
    return this.withTab(id, async () => {
      const result = await this.send(id, 'Page.navigate', { url });
      if (result.errorText && result.errorText !== 'net::ERR_ABORTED') throw new HeliumError(`Could not open ${url}: ${result.errorText}`);
      const loaded = await this.waitForLoad(id, 30_000);
      if (!existing) await this.send(id, 'Page.resetNavigationHistory').catch(() => {});
      return { tab: await this.tabInfo(id), loaded };
    });
  }

  async close(spec) {
    const id = await this.resolveTab(spec, { makeCurrent: false });
    if ((spec === undefined || spec === null || spec === '') && !this.agentTabs.has(id)) {
      throw new HeliumError(`The current tab ${shortId(id)} is one of your own tabs; pass its id to close it.`);
    }
    const info = await this.tabInfo(id);
    await this.cdp.send('Target.closeTarget', { targetId: id });
    this.forget(id);
    return { tab: info };
  }

  async focus(spec) {
    const id = await this.resolveTab(spec);
    await this.cdp.send('Target.activateTarget', { targetId: id });
    return { tab: await this.tabInfo(id) };
  }

  async snapshot({ tab } = {}) {
    return this.withTab(tab, async (id, state) => {
      const info = await this.tabInfo(id);
      const { nodes } = await this.send(id, 'Accessibility.getFullAXTree', {}, 60_000);
      const { text, refs } = buildSnapshot(nodes, info.url, await this.frameTrees(id));
      state.refs = refs;
      return { tab: info, snapshot: text, refs: refs.size };
    });
  }

  async frameTrees(id) {
    const { frameTree } = await this.send(id, 'Page.getFrameTree');
    const frameIds = [];
    const walk = (node) => {
      for (const child of node.childFrames ?? []) {
        frameIds.push(child.frame.id);
        walk(child);
      }
    };
    walk(frameTree);
    const trees = new Map();
    await Promise.all(
      frameIds.map(async (frameId) => {
        try {
          const [{ nodes }, { backendNodeId }] = await Promise.all([
            this.send(id, 'Accessibility.getFullAXTree', { frameId }, 60_000),
            this.send(id, 'DOM.getFrameOwner', { frameId }),
          ]);
          trees.set(backendNodeId, { frameId, nodes });
        } catch {}
      }),
    );
    return trees;
  }

  async click(ref, { tab } = {}) {
    return this.withTab(tab, async (id) => {
      const el = await this.element(id, ref);
      const before = this.before(id);
      await this.send(id, 'DOM.scrollIntoViewIfNeeded', { objectId: el.objectId }).catch(() => {});
      const point = await this.clickablePoint(id, el.objectId);
      let method = 'mouse';
      if (point && (el.frameId || (await this.callOn(id, el.objectId, scripts.hitTest, point.x, point.y)))) {
        await this.mouseClick(id, point.x, point.y);
      } else {
        method = 'script';
        await this.callOn(id, el.objectId, function clickElement() {
          this.click();
        });
      }
      return { ref, role: el.role, name: el.name, method, ...(await this.settle(id, before)) };
    });
  }

  async clickablePoint(id, objectId) {
    try {
      const { model } = await this.send(id, 'DOM.getBoxModel', { objectId });
      for (const quad of [model.content, model.border]) {
        const xs = [quad[0], quad[2], quad[4], quad[6]];
        const ys = [quad[1], quad[3], quad[5], quad[7]];
        const width = Math.max(...xs) - Math.min(...xs);
        const height = Math.max(...ys) - Math.min(...ys);
        if (width >= 1 && height >= 1) return { x: xs.reduce((a, b) => a + b) / 4, y: ys.reduce((a, b) => a + b) / 4 };
      }
    } catch {}
    return null;
  }

  async mouseClick(id, x, y) {
    await this.send(id, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send(id, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await this.send(id, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  }

  async type(ref, text, { tab, submit = false } = {}) {
    return this.withTab(tab, async (id) => {
      const el = await this.element(id, ref);
      const before = this.before(id);
      await this.send(id, 'DOM.scrollIntoViewIfNeeded', { objectId: el.objectId }).catch(() => {});
      let state = await this.callOn(id, el.objectId, scripts.prepareForTyping, false);
      if (state === 'not-editable' && !NOT_TEXT.has(el.role)) {
        const point = await this.clickablePoint(id, el.objectId);
        if (point) await this.mouseClick(id, point.x, point.y);
        state = await this.callOn(id, el.objectId, scripts.prepareForTyping, true);
      }
      if (state === 'not-editable') throw new HeliumError(`Ref "${ref}" (${el.role}) isn't a text field. Use the ref of a textbox from the snapshot.`);
      if (state !== 'ready') throw new HeliumError(`Ref "${ref}" (${el.role}) is ${state}.`);
      if (text) await this.send(id, 'Input.insertText', { text });
      else await this.pressKeys(id, 'Delete');
      if (submit) await this.pressKeys(id, 'Enter');
      return { ref, role: el.role, name: el.name, submitted: submit, ...(await this.settle(id, before)) };
    });
  }

  async press(key, { tab } = {}) {
    return this.withTab(tab, async (id) => {
      const before = this.before(id);
      await this.pressKeys(id, key);
      return { key, ...(await this.settle(id, before)) };
    });
  }

  async pressKeys(id, combo) {
    for (const event of keyEvents(combo)) await this.send(id, 'Input.dispatchKeyEvent', event);
  }

  async select(ref, value, { tab } = {}) {
    return this.withTab(tab, async (id) => {
      const el = await this.element(id, ref);
      const result = await this.callOn(id, el.objectId, scripts.selectOption, String(value));
      if (result.error) throw new HeliumError(`Ref "${ref}" ${result.error}.`);
      return { ref, ...result };
    });
  }

  async scroll(target = 'down', { tab } = {}) {
    return this.withTab(tab, async (id) => {
      if (target === 'up' || target === 'down') return { direction: target, ...(await this.run(id, scripts.scrollPage, target)) };
      const el = await this.element(id, target);
      return { ref: target, ...(await this.callOn(id, el.objectId, scripts.scrollToElement)) };
    });
  }

  async read({ tab, maxChars = 100_000 } = {}) {
    return this.withTab(tab, (id) => this.run(id, scripts.readable, maxChars));
  }

  async screenshot({ tab, path: file, full = false } = {}) {
    return this.withTab(tab, async (id) => {
      const params = { format: 'png' };
      if (full) {
        const metrics = await this.send(id, 'Page.getLayoutMetrics');
        const size = metrics.cssContentSize ?? metrics.contentSize;
        params.captureBeyondViewport = true;
        params.clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.min(Math.ceil(size.height), 16_384), scale: 1 };
      }
      let data;
      try {
        ({ data } = await this.send(id, 'Page.captureScreenshot', params, 30_000));
      } catch (error) {
        throw new HeliumError(`${error.message}\nIf the tab is in the background, bring it forward with \`helium focus ${shortId(id)}\` and try again.`);
      }
      const bytes = Buffer.from(data, 'base64');
      if (file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes);
      }
      return { tab: await this.tabInfo(id), path: file, bytes: bytes.length, data: file ? undefined : data };
    });
  }

  async eval(expression, { tab } = {}) {
    return this.withTab(tab, async (id) => {
      const params = { expression, awaitPromise: true, userGesture: true, replMode: true, objectGroup: WORLD };
      const { result, exceptionDetails } = await this.send(id, 'Runtime.evaluate', params, 60_000);
      if (exceptionDetails) throw new HeliumError(`JavaScript error: ${describeException(exceptionDetails)}`);
      if (result.type === 'undefined') return { value: undefined };
      if (!result.objectId) return { value: result.value ?? result.unserializableValue ?? result.description };
      if (['node', 'error', 'function', 'regexp', 'date', 'proxy', 'promise'].includes(result.subtype ?? result.type)) {
        return { value: result.description };
      }
      try {
        const json = await this.send(id, 'Runtime.callFunctionOn', { objectId: result.objectId, functionDeclaration: 'function () { return this; }', returnByValue: true });
        return { value: json.result.value ?? result.description };
      } catch {
        return { value: result.description };
      }
    });
  }

  async wait({ tab, text, selector, idle = false, timeoutMs = 30_000 } = {}) {
    if (text === undefined && selector === undefined && !idle) throw new HeliumError('Wait for what? Pass --text, --selector or --idle.');
    return this.withTab(tab, async (id, state) => {
      const deadline = Date.now() + timeoutMs;
      let quietSince = 0;
      let lastResources = -1;
      while (Date.now() < deadline) {
        try {
          if (text !== undefined && (await this.run(id, scripts.hasText, text))) return { found: 'text', text };
          if (selector !== undefined && (await this.run(id, scripts.hasSelector, selector))) return { found: 'selector', selector };
          if (idle) {
            const page = await this.run(id, scripts.pageState);
            const settled = page.readyState === 'complete' && !state.loading && page.resources === lastResources;
            lastResources = page.resources;
            if (!settled) quietSince = 0;
            else if (!quietSince) quietSince = Date.now();
            else if (Date.now() - quietSince >= 500) return { found: 'idle' };
          }
        } catch (error) {
          if (error instanceof HeliumError && /JavaScript error/.test(error.message)) throw error;
        }
        await sleep(100);
      }
      const what = text !== undefined ? `text "${text}"` : selector !== undefined ? `selector ${selector}` : 'the page to go idle';
      throw new HeliumError(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}.`);
    });
  }

  async back({ tab } = {}) {
    return this.history(tab, -1);
  }

  async forward({ tab } = {}) {
    return this.history(tab, 1);
  }

  async history(spec, delta) {
    return this.withTab(spec, async (id) => {
      const { currentIndex, entries } = await this.send(id, 'Page.getNavigationHistory');
      const entry = entries[currentIndex + delta];
      if (!entry) throw new HeliumError(`There is no page to go ${delta < 0 ? 'back' : 'forward'} to.`);
      await this.send(id, 'Page.navigateToHistoryEntry', { entryId: entry.id });
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const now = await this.send(id, 'Page.getNavigationHistory').catch(() => null);
        if (now?.currentIndex === currentIndex + delta) break;
        await sleep(50);
      }
      const loaded = await this.waitForLoad(id, 15_000);
      return { tab: await this.tabInfo(id), loaded };
    });
  }

  async waitForLoad(id, timeoutMs) {
    const tab = await this.session(id);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await this.run(id, scripts.pageState).catch(() => null);
      if (state?.readyState === 'complete' && !tab.loading) return true;
      await sleep(100);
    }
    return false;
  }

  before(id) {
    return { targets: new Set(this.targets.keys()), url: this.targets.get(id)?.url };
  }

  async settle(id, before) {
    await sleep(150);
    const tab = await this.session(id);
    if (tab.loading) await this.waitForLoad(id, 10_000);
    const info = await this.tabInfo(id);
    const result = { tab: info, navigated: info.url !== before.url };
    const opened = this.pages().filter((t) => !before.targets.has(t.targetId)).map((t) => this.describeTab(t));
    return opened.length ? { ...result, opened } : result;
  }

  async downloads({ limit = 10 } = {}) {
    const dir = path.join(os.homedir(), 'Downloads');
    let recent = [];
    try {
      recent = fs
        .readdirSync(dir)
        .filter((name) => !name.startsWith('.'))
        .map((name) => {
          const stat = fs.statSync(path.join(dir, name));
          return { path: path.join(dir, name), bytes: stat.size, modified: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.modified.localeCompare(a.modified))
        .slice(0, limit);
    } catch {}
    return { tracking: this.downloadEvents, session: [...this.downloadLog.values()], dir, recent };
  }

  async cdpRaw(method, params = {}, tab) {
    if (tab === undefined || tab === null) return this.cdp.send(method, params);
    const id = await this.resolveTab(tab);
    return this.send(id, method, params);
  }
}

function describeException(details) {
  const exception = details.exception;
  return exception?.description?.split('\n')[0] ?? exception?.value ?? details.text;
}
