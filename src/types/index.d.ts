declare module 'wildemitter' {
  export default class WildEmitter {
    constructor ();
    on (event: string, message?: any, details?: any): void;
    emit (event: string, message?: any, details?: any): void;
  }
}

declare module 'purecloud-streaming-client' {
  export default class StreamingClient {
    constructor (options: any);
    connect (): Promise<any>;
    webrtcSessions: {
      refreshIceServers (): Promise<any>;
    }
  }
}
