declare module 'browserama' {
  const browserama: {
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

  export default browserama;
}
