import fs from 'fs';
import path from 'path';
import * as loginHandler from './login';
import { TestConfig } from '../types/test-config';
import { Logger } from 'genesys-cloud-client-logger/dist/src/logger';
import puppeteer, { Page } from 'puppeteer';
import mkdirp from 'mkdirp';

export class PuppeteerManager {
  constructor (public config: TestConfig, public logger: Logger) { }

  launch () {
    const debugConfig = JSON.parse(JSON.stringify(this.config));
    debugConfig.credentials.password = '-redacted-';
    this.logger.debug('launching with config', { debugConfig });

    // launch puppeteer, run through oauth, and redirect to tests
    const browserConfig = {
      ignoreHTTPSErrors: true,
      headless: this.config.headless,
      devtools: !this.config.headless,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--enable-logging',
        '--vmodule=/webrtc/=2,/libjingle/=2,*=-2',
        '--no-sandbox',
        `--use-file-for-fake-audio-capture=${path.resolve(__dirname, 'audio1.wav')}`
      ]
    };
    this.logger.debug('browserConfig', browserConfig);
    return puppeteer.launch(browserConfig).then(async browser => {
      const webrtcInternals = await browser.newPage();
      await webrtcInternals.goto('chrome://webrtc-internals');
      const page = await browser.newPage();

      page.on('console', msg => {
        let msgType = msg.type().toString();
        try {
          if (msgType === 'warning') {
            msgType = 'warn';
          }
          this.logger[msgType](`BROWSER:`, msgType, msg.text());
        } catch (e) {
          console.log('Cannot log browser log:', msgType, 'is not a function on the this.logger');
        }
      });

      let redirectTimeout;

      return new Promise(async (resolve, reject) => {
        page.on('load', async () => {
          const url = page.url();
          this.logger.debug('Page loaded', url);
          if (url.indexOf(this.config.oauth.urlBase) === 0) {
            redirectTimeout = setTimeout(() => {
              this.logger.error('Timed out waiting for login redirect back to tests.');
              process.exit(1);
            }, 3 * 60 * 1000);
            return loginHandler.doLogin.call(this, page);
          }
          const pageHash = await page.evaluate(() => window.location.hash);
          if (pageHash.indexOf('access_token') > -1) {
            clearTimeout(redirectTimeout);
            this.logger.debug('redirect successful loaded', page.url());

            let extraParams = '';

            if (this.config.filter) {
              extraParams += `&grep=${encodeURIComponent(this.config.filter)}`;
            }

            return loginHandler.doAccessRedirect.call(this, page, pageHash, extraParams);
          }
          if (url.indexOf('index.html') > -1) {
            return this.verify(page, webrtcInternals).then(resolve, reject);
          }
        });
        await loginHandler.startLogin.call(this, page);
      });
    });
  }

  async verify (page: Page, webrtcInternals: Page) {
    let stats;
    try {
      stats = await page.evaluate(() => {
        const testStats = (window as any).testStats;
        console.log('testStats from window', JSON.stringify({ href: window.location.href, testStats }));
        return testStats;
      });
    } catch (e) {
      this.logger.error('Error in running tests', e);
      stats = { failures: 1 };
    }
    if (!stats || stats.failures > 0) {
      this.logger.error('Test failures occurred', stats);
    } else {
      this.logger.log('Tests passed', stats);
    }
    if (stats && stats.xunit) {
      const outputPath = this.config.testOutputPath;
      this.logger.warn('Writing xunit results to', outputPath);
      const pathEndIndex = outputPath.lastIndexOf('/');
      if (pathEndIndex >= 0) {
        mkdirp.sync(outputPath.substring(0, pathEndIndex));
      }

      fs.writeFileSync(outputPath, stats.xunit);
    }

    try {
      await (webrtcInternals as any)._client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: './bin' });
      await webrtcInternals.click('details summary');
      await webrtcInternals.click('details button');
    } catch (e) {
      this.logger.warn('Failed to get webrtc internals content');
    }
    process.exit(!stats || stats.failures > 0 ? 1 : 0);
  }
}
