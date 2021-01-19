function writeToMediaStateLog (output) {
  writeToLog(output, 'media-state-log-data');
}

function writeToLog (output, elId = 'log-data') {
  const timeStamp = new Date().toString();
  const stampedOutput = '\n' + timeStamp + '\n' + output + '\n';
  const el = document.getElementById(elId)
  if (el) {
    const currentValue = el.value;
    el.value = stampedOutput + currentValue;
  }
}

function getAccessToken () {
  let accessToken = null;
  // Get accessToken from cookie if it exists
  const authInfo = JSON.parse(window.localStorage.getItem('sdk_test_auth_data'));
  if (authInfo) {
    accessToken = authInfo.accessToken;
  } else {
    // If not on a cookie, check the url
    const urlParams = window.getCurrentUrlParams();
    accessToken = urlParams.access_token;
  }

  return accessToken;
}

export default {
  writeToLog: writeToLog,
  writeToMediaStateLog: writeToMediaStateLog,
  getAccessToken: getAccessToken
};
