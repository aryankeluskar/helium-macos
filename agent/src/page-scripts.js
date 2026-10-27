export function readable(maxChars) {
  const root = document.querySelector('main, [role=main], article') || document.body || document.documentElement;
  const skipped = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'HEAD', 'svg', 'INPUT', 'SELECT', 'TEXTAREA']);
  const blocks = [];
  let line = '';
  let listDepth = 0;
  let indent = '';
  const flush = (tight) => {
    const text = line.replace(/[ \t\u00a0]+/g, ' ').trim();
    if (text) blocks.push({ text: indent + text, tight });
    line = '';
  };
  const hidden = (el) => {
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
    const style = getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden';
  };
  const absolute = (href) => {
    try {
      return new URL(href, location.href).href;
    } catch {
      return href;
    }
  };
  const isBlock = (el) => !/^inline/.test(getComputedStyle(el).display);
  const walkChildren = (el) => {
    for (const child of el.childNodes) walk(child);
    if (el.shadowRoot) for (const child of el.shadowRoot.childNodes) walk(child);
  };
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      line += node.textContent.replace(/\s+/g, ' ');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    const tag = el.tagName;
    if (skipped.has(tag) || hidden(el)) return;
    if (tag === 'BR') {
      flush(true);
      return;
    }
    if (tag === 'IFRAME' || tag === 'FRAME') {
      let inner = null;
      try {
        inner = el.contentDocument?.body;
      } catch {}
      if (inner && !hidden(el)) {
        flush();
        walk(inner);
        flush();
      }
      return;
    }
    const heading = /^H([1-6])$/.exec(tag);
    if (heading) {
      flush();
      line = '#'.repeat(Number(heading[1])) + ' ';
      walkChildren(el);
      flush();
      return;
    }
    if (tag === 'A') {
      const href = el.getAttribute('href');
      const start = line.length;
      walkChildren(el);
      const text = line.slice(start).replace(/\s+/g, ' ').trim();
      if (href && text && !href.startsWith('javascript:')) line = `${line.slice(0, start)}[${text}](${absolute(href)})`;
      return;
    }
    if (tag === 'IMG') {
      const alt = el.getAttribute('alt')?.trim();
      if (alt) line += `![${alt}]`;
      return;
    }
    if (tag === 'PRE') {
      flush();
      blocks.push({ text: '```\n' + el.innerText.replace(/\n+$/, '') + '\n```' });
      return;
    }
    if (tag === 'LI') {
      flush(true);
      const outer = indent;
      const ordered = el.parentElement?.tagName === 'OL';
      indent = '  '.repeat(Math.max(0, listDepth - 1));
      line = (ordered ? `${[...el.parentElement.children].indexOf(el) + 1}.` : '-') + ' ';
      walkChildren(el);
      flush(true);
      indent = outer;
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      flush(listDepth > 0);
      listDepth++;
      walkChildren(el);
      listDepth--;
      flush(true);
      return;
    }
    if (tag === 'TR') {
      flush(true);
      const cells = [...el.cells].map((cell) => cell.innerText.replace(/\s+/g, ' ').trim());
      blocks.push({ text: `| ${cells.join(' | ')} |`, tight: true });
      return;
    }
    const block = isBlock(el);
    if (block) flush();
    walkChildren(el);
    if (block) flush();
  }
  walk(root);
  flush();
  let out = '';
  blocks.forEach((block, index) => {
    if (index) out += block.tight && blocks[index - 1].tight ? '\n' : '\n\n';
    out += block.text;
  });
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}\n\n[… truncated at ${maxChars} characters]`;
  return { title: document.title, url: location.href, text: out };
}

export function selectOption(wanted) {
  if (this.tagName !== 'SELECT') return { error: `is a <${this.tagName.toLowerCase()}>, not a <select>` };
  const options = [...this.options];
  const lower = String(wanted).toLowerCase();
  const option =
    options.find((o) => o.value === wanted) ||
    options.find((o) => o.label.trim() === wanted) ||
    options.find((o) => o.label.trim().toLowerCase() === lower) ||
    options.find((o) => o.label.trim().toLowerCase().includes(lower));
  if (!option) return { error: `has no option "${wanted}". Options: ${options.map((o) => o.label.trim() || o.value).join(', ')}` };
  if (this.multiple) option.selected = true;
  else this.value = option.value;
  this.dispatchEvent(new Event('input', { bubbles: true }));
  this.dispatchEvent(new Event('change', { bubbles: true }));
  return { value: option.value, label: option.label.trim() };
}

export function toElement() {
  return this.nodeType === Node.ELEMENT_NODE ? this : this.parentElement;
}

export function hitTest(x, y) {
  const root = this.getRootNode();
  const hit = (root.elementFromPoint ? root : document).elementFromPoint(x, y);
  return !!hit && (hit === this || this.contains(hit));
}

export function prepareForTyping(useFocused) {
  let el = this;
  if (useFocused) {
    el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  }
  const textInput = el?.tagName === 'INPUT' && !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/i.test(el.type);
  if (!el || !(el.isContentEditable || el.tagName === 'TEXTAREA' || textInput)) return 'not-editable';
  if (el.disabled) return 'disabled';
  if (el.readOnly) return 'read-only';
  el.focus();
  if (el.isContentEditable) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    el.select();
  }
  return 'ready';
}

export function scrollPage(direction) {
  const viewportHeight = window.innerHeight;
  const center = document.elementFromPoint(window.innerWidth / 2, viewportHeight / 2);
  let scroller = center;
  while (scroller && scroller !== document.body && scroller !== document.documentElement) {
    const style = getComputedStyle(scroller);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight + 1) break;
    scroller = scroller.parentElement;
  }
  if (!scroller || scroller === document.body || scroller === document.documentElement) scroller = document.scrollingElement || document.documentElement;
  const step = Math.round(Math.min(scroller.clientHeight || viewportHeight, viewportHeight) * 0.85);
  scroller.scrollBy({ top: direction === 'up' ? -step : step, behavior: 'instant' });
  return scrollState(scroller);
  function scrollState(el) {
    const top = Math.round(el.scrollTop);
    return { top, height: el.scrollHeight, viewport: el.clientHeight, atTop: top <= 0, atBottom: top + el.clientHeight >= el.scrollHeight - 1 };
  }
}

export function scrollToElement() {
  this.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const el = document.scrollingElement || document.documentElement;
  const top = Math.round(el.scrollTop);
  return { top, height: el.scrollHeight, viewport: el.clientHeight, atTop: top <= 0, atBottom: top + el.clientHeight >= el.scrollHeight - 1 };
}

export function pageState() {
  return { readyState: document.readyState, resources: performance.getEntriesByType('resource').length, url: location.href };
}

export function hasText(text) {
  return !!document.body && document.body.innerText.includes(text);
}

export function hasSelector(selector) {
  const el = document.querySelector(selector);
  return !!el && (typeof el.checkVisibility !== 'function' || el.checkVisibility());
}
