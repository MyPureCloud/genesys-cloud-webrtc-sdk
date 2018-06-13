function writeToLog (output) {
  let timeStamp = new Date().toString();
  let stampedOutput = '\n' + timeStamp + '\n' + output + '\n';
  document.getElementById('log-data').value += stampedOutput;
}

module.exports = {
  writeToLog: writeToLog
};
