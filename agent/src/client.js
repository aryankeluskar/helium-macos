import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { findEndpoint } from './endpoint.js';
import { HydrogenError, ensureAgentHome, logPath, setting, sleep, socketPath } from './util.js';

const BIN = setting(process.env, 'AGENT_ENTRY') || fileURLToPath(new URL('../bin/hydrogen.js', import.meta.url));

export async function request(command, args = {}, { env = process.env, onNotice = () => {}, autostart = true } = {}) {
  const sock = socketPath(env);
  let socket = await tryConnect(sock);
  if (!socket) {
    if (!autostart) return null;
    await findEndpoint(env);
    socket = await startDaemon(sock, env);
  }
  return exchange(socket, { id: 1, command, args, cwd: process.cwd() }, onNotice, env);
}

function tryConnect(sock) {
  return new Promise((resolve) => {
    const socket = net.connect(sock);
    socket.once('connect', () => resolve(socket));
    socket.once('error', () => resolve(null));
  });
}

async function startDaemon(sock, env) {
  ensureAgentHome(env);
  const log = fs.openSync(logPath(env), 'a', 0o600);
  const child = spawn(process.execPath, [BIN, 'daemon'], { detached: true, stdio: ['ignore', log, log], env });
  fs.closeSync(log);
  let exited = false;
  child.once('exit', () => (exited = true));
  child.unref();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const socket = await tryConnect(sock);
    if (socket) return socket;
    if (exited) break;
    await sleep(50);
  }
  throw new HydrogenError(`The hydrogen daemon didn't start. See ${logPath(env)}:\n${tail(logPath(env))}`);
}

function exchange(socket, message, onNotice, env) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let settled = false;
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const reply = JSON.parse(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (reply.notice) {
          onNotice(reply.notice);
          continue;
        }
        settled = true;
        socket.end();
        if (reply.ok) resolve(reply.result);
        else reject(new HydrogenError(reply.error));
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      if (!settled) reject(new HydrogenError(`The hydrogen daemon stopped before answering. See ${logPath(env)}.`));
    });
    socket.write(`${JSON.stringify(message)}\n`);
  });
}

function tail(file, lines = 5) {
  try {
    return fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch {
    return '(no log)';
  }
}
