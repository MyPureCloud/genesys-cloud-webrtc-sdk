# Genesys Cloud WebRTC SDK Headset Utility

## SDK Headset Index
* [Purpose of SdkHeadset]
* [SdkHeadset]
    * [Example usage]
    * [Properties]
    * [Methods]
    * [Events]


## Purpose of SdkHeadset
The SdkHeadset namespace connects directly to the [new headset library](https://github.com/purecloudlabs/softphone-vendor-headsets) that allows device call controls from at this moment three headset vendors. Plantronics/Poly, Sennheiser/EPOS and Jabra. It makes it possible for events from the headset to be properly handled and reflected in consuming apps. It also allows events from consuming apps to be properly reflected in the headset itself. This ensures the states of both the devices and consuming apps are always in sync

--------

## SdkHeadset

### Example Usage

``` ts
/* async function for demonstration */
async function testAnswerCall () {
    /* This function handles a fromHeadset event. This will not cause the headset library to be called */
    sdk.acceptPendingSession('123456789', 'softphone', true);
}

async function testMuteCall () {
    /* This function handles a from app event. This will cause the headset library to be called */
    sdk.setAudioMute ('123456789', 'softphone', false | undefined);
}
/* Examples of listening for events from the headset */
sdk.headset.headsetEvents.subscribe(value: {
    event: HeadsetEvents,
    payload: {
        name: string,
        event: {`object containing various items from the headset`},
        isMuted: boolean,
        holdRequested: boolean,
        isConnected: boolean,
        isConnecting: boolean,
        callback: Function,
        toggle?: boolean,
        code?: string
    }
} => {
    switch (value.event) {
        case 'deviceAnsweredCall':
            sdk.acceptPendingSession();
            break;
        case 'deviceEndedCall':
            sdk.endSession();
            break;
        case 'deviceMuteStatusChanged':
            sdk.setAudioMute(value.payload.isMuted);
            break;
        case 'deviceHoldStatusChanged':
            sdk.setConversationHold(value.payload.holdRequested, value.payload.toggle);
            break;
        case 'deviceRejectedCall':
            sdk.rejectPendingSession(value.payload.conversationId);
            break;
        case 'webHidPermissionRequested':
            anyNecessaryFunctions(value.payload.callback);
            break;
        case 'deviceConnectionStatusChanged':
            console.log({
                isConnecting: value.payload.isConnecting,
                isConnected: value.payload.isConnected
            })
            anyNecessaryFunctions(value.payload.isConnected, value.payload.isConnecting)
            break;
        default:
        // console.log('some other event');
    }
}

```

### Properties

#### `currentSelectedImplementation`
The currently selected implementation from the headset library. See the [Vendor Implementation interface](https://github.com/purecloudlabs/softphone-vendor-headsets/blob/master/react-app/src/library/services/vendor-implementations/vendor-implementation.ts) for available properties and functions.

### Methods

#### `updateAudioInputDevice()`
Function that will update what the active mic is in the headset library. This passes the newly selected mic label into the headset library where it will check to see which (if any) of the currently supported implementations will be a best fit for the new device. This function should be called any time a new audio device is selected.

This function is currently called from `client.ts` if a new audio device is selected through the function `sdk.updateDefaultDevices()`.

This function will call through `sdk.media.findCachedDeviceByIdAndKind(newMicId)` which takes in the newly selected device's ID and will return the device's complete information including the necessary device label

After receiving the complete device information, it will send the device's label to the headset library through `this.headsetLibrary.activeMicChange(completeDeviceInfo.label.toLowerCase())`

Declaration:
``` ts
    updateAudioInputDevice (newMicId: string) : void;
```

Params:
* `newMicId: string` - The ID of the newly selected device sent from the `client.ts`

Returns: void

#### `showRetry()`
Function that determines if a "show retry" button should be shown on screen to allow the user to attempt to reconnect to their selected vendor and the corresponding implementation. The show retry button should show up if:

1. The selected implementation has disabled retry capabilities
2. The selected device is not supported (i.e. there is no matching implementation - `!selectedImplementation`)
3. The selected implementation is not connected (`!selectedImplementation.isConnected`)
4. The selected implementation is not connecting (`!selectedImplementation.isConnecting`)

Declaration:
``` ts
    showRetry (): boolean;
```

Params: none

Returns: a boolean value determining if a the show retry button is required

#### `retryConnection()`
Function to retry connection to the selected implementation. It takes in the label of the microphone device in question and calls the `connect(label)` function of the corresponding implementation only if the passed in label is not undefined.

Declaration:
``` ts
    retryConnection (micLabel: string): void;
```

Params:
* `micLabel`: string - The label of the device in question to ensure proper functionality when being passed into the `connect` function

Returns: void

#### `setRinging()`
Function that calls the headset library's `incomingCall(callInfo, hasOtherActiveCalls)` function. This will signal to the headset device to flash the answer call button's light to show an incoming call

Declaration:
``` ts
    setRinging(callInfo: { conversationId: string, contactName?: string }, hasOtherActiveCalls: boolean): Promise<void>;
```

Params:
* `callInfo: {conversationId: string, contactName?: string}` - The conversationId and (possibly) contactName for the call that is incoming and needs to be answered/rejected
* `hasOtherActiveCalls: boolean` - Boolean to determine if the user has other active calls going on

Returns: a Promise containing `void`

#### `outgoingCall()`
Function that calls the headset library's `outgoingCall(callInfo)` function. This will signal to the headset device to switch on the answer call button's light to show an active call whether or not the recipient picks up. If the recipient rejects, the headset light should turn off.

Declaration:
``` ts
    outgoingCall(callInfo: { conversationId: string, contactName?: string }): Promise<void>;
```

Params:
* `callInfo: {conversationId: string, contactName?: string}` - The conversationId and (possibly) contactName for the call that is outgoing

Returns: a Promise containing `void`

#### `endCurrentCall()`
Function that calls the headset library's `endCall(conversationId)` function ONLY IF a conversationId was passed in. If no conversationId was passed in, that means there is no active call so nothing needs to end. This signals the headset device to switch off the answer call button's light to show the active call has ended.

Declaration:
``` ts
    endCurrentCall(conversationId: string): Promise<void>;
```

Params:
* `conversationId: string` - The conversationId of the call that needs to be ended

Returns: a Promise containing `void`

#### `endAllCalls()`
Function that calls the headset library's `endAllCalls()` function. This will end not only the current call but all other active calls. This signals the headset device to switch off the answer call buttons's light to show the active calls have all ended

Declaration:
``` ts
    endAllCalls(): Promise<void>;
```

Params: none

Returns: a Promise containing `void`

#### `answerIncomingCalls()`
Function that calls the headset library's `answerIncomingCall(conversationId)` function. This signals the headset device to switch on the answer call button's light to show the call is now active

Declaration:
``` ts
    answerIncomingCall(conversationId: string): Promise<void>;
```

Params:
* `conversationId: string` - The conversationId of the call that needs to be answered

Returns: a Promise containing `void`

#### `rejectIncomingCall()`
Function that calls the headset library's `rejectCall(conversationId)` function. This signals the headset device to switch off the answer call button's ringing (flashing) light to show the call was rejected and therefore not active.

Declaration:
``` ts
    rejectIncomingCall(conversationId: string): Promise<void>;
```

Params:
* `conversationId: string` - The conversationId of the call that needs to be answered

Returns: a Promise containing `void`

#### `setMute()`
Function that calls the headset library's `setMute(isMuted)` function. This signals the headset device to switch on or off (depending on the value of `isMuted`) the mute call button's light to show the call has been muted or unmuted respectively

Declaration:
``` ts
    setMute(isMuted: boolean): Promise<void>;
```

Params:
* `isMuted: boolean` - value to determine if the device is now muted or unmuted

Returns: a Promise containing `void`

#### `setHold()`
Function that calls the headset library's `setHold(conversationId, isHeld)` function. This signals the headset device to switch on or off (depending the value of `isHeld`) the hold call button's light to show the call has been held or resumed respectively

Declaration:
``` ts
    setHold(conversationId: string, isHeld: boolean): Promise<void>;
```

Params:
* `conversationId: string` - The conversationId of the call that needs to be held or resumed
* `isHeld: boolean` - value to determine if the device is now on hold or resumed

Returns: a Promise containing `void`

--------

### Events
The SDK Headset Utility does not explicitly emit events itself. It uses [RxJS observables](https://rxjs.dev/guide/observable) to emit the events which are then subscribed to within the consuming app. It listens for changes and fires functions that correspond to the events

#### `deviceAnsweredCall`
Event emitted when a user presses the answer call button during an incoming call on their selected device. The event includes the event `name` as it is interpretted by the headset and a collection of items that may help with logging (`event`). It can also potentially have a `code` that corresponds to the event.

Declaration:
``` ts
    sdk.headset.headsetEvents.subscribe(event: {
        event: 'deviceAnsweredCall',
        payload: {
            name: string,
            code?: string,
            event: { `containing various items mostly for logging purposes` }
        }
    } => {
        if (event.event === 'deviceAnsweredCall') {
            sdk.acceptPendingSession();
        }
    })
```
Value of event:
* `event: HeadsetEvents` - string value emitted by the headset library to determine what event had just occurred
* `payload:` - object containing
    * `name: string` - Name of the recent event as interpretted by the headset device
    * `event`: { containing various items mostly for logging purposes}
    * `code?: string` - Optional: A string value of a number that represents the action that was just taken. Not all vendors supply a code which is why it is only optional


#### `deviceEndedCall`
Event emitted when a user presses the answer call button while in an active call on their selected device. The event includes the event `name` as it is interpretted by the headset and a collection of items that may help with logging (`event`). It can also potentially have a `code` that corresponds to the event.

Declaration:
``` ts
    sdk.headset.headsetEvents.subscribe(event: {
        event: 'deviceEndedCall',
        payload: {
            name: string,
            event: { `containing various items mostly for logging purposes` },
            code?: string
        } => {
            if (event.event === 'deviceEndedCall') {
                sdk.endSession({ conversationId });
            }
        }
    })
```
Value of event:
* `event: HeadsetEvents` - string value emitted by the headset library to determine what event had just occurred
* `payload:` - object containing
    * `name: string` - Name of the recent event as interpretted by the headset device
    * `event`: { containing various items mostly for logging purposes}
    * `code?: string` - Optional: A string value of a number that represents the action that was just taken. Not all vendors supply a code which is why it is only optional


#### `deviceMuteStatusChanged`
Event emitted when a user presses the mute call button on their selected device. It doesn't matter if the device state is currently muted or unmuted,
this event will be emitted with the _OPPOSITE_ value. For example, if the headset is currently muted, it will emit the event with the corresponding
value to unmute the device. The event includes the event `name` as it is interpretted by the headset and a collection of items that may help with
logging (`event`). It also comes with a value known as `isMuted` which determines the event is trying to mute or unmute the call. It can also
potentially have a `code` that corresponds to the event.

Declaration:
``` ts
    sdk.headset.headsetEvents.subscribe(event: {
        event: 'deviceMuteStatusChanged',
        payload: {
            name: string,
            event: { `containing various items mostly for logging purposes` },
            isMuted: boolean,
            code?: string
        } => {
            if (event.event === 'deviceMuteStatusChanged') {
                sdk.setAudioMute(event.payload.isMuted);
            }
        }
    })
```
Value of event:
* `event: HeadsetEvents` - string value emitted by the headset library to determine what event had just occurred
* `payload:` - object containing
    * `name: string` - Name of the recent event as interpretted by the headset device
    * `event`: { containing various items mostly for logging purposes}
    * `isMuted: boolean` - the value determining if the event is to mute (`true`) or unmute (`false`) the device
    * `code?: string` - Optional: A string value of a number that represents the action that was just taken. Not all vendors supply a code which is why it is only optional


#### `deviceHoldStatusChanged`
Event emitted when a user presses the hold call button on their selected device. It doesn't matter if the device state is currently on hold or not,
this event will be emitted with the _OPPOSITE_ value. For example, if the headset is currently on hold, it will emit the event with the corresponding value to
resume the call. The event includes the event `name` as it is interpretted by the headset and a collection of items that may help with logging (`event`).
It also comes with a value known as `holdRequested` which determines the event is trying to hold or resume the call. It will also have an optional value for `toggle`.
It can also potentially have a `code` that corresponds to the event.

Declaration:
``` ts
    sdk.headset.headsetEvents.subscribe(event: {
        event: 'deviceHoldStatusChanged',
        payload: {
            name: string,
            event: { `containing various items mostly for logging purposes` },
            holdRequested: boolean,
            code?: string
        } => {
            if (event.event === 'deviceHoldStatusChanged') {
                sdk.setConversationHold(event.payload.holdRequested, event.payload.toggle);
            }
        }
    })
```
Value of event:
* `event: HeadsetEvents` - string value emitted by the headset library to determine what event had just occurred
* `payload:` - object containing
    * `name: string` - Name of the recent event as interpretted by the headset device
    * `event`: { containing various items mostly for logging purposes}
    * `holdRequested: boolean` - the value determining if the event is to hold (`true`) or resume (`false`) the call
    * `code?: string` - Optional: A string value of a number that represents the action that was just taken. Not all vendors supply a code which is why it is only optional


#### `webHidPermissionRequested`
This is a special event that is only necessary for specific devices. Certain devices (such as Jabra) support a technology known as
[WebHID](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API) that requires additional permissions in order to use the call controls.
This event is emitted when a WebHID enabled device is selected. The event includes a `callback` function that is required in order to
achieve additional permissions for WebHID

Declaration:
``` ts
    sdk.headset.headsetEvents.subscribe(event: {
        event: 'webHidPermissionRequested',
        payload: {
            callback: Function
        } => {
            if (event.event === 'webHidPermissionRequested') {
                event.payload.body.callback();
                /* Please note: The above example will not work as is. You can't trigger the WebHID callback by simply calling, it must be triggered through user interaction such as clicking a button */
            }
        }
    })
```
Value of event:
* `event: HeadsetEvents` - string value emitted by the headset library to determine what event had just occurred
* `payload:` - object containing
    * `callback: Function` - the passed in function that will help achieve additional permissions for WebHID devices

#### `deviceConnectionStatusChanged`
Event emitted when a device implementation's connection status changes in some way. This can be the flags of `isConnected` or `isConnecting` changing in any way.
These flags are also included with the events payload.

Declaration:
``` ts
    sdk.headset.headsetEvents.subscribe(event: {
        event: 'deviceConnectionStatusChanged',
        payload: {
            isConnected: boolean,
            isConnecting: boolean
        } => {
            if (event.event === 'deviceConnectionStatusChanged') {
                correspondingFunctionToHandleConnectionChange({event.payload.isConnected, event.payload.isConnecting});
            }
        }
    })
```
Value of event:
* `event: HeadsetEvents` - string value emitted by the headset library to determine what event had just occurred
* `payload:` - object containing
    * `isConnected: boolean` - if the vendor implementation is fully connected
    * `isConnecting: boolean` - if the vendor implementation is in the process of connecting
[Purpose of SdkHeadset]: #purpose-of-sdkheadset
[SdkHeadset]: #sdkheadset
[Example usage]: #example-usage
[Properties]: #properties
[Methods]: #methods
[Events]: #events
