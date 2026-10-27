import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { countingProxy, helium, heliumJson, launchChromium, profileFor, stopDaemon, waitForExit } from './helpers.js';

describe('endpoint discovery', () => {
  let dir;
  const envFor = (extra) => {
    const env = { ...process.env, HELIUM_AGENT_HOME: path.join(dir, `home-${Math.random().toString(36).slice(2)}`), ...extra };
    if (!extra.HELIUM_CDP_URL) delete env.HELIUM_CDP_URL;
    return env;
  };

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helium-discovery-'));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('remote debugging off: says how to turn it on, starts no daemon', async () => {
    const profile = path.join(dir, 'empty-profile');
    fs.mkdirSync(profile);
    const env = envFor({ HELIUM_USER_DATA_DIR: profile });
    const result = await helium(['tabs'], env);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Remote debugging is off/);
    assert.match(result.stderr, /Start Helium/);
    assert.match(result.stderr, /chrome:\/\/inspect\/#remote-debugging/);
    assert.match(result.stderr, /Allow/);
    assert.ok(!fs.existsSync(path.join(env.HELIUM_AGENT_HOME, 'daemon.sock')));
  });

  test('stale DevToolsActivePort: says Helium is not listening, daemon exits', async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await new Promise((resolve) => server.close(resolve));
    const env = envFor({ HELIUM_USER_DATA_DIR: profileFor(path.join(dir, 'stale-profile'), port, '/devtools/browser/gone') });
    const result = await helium(['tabs'], env);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Nothing is listening at ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/gone/);
    assert.match(result.stderr, /Start Helium/);
    const deadline = Date.now() + 10_000;
    while (fs.existsSync(path.join(env.HELIUM_AGENT_HOME, 'daemon.sock')) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    assert.ok(!fs.existsSync(path.join(env.HELIUM_AGENT_HOME, 'daemon.sock')), 'the failed daemon removed its socket');
  });

  describe('with a browser', () => {
    let chrome;

    before(async () => {
      chrome = await launchChromium();
    });

    after(async () => {
      await chrome?.close();
    });

    test('HELIUM_CDP_URL accepts http://host:port and wins over the profile dir', async () => {
      const env = envFor({ HELIUM_CDP_URL: `http://127.0.0.1:${chrome.port}`, HELIUM_USER_DATA_DIR: path.join(dir, 'empty-profile') });
      try {
        const tabs = await heliumJson(['tabs'], env);
        assert.equal(tabs[0].url, 'about:blank');
        const status = await heliumJson(['daemon', 'status'], env);
        assert.equal(status.endpoint, `ws://127.0.0.1:${chrome.port}${chrome.wsPath}`);
      } finally {
        await stopDaemon(env);
      }
    });

    test('while Helium waits for approval, the CLI says to approve and then carries on', async () => {
      const proxy = await countingProxy(chrome.port, { delayMs: 1500 });
      const env = envFor({ HELIUM_USER_DATA_DIR: profileFor(path.join(dir, 'slow-profile'), proxy.port, chrome.wsPath) });
      try {
        const result = await helium(['tabs'], env);
        assert.equal(result.code, 0, result.stderr);
        assert.match(result.stderr, /Approve the connection in Helium: click "Allow" in the "Allow remote debugging\?" dialog/);
        assert.match(result.stdout, /about:blank/);
        const again = await helium(['tabs'], env);
        assert.equal(again.stderr, '', 'no prompt once the daemon is connected');
        assert.equal(proxy.connections, 1);
      } finally {
        await stopDaemon(env);
        proxy.close();
      }
    });

    test('a refused connection explains how to approve it', async () => {
      const proxy = await countingProxy(chrome.port, { delayMs: 200, refuse: true });
      const env = envFor({ HELIUM_USER_DATA_DIR: profileFor(path.join(dir, 'refused-profile'), proxy.port, chrome.wsPath) });
      try {
        const result = await helium(['tabs'], env);
        assert.equal(result.code, 1);
        assert.match(result.stderr, /closed the connection before it was approved/);
        assert.match(result.stderr, /click "Allow"/);
      } finally {
        await stopDaemon(env);
        proxy.close();
      }
    });

    test('the daemon exits after its idle timeout', async () => {
      const env = envFor({ HELIUM_USER_DATA_DIR: chrome.profile, HELIUM_AGENT_IDLE_MS: '1500' });
      try {
        await heliumJson(['tabs'], env);
        const { pid } = await heliumJson(['daemon', 'status'], env);
        assert.ok(await waitForExit(pid, 8000), 'daemon exited when idle');
      } finally {
        await stopDaemon(env);
      }
    });
  });

  test('the daemon exits when the browser goes away', async () => {
    const chrome = await launchChromium();
    const env = envFor({ HELIUM_USER_DATA_DIR: chrome.profile });
    try {
      await heliumJson(['tabs'], env);
      const { pid } = await heliumJson(['daemon', 'status'], env);
      await chrome.close();
      assert.ok(await waitForExit(pid), 'daemon exited after Helium quit');
      const status = await helium(['daemon', 'status'], env);
      assert.equal(status.code, 3);
    } finally {
      await stopDaemon(env);
      await chrome.close();
    }
  });
});
