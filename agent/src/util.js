import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class HeliumError extends Error {}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function agentHome(env = process.env) {
  return env.HELIUM_AGENT_HOME || path.join(os.homedir(), '.helium-agent');
}

export function ensureAgentHome(env = process.env) {
  const dir = agentHome(env);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  return dir;
}

export const socketPath = (env) => path.join(agentHome(env), 'daemon.sock');
export const statePath = (env) => path.join(agentHome(env), 'state.json');
export const logPath = (env) => path.join(agentHome(env), 'daemon.log');

export function shortId(id) {
  return id.slice(0, 8);
}

export function normalizeUrl(input, cwd = process.cwd()) {
  const value = String(input ?? '').trim();
  if (!value) throw new HeliumError('Give a URL to open, e.g. `helium open example.com`.');
  if (/^(localhost|127\.0\.0\.1|\[::1\]|[\w-]+(\.[\w-]+)*:\d+)(\/|$|:)/i.test(value)) return `http://${value}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (/^[.~/]/.test(value)) {
    const file = path.resolve(cwd, value.replace(/^~(?=\/|$)/, os.homedir()));
    if (fs.existsSync(file)) return new URL(`file://${file}`).href;
  }
  if (/^[^\s/]+\.[^\s/]+/.test(value)) return `https://${value}`;
  throw new HeliumError(`"${value}" doesn't look like a URL. Include the scheme, e.g. https://${value}.`);
}

export function writePrivateJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
