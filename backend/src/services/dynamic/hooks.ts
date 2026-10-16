/**
 * Injected into every page before any page script runs.
 * Reports camera/mic, geolocation, clipboard, USB, BLE, HID, serial,
 * notification, dialog, and keyboard listener use — along with whether
 * a real user gesture preceded each call.
 */
export const HOOK_SCRIPT = String.raw`(() => {
  if (window.__pgInstalled) return; window.__pgInstalled = true;
  const report = (api, detail) => {
    try {
      const gesture = !!(navigator.userActivation && navigator.userActivation.isActive);
      const stack = (new Error().stack || '').split('\n').slice(2, 5).join(' | ');
      window.__pgReport(JSON.stringify({ api, t: Date.now(), gesture, stack, detail: detail || {} }));
    } catch (e) {}
  };
  const wrap = (obj, name, api, pick) => {
    try {
      if (!obj || typeof obj[name] !== 'function') return;
      const orig = obj[name];
      obj[name] = function (...args) { report(api, pick ? pick(args) : {}); return orig.apply(this, args); };
    } catch (e) {}
  };
  wrap(navigator.mediaDevices, 'getUserMedia', 'getUserMedia', a => ({ c: JSON.stringify(a[0] || {}).slice(0, 200) }));
  wrap(navigator.geolocation, 'getCurrentPosition', 'geolocation');
  wrap(navigator.geolocation, 'watchPosition', 'geolocation');
  wrap(window.Notification, 'requestPermission', 'notification');
  wrap(navigator.clipboard, 'writeText', 'clipboard.writeText', a => ({ text: String(a[0]).slice(0, 500) }));
  wrap(navigator.clipboard, 'write', 'clipboard.write');
  wrap(navigator.clipboard, 'readText', 'clipboard.readText');
  wrap(navigator.usb, 'requestDevice', 'usb.requestDevice');
  wrap(navigator.bluetooth, 'requestDevice', 'bluetooth.requestDevice');
  wrap(navigator.hid, 'requestDevice', 'hid.requestDevice');
  wrap(navigator.serial, 'requestPort', 'serial.requestPort');
  wrap(document, 'execCommand', 'execCommand.any', a => ({
    cmd: String(a[0]),
    text: String(a[0]) === 'copy' ? String(document.getSelection() || '').slice(0, 500) : ''
  }));
  try {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get() { report('webdriver.probe'); return false; }, configurable: true });
  } catch (e) {}
  const watched = ['contextmenu', 'keydown', 'keyup', 'keypress', 'input', 'copy', 'paste'];
  const seen = new Set();
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    try {
      const global = this === window || this === document || this === document.body;
      const key = type + (global ? ':g' : ':e');
      if (watched.includes(type) && global && !seen.has(key)) {
        seen.add(key);
        report('listener', { type, global, src: String(fn).slice(0, 300) });
      }
    } catch (e) {}
    return origAdd.call(this, type, fn, opts);
  };
})();`;
