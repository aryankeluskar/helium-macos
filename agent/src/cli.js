import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { request } from './client.js';
import { format } from './format.js';
import { HeliumError, normalizeUrl } from './util.js';

const USAGE = `helium: drive your Helium browser from the terminal

Usage: helium <command> [arguments] [--tab <tab>] [--json]

Tabs
  tabs                                  List tabs (> current, * opened by helium)
  open <url> [--tab <tab>] [--new-window]
                                        Open a URL in a new tab of the agent window,
                                        or navigate <tab>
  close [<tab>]                         Close a tab (default: the current tab)
  focus <tab>                           Bring a tab to the front and make it current

Pages (act on the current tab, or on --tab <tab>: an index or id prefix from \`helium tabs\`)
  snapshot                              Accessibility outline with refs (e1, e2, ...)
  click <ref>                           Click an element from the last snapshot
  type <ref> <text> [--submit]          Replace a field's text; --submit presses Enter
  press <key>                           Enter, Tab, Escape, ArrowDown, Shift+Tab, Meta+a, ...
  select <ref> <value>                  Pick a <select> option by value or label
  scroll [up|down|<ref>]                Scroll by a screen, or bring an element into view
  read                                  The page's readable text as markdown
  screenshot [-o file.png] [--full]     Save a PNG (default: a temp file)
  eval <js>                             Evaluate JavaScript in the page (or pipe it on stdin)
  wait --text <t> | --selector <css> | --idle  [--timeout <ms>]
  back, forward                         Move through the tab's history
  downloads                             Downloads seen this session and the newest files

Scripting
  repl "<js>"                           Run async JS with tabs(), openTab(url), page(tab), cdp(...)
                                        (or pipe the script on stdin)
  mcp                                   Serve the same tools over MCP on stdio
  daemon [start|status|stop]            The background process holding the connection

Environment
  HELIUM_CDP_URL          ws:// browser endpoint, or http://host:port to resolve
  HELIUM_USER_DATA_DIR    Profile dir holding DevToolsActivePort
  HELIUM_AGENT_HOME       Daemon socket and state dir (default ~/.helium-agent)
`;

const OPTIONS = {
  tab: { type: 'string' },
  json: { type: 'boolean' },
  'new-window': { type: 'boolean' },
  submit: { type: 'boolean' },
  output: { type: 'string', short: 'o' },
  full: { type: 'boolean' },
  text: { type: 'string' },
  selector: { type: 'string' },
  idle: { type: 'boolean' },
  timeout: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    return usageError(error.message);
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (!command || values.help || command === 'help') {
    process.stdout.write(USAGE);
    return;
  }
  try {
    if (command === 'mcp') {
      const { runMcp } = await import('./mcp.js');
      return await runMcp();
    }
    if (command === 'daemon') return await daemon(rest[0], values);
    const args = await buildArgs(command, rest, values);
    const result = await request(command, args, { onNotice: (notice) => process.stderr.write(`${notice}\n`) });
    print(command, result, values.json);
  } catch (error) {
    if (error instanceof UsageError) return usageError(error.message);
    process.stderr.write(`helium: ${error instanceof HeliumError ? error.message : error.stack}\n`);
    process.exitCode = 1;
  }
}

async function daemon(action, values) {
  if (!action) {
    const { runDaemon } = await import('./daemon.js');
    return runDaemon();
  }
  if (!['start', 'status', 'stop'].includes(action)) throw new UsageError(`Unknown daemon action "${action}". Use start, status or stop.`);
  const command = `daemon.${action}`;
  const notice = (text) => process.stderr.write(`${text}\n`);
  const result = await request(command, {}, { autostart: action === 'start', onNotice: notice });
  if (result === null) {
    if (values.json) process.stdout.write(`${JSON.stringify({ running: false })}\n`);
    else process.stdout.write('No daemon is running.\n');
    if (action === 'status') process.exitCode = 3;
    return;
  }
  print(command === 'daemon.start' ? 'daemon.status' : command, result, values.json);
}

function print(command, result, json) {
  if (json) process.stdout.write(`${JSON.stringify(result ?? null, null, 2)}\n`);
  else process.stdout.write(`${format(command, result)}\n`);
}

class UsageError extends Error {}

function usageError(message) {
  process.stderr.write(`helium: ${message}\nRun \`helium --help\` for usage.\n`);
  process.exitCode = 2;
}

function need(value, what) {
  if (value === undefined || value === '') throw new UsageError(`Missing ${what}.`);
  return value;
}

async function stdinText() {
  if (process.stdin.isTTY) return '';
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function buildArgs(command, rest, values) {
  const tab = values.tab;
  switch (command) {
    case 'tabs':
    case 'downloads':
      return {};
    case 'snapshot':
    case 'read':
    case 'back':
    case 'forward':
      return { tab };
    case 'open':
      return { url: normalizeUrl(need(rest[0], 'URL: helium open <url>')), tab, newWindow: values['new-window'] };
    case 'close':
      return { tab: rest[0] ?? tab };
    case 'focus':
      return { tab: need(rest[0] ?? tab, 'tab: helium focus <tab>') };
    case 'click':
      return { ref: need(rest[0], 'ref: helium click <ref>'), tab };
    case 'type':
      if (rest.length < 2) throw new UsageError('Usage: helium type <ref> <text> [--submit]');
      return { ref: rest[0], text: rest.slice(1).join(' '), submit: values.submit, tab };
    case 'press':
      return { key: need(rest[0], 'key: helium press <key>'), tab };
    case 'select':
      if (rest.length < 2) throw new UsageError('Usage: helium select <ref> <value>');
      return { ref: rest[0], value: rest.slice(1).join(' '), tab };
    case 'scroll':
      return { target: rest[0] ?? 'down', tab };
    case 'screenshot': {
      const file = values.output ?? path.join(os.tmpdir(), `helium-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
      return { path: path.resolve(file), full: values.full, tab };
    }
    case 'eval':
      return { js: need(rest.length ? rest.join(' ') : await stdinText(), 'JavaScript: helium eval <js>'), tab };
    case 'wait': {
      if (values.text === undefined && values.selector === undefined && !values.idle) throw new UsageError('Usage: helium wait --text <t> | --selector <css> | --idle');
      const timeoutMs = values.timeout === undefined ? undefined : Number(values.timeout);
      if (timeoutMs !== undefined && !(timeoutMs > 0)) throw new UsageError('--timeout takes milliseconds, e.g. --timeout 10000');
      return { text: values.text, selector: values.selector, idle: values.idle, timeoutMs, tab };
    }
    case 'repl':
      return { code: need(rest.length ? rest.join(' ') : await stdinText(), 'JavaScript: helium repl "<js>"') };
    default:
      throw new UsageError(`Unknown command "${command}".`);
  }
}
