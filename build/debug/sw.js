/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
/*!*******************************!*\
  !*** ./src/service-worker.ts ***!
  \*******************************/
__webpack_require__.r(__webpack_exports__);
/// <reference lib="webworker" />
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
//On app update, besides switching cache bucket, we need to force browser to get the latest versions
//from the network by also changing the query string of every resource
//Otherwise our new cache bucket might get populated with old files from the browser cache (or
//any intermediary network caches)
const myCache = {
    'app-v16': [
        '/?v=16',
        '/index.html?v=16',
        '/bundle.js?v=16',
        '/inference-worker.js?v=16',
    ],
    'bootstrap-v1': [
        '/bootstrap.min.css?v=1',
    ],
    'piper-phonemize-v1': [
        '/piper_phonemize.js?v=1',
        '/piper_phonemize.wasm?v=1',
        '/piper_phonemize.data?v=1',
    ],
    'ort-1.17.3': [
        'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort-wasm-simd-threaded.wasm',
    ]
};
self.addEventListener('install', (event) => event.waitUntil(populateCache()));
self.addEventListener('activate', (event) => event.waitUntil(removeOldCaches()));
self.addEventListener('fetch', (event) => event.respondWith(handleFetch(event.request)));
function populateCache() {
    return __awaiter(this, void 0, void 0, function* () {
        for (const key in myCache) {
            if (!(yield caches.has(key))) {
                const cache = yield caches.open(key);
                yield cache.addAll(myCache[key]);
            }
        }
    });
}
function removeOldCaches() {
    return __awaiter(this, void 0, void 0, function* () {
        for (const key of yield caches.keys()) {
            if (!(key in myCache))
                yield caches.delete(key);
        }
    });
}
function handleFetch(request) {
    return __awaiter(this, void 0, void 0, function* () {
        return (yield caches.match(request, { ignoreSearch: true })) || fetch(request);
    });
}


/******/ })()
;
//# sourceMappingURL=sw.js.map