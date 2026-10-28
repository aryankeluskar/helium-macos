import fs from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Browser } from './browser.js';
import { APPROVAL_NOTICE } from './cdp.js';
import { format } from './format.js';
import { ensureAgentHome, normalizeUrl, statePath } from './util.js';
import packageJson from '../package.json' with { type: 'json' };

const VERSION = packageJson.version;

const INSTRUCTIONS = `These tools control the user's real Hydrogen browser, signed in to their accounts.
- Pages you open go to a separate agent window, so the user's own tabs stay untouched. tabs_list shows every tab; act on the user's tabs only when asked.
- Typical loop: tab_open, then page_snapshot to get element refs (e1, e2, ...), then page_click / page_type / page_select with those refs, then page_snapshot again to see the result.
- Refs belong to the latest snapshot of a tab and reset when the page navigates.
- Page tools act on the current tab (the one you last opened, focused or named) unless you pass "tab".`;

const tab = { type: 'string', description: 'Tab to act on: an index or id prefix from tabs_list. Omit to use the current tab.' };
const ref = { type: 'string', description: 'Element ref from the latest page_snapshot of this tab, e.g. "e12".' };

const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const readOnly = { readOnlyHint: true, openWorldHint: true };
const acts = { readOnlyHint: false, openWorldHint: true };

const TOOLS = [
  {
    name: 'tabs_list',
    description: 'List all open browser tabs with index, id, title and URL. Agent tabs (opened by these tools) are marked; the current tab is the default target for page_* tools.',
    inputSchema: schema(),
    annotations: readOnly,
    run: (b) => b.listTabs(),
    command: 'tabs',
  },
  {
    name: 'tab_open',
    description: 'Open a URL and wait for it to load. Without "tab" it opens a new tab in the agent window (creating the window on first use) and makes it current. With "tab" it navigates that existing tab instead. Bare domains get https://.',
    inputSchema: schema({ url: { type: 'string', description: 'URL to open, e.g. "https://example.com" or "example.com".' }, tab, newWindow: { type: 'boolean', description: 'Open in a new agent window instead of a new tab in the existing one.' } }, ['url']),
    annotations: acts,
    run: (b, a) => b.open(normalizeUrl(a.url), { tab: a.tab, newWindow: a.newWindow }),
    command: 'open',
  },
  {
    name: 'tab_close',
    description: 'Close a tab. Without "tab" it closes the current tab. Only close the user\'s own tabs when they ask you to.',
    inputSchema: schema({ tab }),
    annotations: { ...acts, destructiveHint: true },
    run: (b, a) => b.close(a.tab),
    command: 'close',
  },
  {
    name: 'tab_focus',
    description: 'Bring a tab and its window to the front and make it the current tab for page_* tools.',
    inputSchema: schema({ tab }, ['tab']),
    annotations: acts,
    run: (b, a) => b.focus(a.tab),
    command: 'focus',
  },
  {
    name: 'page_snapshot',
    description: 'Return a compact accessibility outline of the page: roles, names, values and states, one element per line, each with a ref like [ref=e12]. Use the refs with page_click, page_type, page_select and page_scroll. Prefer this over screenshots for understanding and acting on a page.',
    inputSchema: schema({ tab }),
    annotations: readOnly,
    run: (b, a) => b.snapshot({ tab: a.tab }),
    command: 'snapshot',
  },
  {
    name: 'page_click',
    description: 'Click an element by ref (scrolls it into view and clicks its center with the mouse; falls back to a script click if it is covered). Reports the URL afterwards and any tab the click opened.',
    inputSchema: schema({ ref, tab }, ['ref']),
    annotations: acts,
    run: (b, a) => b.click(a.ref, { tab: a.tab }),
    command: 'click',
  },
  {
    name: 'page_type',
    description: 'Replace the contents of a text field (input, textarea or contenteditable) with the given text. Set submit to press Enter afterwards, e.g. to submit a search or a form.',
    inputSchema: schema({ ref, text: { type: 'string', description: 'Text to type; an empty string clears the field.' }, submit: { type: 'boolean', description: 'Press Enter after typing.' }, tab }, ['ref', 'text']),
    annotations: acts,
    run: (b, a) => b.type(a.ref, a.text, { tab: a.tab, submit: a.submit }),
    command: 'type',
  },
  {
    name: 'page_press',
    description: 'Press a key or key combination in the focused element of the page, e.g. "Enter", "Escape", "Tab", "ArrowDown", "PageDown", "Shift+Tab", "Meta+a".',
    inputSchema: schema({ key: { type: 'string', description: 'Key name or combination joined with "+".' }, tab }, ['key']),
    annotations: acts,
    run: (b, a) => b.press(a.key, { tab: a.tab }),
    command: 'press',
  },
  {
    name: 'page_select',
    description: 'Choose an option in a <select> dropdown (a combobox in the snapshot) by its value or visible label. For custom dropdowns, click them and then click the option instead.',
    inputSchema: schema({ ref, value: { type: 'string', description: 'Option value or label.' }, tab }, ['ref', 'value']),
    annotations: acts,
    run: (b, a) => b.select(a.ref, a.value, { tab: a.tab }),
    command: 'select',
  },
  {
    name: 'page_scroll',
    description: 'Scroll the page (or the scrollable area in the middle of the viewport) up or down by about one screen, or scroll an element into view by ref. Reports the scroll position.',
    inputSchema: schema({ target: { type: 'string', description: '"up", "down" (default) or an element ref.' }, tab }),
    annotations: acts,
    run: (b, a) => b.scroll(a.target ?? 'down', { tab: a.tab }),
    command: 'scroll',
  },
  {
    name: 'page_read',
    description: 'Return the readable text of the page as markdown (headings, lists, tables, and links with their URLs). Best for reading articles, docs, search results and emails.',
    inputSchema: schema({ tab }),
    annotations: readOnly,
    run: (b, a) => b.read({ tab: a.tab }),
    command: 'read',
  },
  {
    name: 'page_screenshot',
    description: 'Take a PNG screenshot of the visible part of the page (or the full page) and return it as an image. Optionally also save it to a file path.',
    inputSchema: schema({ full: { type: 'boolean', description: 'Capture the whole scrollable page instead of the viewport.' }, path: { type: 'string', description: 'Absolute file path to also save the PNG to.' }, tab }),
    annotations: readOnly,
    run: (b, a) => b.screenshot({ tab: a.tab, full: a.full, path: a.path }),
    command: 'screenshot',
  },
  {
    name: 'page_eval',
    description: 'Evaluate a JavaScript expression in the page and return its JSON value. Top-level await works. Use it for things the other tools cannot do, e.g. reading a property or calling a page API.',
    inputSchema: schema({ js: { type: 'string', description: 'JavaScript expression or statements; the last expression is the result.' }, tab }, ['js']),
    annotations: acts,
    run: (b, a) => b.eval(a.js, { tab: a.tab }),
    command: 'eval',
  },
  {
    name: 'page_wait',
    description: 'Wait until text appears on the page, a CSS selector matches a visible element, or the page goes idle (loaded with no new network requests for 0.5 s). Give exactly one of text, selector or idle.',
    inputSchema: schema({ text: { type: 'string' }, selector: { type: 'string' }, idle: { type: 'boolean' }, timeoutMs: { type: 'number', description: 'Give up after this many milliseconds (default 30000).' }, tab }),
    annotations: readOnly,
    run: (b, a) => b.wait({ tab: a.tab, text: a.text, selector: a.selector, idle: a.idle, timeoutMs: a.timeoutMs }),
    command: 'wait',
  },
  {
    name: 'page_back',
    description: 'Go back one page in the tab\'s history and wait for it to load.',
    inputSchema: schema({ tab }),
    annotations: acts,
    run: (b, a) => b.back({ tab: a.tab }),
    command: 'back',
  },
  {
    name: 'page_forward',
    description: 'Go forward one page in the tab\'s history and wait for it to load.',
    inputSchema: schema({ tab }),
    annotations: acts,
    run: (b, a) => b.forward({ tab: a.tab }),
    command: 'forward',
  },
  {
    name: 'downloads_list',
    description: 'List downloads seen since this session connected, and the newest files in ~/Downloads.',
    inputSchema: schema(),
    annotations: readOnly,
    run: (b) => b.downloads(),
    command: 'downloads',
  },
];

