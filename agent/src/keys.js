import { HeliumError } from './util.js';

const MODIFIERS = {
  alt: { bit: 1, key: 'Alt', code: 'AltLeft', keyCode: 18 },
  option: { bit: 1, key: 'Alt', code: 'AltLeft', keyCode: 18 },
  control: { bit: 2, key: 'Control', code: 'ControlLeft', keyCode: 17 },
  ctrl: { bit: 2, key: 'Control', code: 'ControlLeft', keyCode: 17 },
  meta: { bit: 4, key: 'Meta', code: 'MetaLeft', keyCode: 91 },
  cmd: { bit: 4, key: 'Meta', code: 'MetaLeft', keyCode: 91 },
  command: { bit: 4, key: 'Meta', code: 'MetaLeft', keyCode: 91 },
  shift: { bit: 8, key: 'Shift', code: 'ShiftLeft', keyCode: 16 },
};

const NAMED = {
  Enter: { keyCode: 13, text: '\r' },
  Tab: { keyCode: 9 },
  Escape: { keyCode: 27 },
  Backspace: { keyCode: 8 },
  Delete: { keyCode: 46 },
  Insert: { keyCode: 45 },
  ArrowUp: { keyCode: 38 },
  ArrowDown: { keyCode: 40 },
  ArrowLeft: { keyCode: 37 },
  ArrowRight: { keyCode: 39 },
  Home: { keyCode: 36 },
  End: { keyCode: 35 },
  PageUp: { keyCode: 33 },
  PageDown: { keyCode: 34 },
  ' ': { code: 'Space', keyCode: 32, text: ' ' },
};
for (let n = 1; n <= 12; n++) NAMED[`F${n}`] = { keyCode: 111 + n };

const ALIASES = {
  return: 'Enter', esc: 'Escape', space: ' ', spacebar: ' ', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft',
  right: 'ArrowRight', del: 'Delete', pageup: 'PageUp', pagedown: 'PageDown', pgup: 'PageUp', pgdn: 'PageDown',
};

const MAC_COMMANDS = { a: 'selectAll', c: 'copy', v: 'paste', x: 'cut', z: 'undo' };

export function keyEvents(combo, platform = process.platform) {
  const parts = combo === '+' ? ['+'] : combo.split(/\+(?!$)/);
  const keyName = parts.pop();
  const modifiers = parts.map((part) => {
    const modifier = MODIFIERS[part.toLowerCase()];
    if (!modifier) throw new HeliumError(`Unknown modifier "${part}" in "${combo}". Use Shift, Control, Alt or Meta.`);
    return modifier;
  });
  const mask = modifiers.reduce((sum, modifier) => sum | modifier.bit, 0);
  const key = describe(keyName);
  const printable = key.text && !(mask & 0b0110);
  const commands = [];
  if (platform === 'darwin' && mask === 4 && MAC_COMMANDS[key.key.toLowerCase()]) commands.push(MAC_COMMANDS[key.key.toLowerCase()]);
  if (platform === 'darwin' && mask === 12 && key.key.toLowerCase() === 'z') commands.push('redo');

  const events = [];
  let held = 0;
  for (const modifier of modifiers) {
    held |= modifier.bit;
    events.push({ type: 'rawKeyDown', modifiers: held, key: modifier.key, code: modifier.code, windowsVirtualKeyCode: modifier.keyCode });
  }
  const text = printable ? (mask & 8 && key.key.length === 1 ? key.key.toUpperCase() : key.text) : undefined;
  const base = { modifiers: mask, key: text && key.key.length === 1 ? text : key.key, code: key.code, windowsVirtualKeyCode: key.keyCode };
  events.push({ ...base, type: text ? 'keyDown' : 'rawKeyDown', text, unmodifiedText: text, commands: commands.length ? commands : undefined });
  events.push({ ...base, type: 'keyUp' });
  for (const modifier of [...modifiers].reverse()) {
    held &= ~modifier.bit;
    events.push({ type: 'keyUp', modifiers: held, key: modifier.key, code: modifier.code, windowsVirtualKeyCode: modifier.keyCode });
  }
  return events;
}

function describe(name) {
  const canonical = ALIASES[name.toLowerCase()] ?? Object.keys(NAMED).find((key) => key.toLowerCase() === name.toLowerCase());
  if (canonical) {
    const named = NAMED[canonical];
    return { key: canonical, code: named.code ?? canonical, keyCode: named.keyCode, text: named.text };
  }
  if ([...name].length === 1) {
    const upper = name.toUpperCase();
    let code = '';
    if (/[a-z]/i.test(name)) code = `Key${upper}`;
    else if (/[0-9]/.test(name)) code = `Digit${name}`;
    return { key: name, code, keyCode: /[a-z0-9]/i.test(name) ? upper.charCodeAt(0) : 0, text: name };
  }
  throw new HeliumError(`Unknown key "${name}". Use a character or a name like Enter, Tab, Escape, ArrowDown, PageDown, F5.`);
}
