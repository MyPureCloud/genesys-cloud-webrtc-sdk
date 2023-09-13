import { Observable, Subject } from "rxjs";
import { SdkHeadsetBase } from "./sdk-headset-base";
import { ExpandedConsumedHeadsetEvents } from "./headset-types";
import GenesysCloudWebrtcSdk from "../client";

export class SdkHeadsetServiceFake extends SdkHeadsetBase {
  _fakeObservable: Subject<ExpandedConsumedHeadsetEvents>;
  headsetEvents$: Observable<ExpandedConsumedHeadsetEvents>;

  constructor (sdk: GenesysCloudWebrtcSdk) {
    super(sdk);
    this._fakeObservable = new Subject();
    this.headsetEvents$ = this._fakeObservable.asObservable();
  }
}