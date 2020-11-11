export interface TestConfig {
  oauth: {
    urlBase?: string;
    urlPath?: string;
    redirectUri: string;
    clientId: string;
  };
  appName: string;
  appVersion: string;
  filter: string;
  credentials: {
    org: string,
    username: string;
    password: string;
  };
  logLevel: 'info' | 'log' | 'debug' | 'error' | 'warn';
  headless: boolean;
  validationTimeout: number;
  callDelay: number;
  outboundNumber: string;
  host: string;
  apiUrl: string;
  envHost: string;
  personDetailsUrl: string;
  testOutputPath: string;
  uuid: string;
}