export async function runMcp(env = process.env) {
  ensureAgentHome(env);
  let connecting = null;
  const browser = () => {
    if (!connecting) {
      const notice = setTimeout(() => process.stderr.write(`${APPROVAL_NOTICE}\n`), 700);
      connecting = Browser.connect({ env, statePath: statePath(env) }).then(
        (connected) => {
          clearTimeout(notice);
          connected.cdp.on('close', () => (connecting = null));
          return connected;
        },
        (error) => {
          clearTimeout(notice);
          connecting = null;
          throw error;
        },
      );
    }
    return connecting;
  };

  const server = new Server({ name: 'hydrogen', version: VERSION }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return failure(`Unknown tool "${params.name}".`);
    try {
      const result = await tool.run(await browser(), params.arguments ?? {});
      if (tool.name === 'page_screenshot') {
        const data = result.data ?? fs.readFileSync(result.path).toString('base64');
        const saved = result.path ? ` Saved to ${result.path}.` : '';
        return { content: [{ type: 'image', data, mimeType: 'image/png' }, { type: 'text', text: `Screenshot of ${result.tab.url}.${saved}` }] };
      }
      return { content: [{ type: 'text', text: format(tool.command, result) }] };
    } catch (error) {
      return failure(error.message);
    }
  });

  const transport = new StdioServerTransport();
  const stop = async () => {
    if (connecting) (await connecting.catch(() => null))?.disconnect();
    process.exit(0);
  };
  server.onclose = stop;
  process.stdin.on('end', stop);
  await server.connect(transport);
}

function failure(text) {
  return { isError: true, content: [{ type: 'text', text }] };
}
