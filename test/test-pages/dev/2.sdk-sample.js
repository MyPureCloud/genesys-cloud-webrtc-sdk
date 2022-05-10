(window["webpackJsonp"] = window["webpackJsonp"] || []).push([[2],{

/***/ "../../node_modules/@gnaudio/jabra-js/browser-esm/web-hid-transport-58a9d844.js":
/*!***************************************************************************************************************!*\
  !*** /Users/gjensen/genesys_src/sdk/node_modules/@gnaudio/jabra-js/browser-esm/web-hid-transport-58a9d844.js ***!
  \***************************************************************************************************************/
/*! exports provided: WebHidTransport */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "WebHidTransport", function() { return o; });
/* harmony import */ var _index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./index-923cf570.js */ "../../node_modules/@gnaudio/jabra-js/browser-esm/index-923cf570.js");
class o{constructor(s,i,r){this.webHidHandler=s,this.logger=i,this.recorder=r,this.events=new _index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["S"],this.consoleAppEvent=this.events,this.webHidConnected=!1,this.context=_index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["T"].WEB_HID}connect(){return this.webHidConnected?Promise.reject(new _index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["J"]("Already connected",_index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["E"].UNEXPECTED_ERROR)):(this.webHidHandler.events.subscribe((e=>{var t;let s=e;this.recorder&&(s=null===(t=this.recorder)||void 0===t?void 0:t.recordInput(s)),this.events.next(s)})),this.webHidHandler.start(),this.webHidConnected=!0,Promise.resolve())}writeAction(e){var t;if(!this.webHidConnected){const e="WebHID is uninitialized.";throw Object(_index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["l"])(e,this.logger,_index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["L"].ERROR),new _index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["J"](e,_index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["E"].INIT_ERROR)}null===(t=this.recorder)||void 0===t||t.recordOutput(e),this.webHidHandler.sendMessage(e)}}


/***/ })

}]);
//# sourceMappingURL=2.sdk-sample.js.map