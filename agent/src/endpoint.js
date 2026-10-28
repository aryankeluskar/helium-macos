import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HydrogenError, setting } from './util.js';

const ENABLE_STEPS =
  '  1. Start Hydrogen.\n' +
  '  2. Open chrome://inspect/#remote-debugging and turn on remote debugging.\n' +
  '  3. Run the command again and click "Allow" in the "Allow remote debugging?" dialog.';

function profileDir(name) {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', name);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), name);
}

export function defaultUserDataDir() {
  const current = profileDir('com.aryankeluskar.hydrogen');
  const legacy = profileDir('net.imput.helium');
  const live = (dir) => fs.existsSync(path.join(dir, 'DevToolsActivePort'));
  return !live(current) && live(legacy) ? legacy : current;
}

export async function findEndpoint(env = process.env) {
  const cdpUrl = setting(env, 'CDP_URL');
  if (cdpUrl) return fromUrl(cdpUrl);
  const dir = setting(env, 'USER_DATA_DIR') || defaultUserDataDir();
  const file = path.join(dir, 'DevToolsActivePort');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    if (!fs.existsSync(dir)) {
      throw new HydrogenError(`Can't find Hydrogen's profile at ${dir}.\nInstall and start Hydrogen, or set HYDROGEN_USER_DATA_DIR.`);
    }
    throw new HydrogenError(`Remote debugging is off in Hydrogen (no ${file}).\n${ENABLE_STEPS}`);
  }
  const [port, wsPath] = text.split(/\r?\n/).map((line) => line.trim());
  if (!/^\d+$/.test(port) || !wsPath?.startsWith('/')) {
    throw new HydrogenError(`${file} is malformed. Turn remote debugging off and on again at chrome://inspect/#remote-debugging.`);
  }
  return { url: `ws://127.0.0.1:${port}${wsPath}`, source: file };
}

async function fromUrl(value) {
  if (/^wss?:\/\//.test(value)) return { url: value, source: 'HYDROGEN_CDP_URL' };
  if (!/^https?:\/\//.test(value)) throw new HydrogenError(`HYDROGEN_CDP_URL must be ws://… or http://host:port, got "${value}".`);
  const versionUrl = new URL('/json/version', value).href;
  let info;
  try {
    info = await (await fetch(versionUrl)).json();
  } catch (error) {
    throw new HydrogenError(`Could not read ${versionUrl} (from HYDROGEN_CDP_URL): ${error.cause?.code || error.message}.\n${ENABLE_STEPS}`);
  }
  if (!info.webSocketDebuggerUrl) throw new HydrogenError(`${versionUrl} has no webSocketDebuggerUrl.`);
  return { url: info.webSocketDebuggerUrl, source: 'HYDROGEN_CDP_URL' };
}
