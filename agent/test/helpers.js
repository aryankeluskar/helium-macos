import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BIN = fileURLToPath(new URL('../bin/hydrogen.js', import.meta.url));

export function findChromium() {
  const root = '/opt/pw-browsers';
  const candidates = [process.env.CHROMIUM_PATH, path.join(root, 'chromium')];
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root).filter((name) => /^chromium-\d+$/.test(name)).sort().reverse()) {
      candidates.push(path.join(root, entry, 'chrome-linux64', 'chrome'), path.join(root, entry, 'chrome-linux', 'chrome'));
    }
  }
  const found = candidates.find((file) => file && fs.existsSync(file) && fs.statSync(file).isFile());
  if (!found) throw new Error(`No Chromium found under ${root}; set CHROMIUM_PATH.`);
  return found;
}

export async function launchChromium() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydrogen-agent-test-'));
  const profile = path.join(dir, 'profile');
  const child = spawn(
    findChromium(),
    [
      '--headless',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-client-side-phishing-detection',
      '--disable-features=OptimizationHints,MediaRouter,Translate,GCMChannelStatusRequest',
      '--no-pings',
      '--password-store=basic',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore', detached: true, env: { ...process.env, HOME: dir } },
  );
  const portFile = path.join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 20_000;
  while (!fs.existsSync(portFile) || fs.readFileSync(portFile, 'utf8').split('\n').length < 2) {
    if (Date.now() > deadline || child.exitCode !== null) {
      await killGroup(child.pid);
      throw new Error('Chromium did not write DevToolsActivePort');
    }
    await delay(100);
  }
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  return {
    dir,
    profile,
    port: Number(port),
    wsPath,
    async close() {
      await killGroup(child.pid);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killGroup(pid) {
  for (const [signal, waitMs] of [['SIGTERM', 5000], ['SIGKILL', 5000]]) {
    if (!groupAlive(pid)) return;
    try {
      process.kill(-pid, signal);
    } catch {}
    const deadline = Date.now() + waitMs;
    while (groupAlive(pid) && Date.now() < deadline) await delay(50);
  }
}

export async function countingProxy(targetPort, { delayMs = 0, refuse = false } = {}) {
  const sockets = new Set();
  let connections = 0;
  const server = net.createServer((client) => {
    connections++;
    sockets.add(client);
    client.on('error', () => {});
    client.pause();
    setTimeout(() => {
      if (refuse) {
        client.destroy();
        return;
      }
      const upstream = net.connect(targetPort, '127.0.0.1');
      for (const socket of [client, upstream]) {
        sockets.add(socket);
        socket.on('error', () => {});
        socket.on('close', () => {
          sockets.delete(socket);
          client.destroy();
          upstream.destroy();
        });
      }
      client.pipe(upstream).pipe(client);
    }, delayMs);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    get connections() {
      return connections;
    },
    close() {
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}

export function profileFor(dir, port, wsPath) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'DevToolsActivePort'), `${port}\n${wsPath}`);
  return dir;
}

export function hydrogen(args, env, { input } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input ?? '');
  });
}

export async function hydrogenJson(args, env) {
  const result = await hydrogen([...args, '--json'], env);
  if (result.code !== 0) throw new Error(`hydrogen ${args.join(' ')} failed (${result.code}): ${result.stderr}`);
  return JSON.parse(result.stdout);
}

export async function stopDaemon(env) {
  const status = await hydrogen(['daemon', 'status', '--json'], env);
  const pid = status.code === 0 ? JSON.parse(status.stdout).pid : null;
  await hydrogen(['daemon', 'stop'], env);
  if (pid) await waitForExit(pid);
}

export async function waitForExit(pid, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await delay(50);
  }
  return false;
}

export function refOf(snapshot, pattern) {
  const line = snapshot.split('\n').find((text) => pattern.test(text));
  const match = line && /\[ref=(e\d+)\]/.exec(line);
  if (!match) throw new Error(`No ref for ${pattern} in snapshot:\n${snapshot}`);
  return match[1];
}

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
