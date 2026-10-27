import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HeliumError } from './util.js';

const ENABLE_STEPS =
  '  1. Start Helium.\n' +
  '  2. Open chrome://inspect/#remote-debugging and turn on remote debugging.\n' +
  '  3. Run the command again and click "Allow" in the "Allow remote debugging?" dialog.';

export function defaultUserDataDir() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'net.imput.helium');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'net.imput.helium');
}

export async function findEndpoint(env = process.env) {
  if (env.HELIUM_CDP_URL) return fromUrl(env.HELIUM_CDP_URL);
  const dir = env.HELIUM_USER_DATA_DIR || defaultUserDataDir();
  const file = path.join(dir, 'DevToolsActivePort');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    if (!fs.existsSync(dir)) {
      throw new HeliumError(`Can't find Helium's profile at ${dir}.\nInstall and start Helium, or set HELIUM_USER_DATA_DIR.`);
    }
    throw new HeliumError(`Remote debugging is off in Helium (no ${file}).\n${ENABLE_STEPS}`);
  }
  const [port, wsPath] = text.split(/\r?\n/).map((line) => line.trim());
  if (!/^\d+$/.test(port) || !wsPath?.startsWith('/')) {
    throw new HeliumError(`${file} is malformed. Turn remote debugging off and on again at chrome://inspect/#remote-debugging.`);
  }
  return { url: `ws://127.0.0.1:${port}${wsPath}`, source: file };
}

async function fromUrl(value) {
  if (/^wss?:\/\//.test(value)) return { url: value, source: 'HELIUM_CDP_URL' };
  if (!/^https?:\/\//.test(value)) throw new HeliumError(`HELIUM_CDP_URL must be ws://… or http://host:port, got "${value}".`);
  const versionUrl = new URL('/json/version', value).href;
  let info;
  try {
    info = await (await fetch(versionUrl)).json();
  } catch (error) {
    throw new HeliumError(`Could not read ${versionUrl} (from HELIUM_CDP_URL): ${error.cause?.code || error.message}.\n${ENABLE_STEPS}`);
  }
  if (!info.webSocketDebuggerUrl) throw new HeliumError(`${versionUrl} has no webSocketDebuggerUrl.`);
  return { url: info.webSocketDebuggerUrl, source: 'HELIUM_CDP_URL' };
}
