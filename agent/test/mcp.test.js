import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BIN, launchChromium } from './helpers.js';
import { startSite } from './site.js';

const EXPECTED_TOOLS = [
  'tabs_list', 'tab_open', 'tab_close', 'tab_focus', 'page_snapshot', 'page_click', 'page_type', 'page_press',
  'page_select', 'page_scroll', 'page_read', 'page_screenshot', 'page_eval', 'page_wait', 'page_back', 'page_forward',
];

describe('helium mcp over stdio', () => {
  let chrome;
  let site;
  let client;

  before(async () => {
    chrome = await launchChromium();
    site = await startSite();
    const env = { ...process.env, HELIUM_USER_DATA_DIR: chrome.profile, HELIUM_AGENT_HOME: path.join(chrome.dir, 'agent-home') };
    delete env.HELIUM_CDP_URL;
    client = new Client({ name: 'helium-test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN, 'mcp'], env, stderr: 'ignore' }));
  });

  after(async () => {
    await client?.close();
    site?.close();
    await chrome?.close();
  });

  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, `${name} failed: ${result.content?.[0]?.text}`);
    return result.content;
  };

  test('lists every tool with a description and schema', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    for (const name of EXPECTED_TOOLS) assert.ok(names.includes(name), `missing ${name}`);
    for (const tool of tools) {
      assert.ok(tool.description.length > 40, `${tool.name} needs a real description`);
      assert.equal(tool.inputSchema.type, 'object');
    }
    assert.match(client.getInstructions(), /agent window/);
  });

  test('opens a page, snapshots it and acts on a ref', async () => {
    const [opened] = await call('tab_open', { url: `${site.url}/` });
    assert.match(opened.text, /^Opened [0-9A-F]{8} {2}Helium test page/);

    const [snapshot] = await call('page_snapshot');
    const ref = /button "Click me" \[ref=(e\d+)\]/.exec(snapshot.text)[1];
    const [clicked] = await call('page_click', { ref });
    assert.match(clicked.text, /Clicked e\d+ \(button "Click me"\)/);

    const [value] = await call('page_eval', { js: "document.getElementById('counter').textContent" });
    assert.equal(value.text, 'Clicked 1');
  });

  test('page_screenshot returns image content', async () => {
    const [image, caption] = await call('page_screenshot');
    assert.equal(image.type, 'image');
    assert.equal(image.mimeType, 'image/png');
    assert.equal(Buffer.from(image.data, 'base64').subarray(1, 4).toString(), 'PNG');
    assert.match(caption.text, /Screenshot of http/);
  });

  test('errors come back as tool errors', async () => {
    const result = await client.callTool({ name: 'page_click', arguments: { ref: 'e999' } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Unknown ref "e999"/);
  });
});
