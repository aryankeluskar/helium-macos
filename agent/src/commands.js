import { runRepl } from './repl.js';
import { HeliumError } from './util.js';

export async function runCommand(browser, command, args = {}, { cwd = process.cwd() } = {}) {
  const { tab } = args;
  switch (command) {
    case 'tabs':
      return browser.listTabs();
    case 'open':
      return browser.open(args.url, { tab, newWindow: args.newWindow });
    case 'close':
      return browser.close(tab);
    case 'focus':
      return browser.focus(tab);
    case 'snapshot':
      return browser.snapshot({ tab });
    case 'click':
      return browser.click(args.ref, { tab });
    case 'type':
      return browser.type(args.ref, args.text, { tab, submit: args.submit });
    case 'press':
      return browser.press(args.key, { tab });
    case 'select':
      return browser.select(args.ref, args.value, { tab });
    case 'scroll':
      return browser.scroll(args.target, { tab });
    case 'read':
      return browser.read({ tab });
    case 'screenshot':
      return browser.screenshot({ tab, path: args.path, full: args.full });
    case 'eval':
      return browser.eval(args.js, { tab });
    case 'wait':
      return browser.wait({ tab, text: args.text, selector: args.selector, idle: args.idle, timeoutMs: args.timeoutMs });
    case 'back':
      return browser.back({ tab });
    case 'forward':
      return browser.forward({ tab });
    case 'downloads':
      return browser.downloads();
    case 'repl':
      return runRepl(browser, args.code, { cwd });
    default:
      throw new HeliumError(`Unknown command "${command}".`);
  }
}
