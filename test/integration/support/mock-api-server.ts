/* eslint @typescript-eslint/no-explicit-any: "off" */
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';

/**
 * Black-box IT mock server (zero dependencies, built on node:http).
 *
 * Stands up a REAL HTTP server on a real port - the SDK talks to it exactly as
 * it talks to the Genesys Cloud platform API. Point the SDK at `server.baseUrl`
 * (`sdk._config.environment = server.baseUrl`); the streaming-client HttpClient
 * builds `${host}/api/v2/<path>` and issues a REAL request this server answers.
 * No SDK-internal method is mocked - the only thing faked is the outward network
 * peer, which is what a true black-box IT requires.
 *
 * Files using this stay in the default **jsdom** test environment (the SDK needs
 * `window`). jsdom's XHR will not reach a real socket, so the shared harness
 * `installHttpMockServer()` forces axios onto its node adapter
 * (`axios.defaults.adapter = 'http'`) for the duration of the suite. That is how
 * the real request reaches this server - do NOT add `@jest-environment node`
 * (it would remove `window` and break SDK construction). See
 * `support/black-box-harness.ts`, `AGENTS.md`, and `ai/test-standards.md`.
 *
 * Usage (prefer the harness, which wires the adapter + lifecycle):
 *   const api = installHttpMockServer();   // from support/black-box-harness
 *   api.stub('post', /\/conversations\/calls$/, { status: 200, body: { id: 'x' } });
 *   // ...drive the SDK (sdk._config.environment = api.baseUrl)...
 *   expect(api.received('post')[0].path).toContain('/conversations/calls');
 */

export interface RecordedRequest {
  method: string;
  path: string;
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

interface Stub {
  method: string;
  matcher: RegExp;
  status: number;
  body: any;
}

export class MockApiServer {
  private server?: Server;
  private stubs: Stub[] = [];
  private requests: RecordedRequest[] = [];
  port = 0;

  start (): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => this.handle(req, res));
      this.server.listen(0, '127.0.0.1', () => {
        this.port = (this.server!.address() as AddressInfo).port;
        resolve();
      });
    });
  }

  stop (): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) { return resolve(); }
      this.server.close(() => resolve());
    });
  }

  /** Clear stubs + recorded requests between tests. */
  reset (): void {
    this.stubs = [];
    this.requests = [];
  }

  /** The value to assign to `sdk._config.environment`. */
  get baseUrl (): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Register a response for a method + path regex (last match wins). */
  stub (method: string, matcher: RegExp, response: { status: number; body?: any }): this {
    this.stubs.push({ method: method.toLowerCase(), matcher, status: response.status, body: response.body ?? {} });
    return this;
  }

  /** All recorded requests, optionally filtered by method. */
  received (method?: string): RecordedRequest[] {
    return method ? this.requests.filter(r => r.method === method.toLowerCase()) : this.requests;
  }

  private handle (req: IncomingMessage, res: ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: any = raw;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { /* leave as string */ }

      const url = req.url || '';
      const path = url.split('?')[0];
      this.requests.push({ method: (req.method || '').toLowerCase(), path, body, headers: req.headers });

      const stub = [...this.stubs].reverse().find(s =>
        s.method === (req.method || '').toLowerCase() && s.matcher.test(path)
      );

      const status = stub ? stub.status : 200;
      const payload = stub ? stub.body : {};
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  }
}
