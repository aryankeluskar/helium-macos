import { shortId } from './util.js';

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function tabLine(tab) {
  const title = truncate(tab.title || '(untitled)', 80);
  return `${shortId(tab.id)}  ${title}  ${truncate(tab.url, 160)}`;
}

function withExtras(text, result) {
  const lines = [text];
  if (result.navigated) lines.push(`Now at: ${result.tab.title ? `${result.tab.title} — ` : ''}${result.tab.url}`);
  for (const tab of result.opened ?? []) lines.push(`New tab opened: ${tabLine(tab)}`);
  for (const note of result.notes ?? []) lines.push(note);
  if (result.loaded === false) lines.push('(the page was still loading)');
  return lines.join('\n');
}

function label(result) {
  const name = result.name ? ` "${result.name}"` : '';
  return `${result.ref} (${result.role}${name})`;
}

function bytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function formatValue(value) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export const formatters = {
  tabs(tabs) {
    if (!tabs.length) return 'No tabs.';
    const titles = tabs.map((tab) => truncate(tab.title || '(untitled)', 50));
    const width = Math.max(...titles.map((title) => title.length));
    const rows = tabs.map((tab, i) => {
      const marks = `${tab.current ? '>' : ' '}${tab.agent ? '*' : ' '}`;
      return `${marks} ${String(tab.index).padStart(2)}  ${shortId(tab.id)}  ${titles[i].padEnd(width)}  ${truncate(tab.url, 120)}`;
    });
    return `${rows.join('\n')}\n\n> current tab   * agent tab (opened by helium)`;
  },
  open: (r) => `Opened ${tabLine(r.tab)}${r.loaded === false ? '\n(the page was still loading)' : ''}`,
  close: (r) => `Closed ${tabLine(r.tab)}`,
  focus: (r) => `Focused ${tabLine(r.tab)}`,
  snapshot: (r) => `Tab ${tabLine(r.tab)}\n${r.snapshot || '(empty page)'}`,
  click: (r) => withExtras(`Clicked ${label(r)}${r.method === 'script' ? ' with a script click (it was covered or had no box)' : ''}`, r),
  type: (r) => withExtras(`Typed into ${label(r)}${r.submitted ? ' and pressed Enter' : ''}`, r),
  press: (r) => withExtras(`Pressed ${r.key}`, r),
  select: (r) => `Selected "${r.label}" (value ${JSON.stringify(r.value)}) in ${r.ref}`,
  scroll: (r) => {
    const where = r.atBottom ? 'at the bottom' : r.atTop ? 'at the top' : `${r.top}px of ${r.height}px`;
    return `Scrolled ${r.direction ?? `to ${r.ref}`}: ${where}`;
  },
  read: (r) => `# ${r.title || '(untitled)'}\n${r.url}\n\n${r.text}`,
  screenshot: (r) => `Saved ${r.path} (${bytes(r.bytes)})`,
  eval: (r) => formatValue(r.value),
  wait: (r) => (r.found === 'idle' ? 'The page is idle.' : r.found === 'text' ? `Found text "${r.text}".` : `Found ${r.selector}.`),
  back: (r) => `Back to ${tabLine(r.tab)}`,
  forward: (r) => `Forward to ${tabLine(r.tab)}`,
  downloads(r) {
    const lines = [];
    if (r.session.length) {
      lines.push('Downloads this session:');
      for (const d of r.session) lines.push(`  ${d.state.padEnd(10)} ${d.path ?? d.filename}  ${bytes(d.receivedBytes)}${d.totalBytes ? ` of ${bytes(d.totalBytes)}` : ''}  ${d.url}`);
    } else {
      lines.push(r.tracking ? 'No downloads this session.' : 'Download events are unavailable on this connection.');
    }
    if (r.recent.length) {
      lines.push('', `Newest files in ${r.dir}:`);
      for (const f of r.recent) lines.push(`  ${f.modified.slice(0, 19).replace('T', ' ')}  ${bytes(f.bytes).padStart(9)}  ${f.path}`);
    }
    return lines.join('\n');
  },
  repl: (r) => [...r.logs, formatValue(r.value)].filter((line) => line !== 'undefined' || !r.logs.length).join('\n'),
  'daemon.status': (r) =>
    `Daemon ${r.pid}: ${r.connected ? 'connected' : 'connecting'} to ${r.endpoint}\n` +
    `Up ${Math.round(r.uptimeMs / 1000)}s, idle ${Math.round(r.idleMs / 1000)}s (exits after ${Math.round(r.idleLimitMs / 60000)} min idle), ${r.browserConnections} browser connection(s).`,
  'daemon.stop': (r) => (r.stopped ? `Stopped daemon ${r.pid}.` : 'No daemon is running.'),
};

export function format(command, result) {
  const formatter = formatters[command];
  return formatter ? formatter(result) : formatValue(result);
}
