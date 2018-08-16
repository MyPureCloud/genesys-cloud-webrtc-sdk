function writeToLog (output) {
  let timeStamp = new Date().toString();
  let stampedOutput = '\n' + timeStamp + '\n' + output + '\n';
  document.getElementById('log-data').value += stampedOutput;
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

module.exports = {
  writeToLog: writeToLog,
  getAccessToken: getAccessToken
};
