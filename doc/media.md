


### IUpdateOutgoingMedia
checkout index.md to make sure you code this right



#### Device ID Support

The SDK provides flexibility in choosing device IDs. It will follow these steps when attempting to update a device:

- If a `deviceId` is provided in the form of a `string`
  - Attempt to use that device
  - If the device cannot be found, attempt to use the sdk default device for that type (ie. `defaultAudioDeviceId`, etc)
  - If the default device cannot be found, attempt to use the system default

- If `true` is provided
  - Attempt to use the `sdk`'s default device
  - If the device cannot be found, attempt to use the system default

- If `null` is provided
  - Attempt to use the system default

- If `undefined` is provided
  - Do not touch that media type (`audio`, `video`, or `output`)
