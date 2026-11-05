const BLINK_UA_TOKENS = ['Chrome/', 'Chromium/'];

/**
 * Internal utility to check if the browser runs on WebKit, based on
 *  the user agent. Read on every call (not cached). This includes
 *  Safari and every iOS browser (which must use WebKit), and excludes
 *  Chromium-based browsers, whose user agents also name AppleWebKit.
 *
 * browserama's `isSafari` is not used because it is computed once
 *  at load from `window.safari`, which WebKit builds such as
 *  Playwright's do not expose.
 */
export const isWebKit = function (): boolean {
  const userAgent = window.navigator.userAgent || '';
  return userAgent.includes('AppleWebKit/') && !BLINK_UA_TOKENS.some(token => userAgent.includes(token));
};
