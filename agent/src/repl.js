import os from 'node:os';
import path from 'node:path';
import { inspect } from 'node:util';
import vm from 'node:vm';
import { HydrogenError, normalizeUrl, sleep } from './util.js';

export async function runRepl(browser, code, { cwd = process.cwd() } = {}) {
  if (!code || !code.trim()) throw new HydrogenError('Give the REPL some JavaScript, e.g. hydrogen repl "return (await tabs()).length".');
  const logs = [];
  const log = (...values) => logs.push(values.map((v) => (typeof v === 'string' ? v : inspect(v, { depth: 4 }))).join(' '));
  const context = vm.createContext({
    ...api(browser, cwd),
    console: { log, info: log, warn: log, error: log, debug: log },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    structuredClone,
    fetch,
  });
  let script;
  try {
    script = new vm.Script(`(async () => (${code}\n))()`, { filename: 'repl.js' });
  } catch {
    script = new vm.Script(`(async () => {${code}\n})()`, { filename: 'repl.js' });
  }
  const value = await script.runInContext(context);
  return { value: plain(value), logs };
}

function plain(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return inspect(value);
  }
}

function api(browser, cwd) {
  const file = (name) => path.resolve(cwd, name.replace(/^~(?=\/|$)/, os.homedir()));

  class Page {
    constructor(id) {
      this.id = id;
    }

    toJSON() {
      return { tab: this.id };
    }

    async info() {
      return browser.tabInfo(this.id);
    }

    async url() {
      return (await this.info()).url;
    }

    async title() {
      return (await this.info()).title;
    }

    async goto(url) {
      return (await browser.open(normalizeUrl(url, cwd), { tab: this.id })).tab;
    }

    async snapshot() {
      return (await browser.snapshot({ tab: this.id })).snapshot;
    }

    click(ref) {
      return browser.click(ref, { tab: this.id });
    }

    type(ref, text, { submit = false } = {}) {
      return browser.type(ref, String(text), { tab: this.id, submit });
    }

    press(key) {
      return browser.press(key, { tab: this.id });
    }

    select(ref, value) {
      return browser.select(ref, value, { tab: this.id });
    }

    scroll(target = 'down') {
      return browser.scroll(target, { tab: this.id });
    }

    async text() {
      return (await browser.read({ tab: this.id })).text;
    }

    async screenshot(name = path.join(os.tmpdir(), `hydrogen-${Date.now()}.png`), { full = false } = {}) {
      return (await browser.screenshot({ tab: this.id, path: file(name), full })).path;
    }

    async eval(js, ...args) {
      const expression = typeof js === 'function' ? `(${js})(...${JSON.stringify(args)})` : String(js);
      return (await browser.eval(expression, { tab: this.id })).value;
    }

    waitFor(what, { timeout } = {}) {
      const condition = typeof what === 'string' ? { text: what } : { ...what };
      return browser.wait({ tab: this.id, ...condition, timeoutMs: condition.timeout ?? timeout });
    }

    async back() {
      return (await browser.back({ tab: this.id })).tab;
    }

    async forward() {
      return (await browser.forward({ tab: this.id })).tab;
    }

    async focus() {
      return (await browser.focus(this.id)).tab;
    }

    async close() {
      return (await browser.close(this.id)).tab;
    }
  }

  return {
    tabs: () => browser.listTabs(),
    openTab: async (url, { newWindow = false } = {}) => new Page((await browser.open(normalizeUrl(url, cwd), { newWindow })).tab.id),
    page: async (tab) => new Page(await browser.resolveTab(tab)),
    cdp: (method, params, tabId) => browser.cdpRaw(method, params, tabId),
    downloads: () => browser.downloads(),
    sleep,
  };
}
