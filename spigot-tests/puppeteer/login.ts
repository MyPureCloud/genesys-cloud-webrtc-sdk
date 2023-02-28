import { Page } from 'puppeteer';
import { PuppeteerManager } from './launch';

export function startLogin (this: PuppeteerManager, page) {
  const redirectUri = encodeURIComponent(this.config.oauth.redirectUri);
  const authUrl = `${this.config.oauth.urlBase}${this.config.oauth.urlPath}` +
  `?response_type=token&client_id=${this.config.oauth.clientId}&redirect_uri=${redirectUri}`;

  this.logger.info('Starting login at: ', authUrl);
  return page.goto(authUrl);
}

export async function doLogin (this: PuppeteerManager, page: Page) {
  await page.waitForSelector('input#email');
  await page.focus('input#email');
  await page.keyboard.type(this.config.credentials.username);
  await page.focus('input#password');
  await page.keyboard.type(this.config.credentials.password);
  const submit = await page.$('button[type="submit"]');
  submit?.click();
  try {
    await page.waitForSelector('input#org');
    await page.focus('input#org');
    await page.keyboard.type(this.config.credentials.org);
    submit?.click();
  } catch (e) {
    /* login worked without org input */
  }

  const scopesAllow = await page.$('.authorize-scope');
  if (scopesAllow) {
    scopesAllow.click();
  }

  this.logger.debug('logged in, waiting for redirect');
}

export async function doAccessRedirect (this: PuppeteerManager, page, pageHash, extraQueryParams = '') {
  const matches = pageHash.match(/#access_token=(.*?)&/);
  if (!matches || matches.length < 2) {
    this.logger.warn('Failed to get access token');
    throw new Error('Failed to get access token');
  }
  let redirectUrl = `${this.config.oauth.redirectUri}index.html?authToken=${matches[1]}${extraQueryParams}`;
  if (this.config.headless) {
    redirectUrl += '&headless';
  }
  this.logger.debug('attempting redirect', redirectUrl);
  await page.goto(redirectUrl);
}
