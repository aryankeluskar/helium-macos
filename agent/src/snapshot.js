const DROPPED = new Set(['InlineTextBox', 'ListMarker', 'MenuListPopup']);
const TRANSPARENT = new Set([
  'generic', 'none', 'presentation', 'LabelText', 'Section', 'LayoutTable', 'LayoutTableRow', 'LayoutTableCell',
  'strong', 'emphasis', 'code', 'mark', 'time', 'subscript', 'superscript', 'deletion', 'insertion', 'Abbr', 'Ruby',
]);
const NAMED_ONLY = new Set(['group', 'image', 'img', 'region', 'Canvas', 'figure', 'SvgRoot', 'graphics-symbol']);
const OPAQUE = new Set([
  'textbox', 'searchbox', 'combobox', 'spinbutton', 'slider', 'checkbox', 'radio', 'switch', 'image', 'img',
  'progressbar', 'meter', 'scrollbar', 'SvgRoot', 'graphics-symbol', 'Video', 'Audio',
]);
const FLAGS = ['checked', 'pressed', 'selected', 'expanded', 'disabled', 'focused', 'modal'];
const MAX_NAME = 100;
const MAX_TEXT = 300;
const MAX_OPTIONS = 25;

export function buildSnapshot(nodes, pageUrl, frames = new Map()) {
  const refs = new Map();
  const lines = [];
  const origin = safeOrigin(pageUrl);

  const tree = (frameNodes, frameId) => ({ byId: new Map(frameNodes.map((node) => [node.nodeId, node])), frameId });
  const rootOf = (frameNodes) => frameNodes.find((node) => !node.parentId) ?? frameNodes[0];
  const childrenOf = (node, { byId }) => (node.childIds ?? []).map((id) => byId.get(id)).filter(Boolean);

  const assignRef = (backendNodeId, role, name, frameId) => {
    if (!backendNodeId) return '';
    const ref = `e${refs.size + 1}`;
    refs.set(ref, frameId ? { backendNodeId, role, name, frameId } : { backendNodeId, role, name });
    return ` [ref=${ref}]`;
  };

  function collect(node, from) {
    const role = node.role?.value ?? '';
    if (DROPPED.has(role)) return [];
    if (role === 'StaticText') {
      const text = clean(node.name?.value);
      return text ? [{ text }] : [];
    }
    if (role === 'LineBreak') return [{ text: ' ' }];
    const name = clean(node.name?.value);
    const frame = role === 'Iframe' && frames.get(node.backendDOMNodeId);
    let kids;
    if (frame) kids = collect(rootOf(frame.nodes), tree(frame.nodes, frame.frameId));
    else kids = OPAQUE.has(role) ? [] : childrenOf(node, from).flatMap((child) => collect(child, from));
    const interactive = !node.ignored && (property(node, 'focusable') === true || !!property(node, 'editable'));
    if (!interactive && (node.ignored || TRANSPARENT.has(role) || (NAMED_ONLY.has(role) && !name))) {
      if (role === 'LabelText' && kids.some((kid) => kid.node)) return kids.filter((kid) => kid.node);
      if (node.backendDOMNodeId) {
        for (const kid of kids) {
          if (kid.text !== undefined && !kid.container) Object.assign(kid, { container: node.backendDOMNodeId, frameId: from.frameId });
        }
      }
      return kids;
    }
    if (role === 'RootWebArea') return kids;
    return [{ node, kids, from }];
  }

  function render(items, depth) {
    const indent = '  '.repeat(depth);
    for (const item of mergeText(items)) {
      if (item.text !== undefined) {
        lines.push(`${indent}- text${assignRef(item.container, 'text', truncate(item.text, MAX_NAME), item.frameId)}: ${truncate(item.text, MAX_TEXT)}`);
        continue;
      }
      const { node, kids, from } = item;
      const role = displayRole(node.role.value);
      const name = clean(node.name?.value);
      let line = `${indent}- ${role}`;
      if (name) line += ` "${truncate(name, MAX_NAME).replace(/"/g, '\\"')}"`;
      line += flags(node, origin);
      if (role === 'combobox') line += options(node, from);
      line += assignRef(node.backendDOMNodeId, role, name, from.frameId);
      const value = clean(node.value?.value);
      const merged = mergeText(kids);
      if (value && value !== name) {
        lines.push(`${line}: ${truncate(value, MAX_TEXT)}`);
      } else if (merged.length === 1 && merged[0].text !== undefined) {
        const text = merged[0].text;
        lines.push(text === name ? line : `${line}: ${truncate(text, MAX_TEXT)}`);
      } else if (merged.length) {
        lines.push(`${line}:`);
        render(merged, depth + 1);
      } else {
        lines.push(line);
      }
    }
  }

  function options(node, from) {
    const found = [];
    const walk = (current) => {
      for (const child of childrenOf(current, from)) {
        if (child.role?.value === 'option' || child.role?.value === 'MenuListOption') found.push(clean(child.name?.value));
        else walk(child);
      }
    };
    walk(node);
    if (!found.length) return '';
    const shown = found.slice(0, MAX_OPTIONS).join(' | ');
    return ` [options: ${shown}${found.length > MAX_OPTIONS ? ` | …${found.length - MAX_OPTIONS} more` : ''}]`;
  }

  render(collect(rootOf(nodes), tree(nodes, null)), 0);
  return { text: lines.join('\n'), refs };
}

function property(node, name) {
  return node.properties?.find((prop) => prop.name === name)?.value?.value;
}

function mergeText(items) {
  const merged = [];
  for (const item of items) {
    const last = merged.at(-1);
    if (item.text !== undefined && last?.text !== undefined && item.container === last.container) {
      const joiner = /\s$/.test(last.text) || /^\s/.test(item.text) ? '' : ' ';
      last.text = clean(last.text + joiner + item.text);
    } else if (item.text !== undefined) {
      merged.push({ ...item, text: clean(item.text) });
    } else {
      merged.push(item);
    }
  }
  return merged.filter((item) => item.text === undefined || item.text);
}

function flags(node, origin) {
  let out = '';
  const props = Object.fromEntries((node.properties ?? []).map((prop) => [prop.name, prop.value?.value]));
  const role = node.role.value;
  if (props.level !== undefined && role === 'heading') out += ` [level=${props.level}]`;
  for (const flag of FLAGS) {
    const value = props[flag];
    if (value === undefined || value === false || value === 'false') continue;
    if (flag === 'focused' && role === 'RootWebArea') continue;
    out += value === true || value === 'true' ? ` [${flag === 'focused' ? 'active' : flag}]` : ` [${flag}=${value}]`;
  }
  if (props.expanded === false && props.hasPopup === undefined) out += ' [collapsed]';
  if (props.editable && !['textbox', 'searchbox', 'combobox'].includes(role)) out += ' [editable]';
  if (role === 'link' && props.url) out += ` [url=${relativeUrl(props.url, origin)}]`;
  return out;
}

function displayRole(role) {
  if (role === 'img') return 'image';
  return role.length > 1 && /^[A-Z][a-z]/.test(role) ? role[0].toLowerCase() + role.slice(1) : role;
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function relativeUrl(url, origin) {
  if (origin && origin !== 'null' && url.startsWith(`${origin}/`)) return url.slice(origin.length);
  return url;
}
