function mergeOptions (destination, provided) {
  for (var key in provided) {
    let value = provided[key];
    if (typeof value === 'object') {
      if (!destination[key]) {
        destination[key] = {};
      }
      mergeOptions(destination[key], value);
    } else {
      destination[key] = provided[key];
    }
  }

  return destination;
}

module.exports = {
  mergeOptions
};
