declare module 'wildemitter' {
  export default class WildEmitter {
    constructor ();
    on (event: string, message?: any, details?: any): void;
    emit (event: string, message?: any, details?: any): void;
  }
}
