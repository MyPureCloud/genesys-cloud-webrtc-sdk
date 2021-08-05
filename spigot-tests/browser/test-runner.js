import stringify from 'json-stringify-safe';

const LOG_UPLOAD_WAIT = 1200;

if (window.location.search.indexOf('headless') > 0) {
  mocha.setup({
      ui: 'bdd',
      reporter: 'xunit',
      timeout: 10000
  });
  window._headless = true;
} else {
  mocha.setup({
      timeout: 10000,
      ui: 'bdd'
  });
  window._headless = false;
}

if (window._headless) {
  const mapArgs = function (fn) {
    return function () {
      fn(...[...arguments].map(a => {
        if (typeof a === 'string') {
          return a;
        }
        return stringify(a);
      }));
    };
  };
  console.info = mapArgs(console.info.bind(console));
  console.log = mapArgs(console.log.bind(console));
  console.debug = mapArgs(console.debug.bind(console));
  console.warn = mapArgs(console.warn.bind(console));
  console.error = mapArgs(console.error.bind(console));
}

window.prepareTests = () => {
  return window.loadUserInformation();
};

window.startTests = () => {
  let xunitReport = '<?xml version="1.0" encoding="UTF-8"?>';

  return window.prepareTests()
    .then((user) => {
      // When using xunit reporter in the browser, mocha just dumps each line to console.log
      // So override console.log and redirect the xunit result lines.
      console.info('running in headless mode', stringify(user));
      const consoleLog = console.log.bind(console);
      console.log = function (arg1) {
        if (arg1 && typeof arg1 === 'string' && arg1.startsWith('<')) {
          xunitReport += arg1;
          return;
        }

        if (window._headless) {
          // stringify console logs
          const args = [];
          [...arguments].forEach((arg) => {
            if (typeof arg === 'object') {
              args.push(stringify(arg));
            } else {
              args.push(arg);
            }
          });

          consoleLog(...args);
        } else {
          consoleLog(...arguments);
        }
      };
    })
    .then(() => {
      return new Promise((resolve) => {
        const runner = window.mocha.run(() => { });

        runner.on('end', function () {
          console.log('tests done', resolve(runner.stats));
          window.runner = runner;
        });
      });
    })
    .then(stats => {
      // This hackiness is because there's no event for the reporter being done writing all lines
      // so just delay being done until the closing testsuite tag is written out.
      return new Promise((resolve) => {
        const finish = function (stats) {
          // pad the finish with some time so logs can be uploaded
          setTimeout(() => {
            resolve(stats);
          }, LOG_UPLOAD_WAIT);
        };

        const check = function () {
          console.log('checking');

          if (window._headless === false) {
            return finish(stats);
          }

          if (xunitReport.indexOf('</testsuite>') > 0) {
            stats.xunit = xunitReport;
            return finish(stats);
          }
          setTimeout(check, 200);
        };
        check();
      });
    }).catch(e => {
      console.error('error running tests', stringify(e));
      throw e;
    })
};
