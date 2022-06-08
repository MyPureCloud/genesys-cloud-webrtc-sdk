export function getInputValue (inputId: string): string {
  return (document.getElementById(inputId) as HTMLInputElement).value;
}

export function writeToLog (output: string, elId = 'log-data') {
  const timeStamp = new Date().toString();
  const stampedOutput = '\n' + timeStamp + '\n' + output + '\n';
  const el = document.getElementById(elId) as HTMLTextAreaElement;
  if (el) {
    const currentValue = el.value;
    el.value = stampedOutput + currentValue;
  }
  console.log('[demo-sdk-app]', output);
}

export function getCurrentUrlParams () {
  let params = null;
  const urlParts = window.location.href.split('#');

  if (urlParts[1]) {
    const urlParamsArr = urlParts[1].split('&');

    if (urlParamsArr.length) {
      params = {};
      for (let i = 0; i < urlParamsArr.length; i++) {
        const currParam = urlParamsArr[i].split('=');
        const key = currParam[0];
        const value = currParam[1];
        params[key] = value;
      }
    }
  }

  return params;
}

export function getJwk () {
  let jwt = null;
  const urlParams = getCurrentUrlParams();
  jwt = urlParams.jwt;

  return jwt;
}
