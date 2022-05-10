(window["webpackJsonp"] = window["webpackJsonp"] || []).push([[0],{

/***/ "../../node_modules/@gnaudio/jabra-js/browser-esm/chrome-extension-transport-b7b99846.js":
/*!************************************************************************************************************************!*\
  !*** /Users/gjensen/genesys_src/sdk/node_modules/@gnaudio/jabra-js/browser-esm/chrome-extension-transport-b7b99846.js ***!
  \************************************************************************************************************************/
/*! exports provided: TransportChromeExtension */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "TransportChromeExtension", function() { return i; });
/* harmony import */ var _index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./index-923cf570.js */ "../../node_modules/@gnaudio/jabra-js/browser-esm/index-923cf570.js");
class i{constructor(n,s){this.logger=n,this.recorder=s,this.events=new _index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["S"],this.consoleAppEvent=this.events,this.connectHasBeenCalled=!1,this.context=_index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["T"].CHROME_EXTENSION}connect(){return this.connectHasBeenCalled?Promise.reject(new _index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["J"]("Already connected",_index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["E"].UNEXPECTED_ERROR)):(this.connectHasBeenCalled=!0,window.addEventListener("message-from-jabra-chrome-extension",(e=>{var t;let n=e.detail;this.recorder&&(n=null===(t=this.recorder)||void 0===t?void 0:t.recordInput(n)),this.events.next(n)})),this.writeAction({event:"ping"}),Promise.resolve())}static checkInstallation(){return Object(_index_923cf570_js__WEBPACK_IMPORTED_MODULE_0__["_"])(this,void 0,void 0,(function*(){return new Promise((e=>{const t=new CustomEvent("message-to-jabra-chrome-extension",{detail:"check-console-app-installation"});window.dispatchEvent(t),window.addEventListener("installation-status-from-jabra-chrome-extension",(t=>{e({ok:t.detail,message:t.detail?"Installation ok":"The Jabra Chromehost is not installed"})})),setTimeout((()=>{e({ok:!1,message:"The Jabra Chrome Extension is not installed"})}),3e3)}))}))}writeAction(e){var t;null===(t=this.recorder)||void 0===t||t.recordOutput(e),window.dispatchEvent(new CustomEvent("message-to-jabra-chrome-extension",{detail:e}))}}


/***/ })

}]);
//# sourceMappingURL=0.sdk-sample.js.map