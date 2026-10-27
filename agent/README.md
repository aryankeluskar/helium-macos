# helium-agent

Let Claude Code and other coding agents drive your real, signed-in Helium from outside the browser: a CLI (`helium`), an MCP server (`helium mcp`) and a JS REPL (`helium repl`), all speaking the Chrome DevTools Protocol to Helium. There is no AI inside the browser; the agent stays in your terminal.

## Setup

1. In Helium, open `chrome://inspect/#remote-debugging` and turn remote debugging on.
2. Install the CLI (Node 20 or newer):
   ```sh
   npm i -g ./agent        # from this checkout; or run it without installing: npx ./agent tabs
   ```
3. Add the MCP server to Claude Code:
   ```sh
   claude mcp add helium -- helium mcp
   ```

The first command in a session makes Helium ask "Allow remote debugging?". Click Allow; the CLI prints a reminder while it waits.

## Commands

```
helium tabs                                  list tabs (> current, * opened by helium)
helium open <url> [--tab <tab>] [--new-window]
helium close [<tab>]
helium focus <tab>
helium snapshot [--tab <tab>]                accessibility outline with refs: button "Send" [ref=e12]
helium click <ref>
helium type <ref> <text> [--submit]
helium press <key>                           Enter, Tab, Escape, ArrowDown, Shift+Tab, Meta+a
helium select <ref> <value>
helium scroll [up|down|<ref>]
helium read                                  readable text as markdown, with link URLs
helium screenshot [-o file.png] [--full]
helium eval <js>
helium wait --text <t> | --selector <css> | --idle  [--timeout <ms>]
helium back | forward
helium downloads
helium repl "<js>"
helium daemon [start|status|stop]
```

Every command takes `--json`. Page commands act on the current tab (the one last opened, focused or named with `--tab`); `<tab>` is an index or an id prefix from `helium tabs`. Refs come from the latest snapshot of that tab and reset when it navigates.

`helium repl` runs async JavaScript in the daemon and prints what it returns (pipe a longer script on stdin). It has `tabs()`, `openTab(url)`, `page(tab?)`, `cdp(method, params, tab?)`, `downloads()` and `sleep(ms)`; a page has `goto`, `snapshot`, `click`, `type`, `press`, `select`, `scroll`, `text`, `screenshot(path)`, `eval(js or fn, ...args)`, `waitFor(text | {selector} | {idle: true})`, `back`, `forward`, `focus` and `close`.

```sh
helium repl "const p = await openTab('news.ycombinator.com'); return (await p.text()).slice(0, 500)"
```

The MCP server offers the same as tools: `tabs_list`, `tab_open`, `tab_close`, `tab_focus`, `page_snapshot`, `page_click`, `page_type`, `page_press`, `page_select`, `page_scroll`, `page_read`, `page_screenshot` (returns the image), `page_eval`, `page_wait`, `page_back`, `page_forward` and `downloads_list`.

Endpoint discovery, first match wins: `HELIUM_CDP_URL` (a `ws://` browser endpoint, or `http://host:port`), then `$HELIUM_USER_DATA_DIR/DevToolsActivePort`, then `~/Library/Application Support/net.imput.helium/DevToolsActivePort`. `HELIUM_AGENT_HOME` moves `~/.helium-agent`, and `HELIUM_AGENT_IDLE_MS` changes the daemon's idle timeout.

## Security model

- **One approval per session.** Every new DevTools connection needs your click on "Allow remote debugging?". The CLI's daemon holds a single connection for all CLI and REPL calls and exits after 30 minutes idle or when Helium closes it; `helium mcp` holds one connection, opened on its first tool call, for the life of the MCP session.
- **Private socket.** CLI and REPL reach the daemon through `~/.helium-agent/daemon.sock`, mode 0600 in a 0700 directory. Whoever can use it controls your signed-in browser, so it is yours alone.
- **No new ports.** Nothing listens on TCP except Helium's own approval-mode DevTools server on 127.0.0.1. `--remote-debugging-port` stays closed on the default profile.
- **Agent tabs stay apart.** `open` without `--tab` uses the agent's own window, which opens without taking focus on first use. Your tabs are only touched when a command names them. JavaScript dialogs are answered only in agent tabs or during a command.
- While connected, the agent can do anything you can do in Helium. Turn remote debugging off at `chrome://inspect/#remote-debugging` when you are done.

## Alternative

Google's `chrome-devtools-mcp` can attach to the same approval-mode server:

```sh
npx chrome-devtools-mcp@latest --autoConnect --userDataDir "$HOME/Library/Application Support/net.imput.helium"
```

## Tests

`npm test` runs the CLI, daemon and MCP against headless Chromium (set `CHROMIUM_PATH` if it is not under `/opt/pw-browsers`).
