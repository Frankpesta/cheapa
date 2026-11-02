/** A real local HTTP server for PoliteHttp tests: routes by path, records every hit. */
import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Hit {
  path: string;
  headers: IncomingHttpHeaders;
  at: number;
}

export type Route = (res: ServerResponse, hit: Hit, count: number) => void;

export interface TestServer {
  origin: string;
  hits: Hit[];
  count(path: string): number;
  route(path: string, handler: Route): void;
  close(): Promise<void>;
}

export async function startServer(routes: Record<string, Route> = {}): Promise<TestServer> {
  const table = new Map(Object.entries(routes));
  const hits: Hit[] = [];
  const count = (path: string) => hits.filter((h) => h.path === path).length;

  const server = createServer((req, res) => {
    const hit: Hit = { path: req.url ?? '/', headers: req.headers, at: Date.now() };
    hits.push(hit);
    const handler = table.get(hit.path);
    if (!handler) return send(res, 404, 'not found');
    handler(res, hit, count(hit.path));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    hits,
    count,
    route: (path, handler) => table.set(path, handler),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export function send(
  res: ServerResponse,
  status: number,
  body = '',
  headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' },
): void {
  res.writeHead(status, headers);
  res.end(body);
}
