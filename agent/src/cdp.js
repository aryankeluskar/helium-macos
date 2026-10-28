import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { HydrogenError } from './util.js';

export const APPROVAL_TIMEOUT_MS = 120_000;
export const APPROVAL_NOTICE = 'Approve the connection in Hydrogen: click "Allow" in the "Allow remote debugging?" dialog. Waiting…';

export class Connection extends EventEmitter {
  constructor(ws) {
    super();
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.closed = false;
    ws.on('message', (data) => this.receive(data));
    ws.on('error', () => {});
    ws.on('close', () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new HydrogenError('Hydrogen closed the DevTools connection.'));
      this.pending.clear();
      this.emit('close');
    });
  }

  receive(data) {
    const message = JSON.parse(data.toString());
    if (message.id === undefined) {
      this.emit(message.method, message.params ?? {}, message.sessionId);
      return;
    }
    const call = this.pending.get(message.id);
    if (!call) return;
    this.pending.delete(message.id);
    clearTimeout(call.timer);
    if (message.error) call.reject(new CDPError(call.method, message.error));
    else call.resolve(message.result ?? {});
  }

  send(method, params = {}, sessionId, timeoutMs = 30_000) {
    if (this.closed) return Promise.reject(new HydrogenError('The connection to Hydrogen is closed.'));
    const id = ++this.nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HydrogenError(`Hydrogen did not answer ${method} within ${Math.round(timeoutMs / 1000)}s.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.ws.send(JSON.stringify(message));
    });
  }

  close() {
    this.ws.close();
  }
}

export class CDPError extends Error {
  constructor(method, error) {
    super(`${method}: ${error.message}${error.data ? ` (${error.data})` : ''}`);
    this.code = error.code;
  }
}

export async function connect(endpoint, { timeoutMs = APPROVAL_TIMEOUT_MS } = {}) {
  const ws = await new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint.url, { perMessageDeflate: false, handshakeTimeout: timeoutMs, maxPayload: 512 * 1024 * 1024 });
    socket.once('open', () => resolve(socket));
    socket.once('error', (error) => reject(explain(error, endpoint)));
    socket.once('close', () => reject(rejected()));
  });
  const connection = new Connection(ws);
  try {
    await connection.send('Browser.getVersion', {}, undefined, timeoutMs);
  } catch (error) {
    const wasClosed = connection.closed;
    connection.close();
    if (wasClosed) throw rejected();
    if (error instanceof HydrogenError) throw approvalTimedOut();
    throw error;
  }
  return connection;
}

function approvalTimedOut() {
  return new HydrogenError(
    'Timed out waiting for approval.\n' +
      'Run the command again and click "Allow" in the "Allow remote debugging?" dialog in Hydrogen.',
  );
}

function rejected() {
  return new HydrogenError(
    'Hydrogen closed the connection before it was approved.\n' +
      'Run the command again and click "Allow" in the "Allow remote debugging?" dialog in Hydrogen.',
  );
}

function explain(error, endpoint) {
  if (error.code === 'ECONNREFUSED') {
    return new HydrogenError(
      `Nothing is listening at ${endpoint.url} (from ${endpoint.source}).\n` +
        'Start Hydrogen, make sure remote debugging is on at chrome://inspect/#remote-debugging, and try again.',
    );
  }
  if (/handshake has timed out/i.test(error.message)) return approvalTimedOut();
  if (error.code === 'ECONNRESET' || /socket hang up/i.test(error.message)) return rejected();
  if (/Unexpected server response: (403|404)/.test(error.message)) {
    return new HydrogenError(
      `Hydrogen refused the connection (${error.message}).\n` +
        'Open chrome://inspect/#remote-debugging, check remote debugging is on, run the command again and click "Allow".',
    );
  }
  return new HydrogenError(`Could not connect to Hydrogen at ${endpoint.url}: ${error.message}`);
}
