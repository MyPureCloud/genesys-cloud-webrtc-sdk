import { isWebKit } from '../../../src/media/browser-detection';

describe('isWebKit()', () => {
  const setUserAgent = (userAgent: string | undefined) => {
    Object.defineProperty(window.navigator, 'userAgent', { get: () => userAgent, configurable: true });
  };

  afterEach(() => {
    Reflect.deleteProperty(window.navigator, 'userAgent');
  });

  it.each([
    ['Safari desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'],
    ['Playwright WebKit', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'],
    ['Chrome on iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1'],
    ['Firefox on iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15'],
    ['Edge on iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/131.0.0.0 Mobile/15E148 Safari/605.1.15']
  ])('should be true for %s', (_name, userAgent) => {
    setUserAgent(userAgent);
    expect(isWebKit()).toBe(true);
  });

  it.each([
    ['Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'],
    ['Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'],
    ['Opera', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/116.0.0.0'],
    ['Chrome on Android', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'],
    ['Firefox', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0'],
    ['an empty user agent', '']
  ])('should be false for %s', (_name, userAgent) => {
    setUserAgent(userAgent);
    expect(isWebKit()).toBe(false);
  });

  it('should be false when there is no user agent', () => {
    setUserAgent(undefined);
    expect(isWebKit()).toBe(false);
  });

  it('should read the user agent on every call', () => {
    setUserAgent('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15');
    expect(isWebKit()).toBe(true);
    setUserAgent('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    expect(isWebKit()).toBe(false);
  });
});
