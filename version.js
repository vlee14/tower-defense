/* Emberwell — bump APP_VERSION on every deploy.
 * Keep index.html ?v= query params equal to this value.
 * Service worker imports this file for cache naming.
 */
var APP_VERSION = "1.8.3";
var APP_NAME = "Emberwell";
if (typeof self !== "undefined") {
  self.APP_VERSION = APP_VERSION;
  self.APP_NAME = APP_NAME;
}
