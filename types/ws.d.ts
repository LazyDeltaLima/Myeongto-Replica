// The server's WebSocket library (`ws`, server/http/websocket.js) ships no types and the repository does not install
// `@types/ws`: a loose stand-in for the server typecheck. The server, with the members websocket.js calls typed
// loosely (each listener takes any arguments), and a socket (net.js JSDoc) have every other member any. A new member
// websocket.js calls goes here.

declare module 'ws' {
  export class WebSocketServer {
    constructor(options?: Record<string, any>);
    on(event: string, listener: (...args: any[]) => void): this;
    handleUpgrade(req: import('node:http').IncomingMessage, socket: import('node:stream').Duplex, head: Buffer,
      done: (ws: any) => void): void;
    emit(event: string, ...args: any[]): boolean;
    [member: string]: any;
  }
  export class WebSocket {
    [member: string]: any;
  }
}
