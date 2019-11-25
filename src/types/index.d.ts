declare module 'wildemitter' {
  export default class WildEmitter {
    constructor ();
    on (event: string, ...args: any[]): void;
    once (event: string, ...args: any[]): void;
    off (event: string, ...args: any[]): void;
    emit (event: string, message?: any, details?: any): void;
  }
}

declare module 'purecloud-streaming-client' {
  export default class StreamingClient {
    constructor (options: any);
    connect (): Promise<any>;
    webrtcSessions: {
      refreshIceServers (): Promise<any>;
    };
  }
}

declare module 'webrtc-stats-gatherer' {
  export default class WebrtcStatsGatherer {
    constructor (pc: any, options: any);
  }
}

declare module 'browserama' {
  const broswerama: {
    readonly isChrome: boolean;
    readonly isChromeOrChromium: boolean;
    readonly isChromium: boolean;
    readonly isFirefox: boolean;
    readonly isSafari: boolean;
    readonly isOpera: boolean;
    readonly isEdge: boolean;
    readonly isIE: boolean;
    readonly isBlink: boolean;
  };

  export default broswerama;
}
