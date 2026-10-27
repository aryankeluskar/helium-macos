import http from 'node:http';

const pages = {
  '/': () => `<!doctype html><html><head><title>Helium test page</title></head><body>
<main>
<h1>Test page</h1>
<p>Some <b>readable</b> text with a <a href="/next">link to next</a>.</p>
<form action="/submitted" method="get">
  <label>Name <input name="name"></label>
  <label>Color <select name="color"><option value="r">Red</option><option value="g">Green</option><option value="b">Blue</option></select></label>
  <button type="submit">Send</button>
</form>
<button id="counter" onclick="this.textContent = 'Clicked ' + (window.clicks = (window.clicks || 0) + 1)">Click me</button>
<button id="later" onclick="setTimeout(() => document.getElementById('status').textContent = 'Loaded later', 600)">Load later</button>
<p id="status">Nothing loaded</p>
<ul><li>First item</li><li>Second item</li></ul>
<div style="height: 3000px"></div>
<p id="bottom">Bottom of page</p>
</main>
</body></html>`,
  '/frame': () => `<!doctype html><title>Frame page</title><h1>Outer</h1><iframe srcdoc="<button onclick='this.textContent=&quot;Pressed&quot;'>Frame button</button><p>Frame text</p>"></iframe>`,
  '/download': () => `<!doctype html><title>Download page</title><a href="/report.csv">Get the report</a>`,
  '/next': () => `<!doctype html><title>Next page</title><h1>Next</h1><p>You followed the link.</p><a href="/">Home</a>`,
  '/submitted': (url) => `<!doctype html><title>Submitted</title><h1>Submitted</h1><p id="result">name=${escape(url.searchParams.get('name'))} color=${escape(url.searchParams.get('color'))}</p>`,
};

function escape(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function startSite() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/report.csv') {
      res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="report.csv"' });
      res.end('name,color\nAda,green\n');
      return;
    }
    const page = pages[url.pathname];
    res.writeHead(page ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page ? page(url) : 'not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });
}
