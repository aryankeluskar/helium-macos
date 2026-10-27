import fs from 'node:fs';
import net from 'node:net';
import { Browser } from './browser.js';
import { APPROVAL_NOTICE } from './cdp.js';
import { runCommand } from './commands.js';
import { HeliumError, ensureAgentHome, socketPath, statePath } from './util.js';

const DEFAULT_IDLE_MS = 30 * 60 * 1000;

export async function runDaemon(env = process.env) {
  process.umask(0o077);
  ensureAgentHome(env);
  const sock = socketPath(env);
  const idleLimitMs = Number(env.HELIUM_AGENT_IDLE_MS) || DEFAULT_IDLE_MS;
  const startedAt = Date.now();
  let lastActive = Date.now();
  let active = 0;
  let browser = null;
  let failure = null;
  let browserConnections = 0;
  let stopping = false;

  const server = net.createServer((socket) => serve(socket));
  if (!(await listen(server, sock))) {
    log('another daemon is already serving', sock);
    process.exit(0);
  }
  fs.chmodSync(sock, 0o600);
  const { ino } = fs.statSync(sock);
  log(`daemon ${process.pid} listening on ${sock}`);

  const ready = Browser.connect({ env, statePath: statePath(env) }).then(
    (connected) => {
      browser = connected;
      browserConnections++;
      log(`connected to ${connected.endpoint.url}`);
      connected.cdp.on('close', () => shutdown('Helium closed the connection'));
      return connected;
    },
    (error) => {
      failure = error;
      log(`could not connect: ${error.message}`);
      setTimeout(() => shutdown('connection failed'), 2000);
      throw error;
    },
  );
  ready.catch(() => {});

  const idleTimer = setInterval(() => {
    if (!active && Date.now() - lastActive >= idleLimitMs) shutdown(`idle for ${Math.round(idleLimitMs / 60000)} min`);
  }, Math.min(60_000, Math.max(1000, idleLimitMs / 4)));

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  function status() {
    return {
      pid: process.pid,
      connected: !!browser,
      endpoint: browser?.endpoint.url ?? 'Helium',
      uptimeMs: Date.now() - startedAt,
      idleMs: active ? 0 : Date.now() - lastActive,
      idleLimitMs,
      browserConnections,
    };
  }

  function shutdown(reason) {
    if (stopping) return;
    stopping = true;
    log(`stopping: ${reason}`);
    clearInterval(idleTimer);
    server.close();
    try {
      if (fs.statSync(sock).ino === ino) fs.unlinkSync(sock);
    } catch {}
    browser?.close();
    setTimeout(() => process.exit(0), 100);
  }

  function serve(socket) {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) handle(socket, line);
      }
    });
  }

  async function handle(socket, line) {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      return;
    }
    const reply = (message) => {
      if (!socket.destroyed) socket.write(`${JSON.stringify({ id: request.id, ...message })}\n`);
    };
    active++;
    lastActive = Date.now();
    try {
      if (request.command === 'daemon.status') return reply({ ok: true, result: status() });
      if (request.command === 'daemon.stop') {
        reply({ ok: true, result: { stopped: true, pid: process.pid } });
        return shutdown('stop requested');
      }
      const notice = setTimeout(() => {
        if (!browser && !failure) reply({ notice: APPROVAL_NOTICE });
      }, 700);
      const connected = await ready.finally(() => clearTimeout(notice));
      if (request.command === 'daemon.start') return reply({ ok: true, result: status() });
      const result = await runCommand(connected, request.command, request.args ?? {}, { cwd: request.cwd });
      reply({ ok: true, result });
    } catch (error) {
      if (!(error instanceof HeliumError)) log(error.stack || String(error));
      reply({ ok: false, error: error.message });
    } finally {
      active--;
      lastActive = Date.now();
    }
  }
}

function listen(server, sock) {
  const attempt = () =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(sock, () => {
        server.off('error', reject);
        resolve(true);
      });
    });
  return attempt().catch(async (error) => {
    if (error.code !== 'EADDRINUSE') throw error;
    if (await isAlive(sock)) return false;
    fs.rmSync(sock, { force: true });
    return attempt();
  });
}

export function isAlive(sock) {
  return new Promise((resolve) => {
    const socket = net.connect(sock);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function log(...parts) {
  process.stderr.write(`${new Date().toISOString()} ${parts.join(' ')}\n`);
}
