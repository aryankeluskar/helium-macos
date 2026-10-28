# hydrogen-agent

Let Claude Code and other coding agents drive your real, signed-in Hydrogen from outside the browser: a CLI (`hydrogen`), an MCP server (`hydrogen mcp`) and a JS REPL (`hydrogen repl`), all speaking the Chrome DevTools Protocol to Hydrogen. There is no AI inside the browser; the agent stays in your terminal.

## Setup

1. In Hydrogen, open `chrome://inspect/#remote-debugging` and turn remote debugging on.
2. Put the CLI on your PATH. The dream browser's Hydrogen.app ships it (it runs on your Node.js 20.10 or newer):
   ```sh
   ln -sf /Applications/Hydrogen.app/Contents/Resources/hydrogen-agent/hydrogen /opt/homebrew/bin/hydrogen
   ```
   With any other Hydrogen, install it from this checkout instead: `npm i -g ./agent`.
3. Add the MCP server to Claude Code:
   ```sh
   claude mcp add hydrogen -- hydrogen mcp
   ```

The first command in a session makes Hydrogen ask "Allow remote debugging?". Click Allow; the CLI prints a reminder while it waits.

## Commands

```
hydrogen tabs                                  list tabs (> current, * opened by hydrogen)
hydrogen open <url> [--tab <tab>] [--new-window]
hydrogen close [<tab>]
hydrogen focus <tab>
hydrogen snapshot [--tab <tab>]                accessibility outline with refs: button "Send" [ref=e12]
hydrogen click <ref>
hydrogen type <ref> <text> [--submit]
hydrogen press <key>                           Enter, Tab, Escape, ArrowDown, Shift+Tab, Meta+a
hydrogen select <ref> <value>
hydrogen scroll [up|down|<ref>]
hydrogen read                                  readable text as markdown, with link URLs
hydrogen screenshot [-o file.png] [--full]
hydrogen eval <js>
hydrogen wait --text <t> | --selector <css> | --idle  [--timeout <ms>]
hydrogen back | forward
hydrogen downloads
hydrogen repl "<js>"
hydrogen daemon [start|status|stop]
```

Every command takes `--json`. Page commands act on the current tab (the one last opened, focused or named with `--tab`); `<tab>` is an index or an id prefix from `hydrogen tabs`. Refs come from the latest snapshot of that tab and reset when it navigates.

`hydrogen repl` runs async JavaScript in the daemon and prints what it returns (pipe a longer script on stdin). It has `tabs()`, `openTab(url)`, `page(tab?)`, `cdp(method, params, tab?)`, `downloads()` and `sleep(ms)`; a page has `goto`, `snapshot`, `click`, `type`, `press`, `select`, `scroll`, `text`, `screenshot(path)`, `eval(js or fn, ...args)`, `waitFor(text | {selector} | {idle: true})`, `back`, `forward`, `focus` and `close`.

```sh
hydrogen repl "const p = await openTab('news.ycombinator.com'); return (await p.text()).slice(0, 500)"
```

The MCP server offers the same as tools: `tabs_list`, `tab_open`, `tab_close`, `tab_focus`, `page_snapshot`, `page_click`, `page_type`, `page_press`, `page_select`, `page_scroll`, `page_read`, `page_screenshot` (returns the image), `page_eval`, `page_wait`, `page_back`, `page_forward` and `downloads_list`.

Endpoint discovery, first match wins: `HYDROGEN_CDP_URL` (a `ws://` browser endpoint, or `http://host:port`), then `$HYDROGEN_USER_DATA_DIR/DevToolsActivePort`, then `~/Library/Application Support/com.aryankeluskar.hydrogen/DevToolsActivePort`. `HYDROGEN_AGENT_HOME` moves `~/.hydrogen-agent`, and `HYDROGEN_AGENT_IDLE_MS` changes the daemon's idle timeout.

## Security model

- **One approval per session.** Every new DevTools connection needs your click on "Allow remote debugging?". The CLI's daemon holds a single connection for all CLI and REPL calls and exits after 30 minutes idle or when Hydrogen closes it; `hydrogen mcp` holds one connection, opened on its first tool call, for the life of the MCP session.
- **Private socket.** CLI and REPL reach the daemon through `~/.hydrogen-agent/daemon.sock`, mode 0600 in a 0700 directory. Whoever can use it controls your signed-in browser, so it is yours alone.
- **No new ports.** Nothing listens on TCP except Hydrogen's own approval-mode DevTools server on 127.0.0.1. `--remote-debugging-port` stays closed on the default profile.
- **Agent tabs stay apart.** `open` without `--tab` uses the agent's own window, which opens without taking focus on first use. Your tabs are only touched when a command names them. JavaScript dialogs are answered only in agent tabs or during a command.
- While connected, the agent can do anything you can do in Hydrogen. Turn remote debugging off at `chrome://inspect/#remote-debugging` when you are done.

## Alternative

Google's `chrome-devtools-mcp` can attach to the same approval-mode server:

```sh
npx chrome-devtools-mcp@latest --autoConnect --userDataDir "$HOME/Library/Application Support/com.aryankeluskar.hydrogen"
```

## Tests

`npm test` runs the CLI, daemon and MCP against headless Chromium (set `CHROMIUM_PATH` if it is not under `/opt/pw-browsers`).
