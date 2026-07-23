// Bat text boi den tren trang -> gui sang side panel (chip dinh kem).
// Dung ca chrome.storage lan runtime message; khu trung bang ts.
(function () {
  if (window.__EVCHAT_SEL__) return;   // tranh gan listener 2 lan (khi bi tiem lai)
  window.__EVCHAT_SEL__ = true;

  var lastText = "", lastAt = 0;

  function alive() {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }
  function getSel() {
    var ae = document.activeElement;
    // selection trong input/textarea (getSelection khong bat duoc)
    if (ae && (ae.tagName === "TEXTAREA" ||
        (ae.tagName === "INPUT" && /^(text|search|url|email|tel|)$/i.test(ae.type || "")))) {
      try {
        var v = ae.value.substring(ae.selectionStart, ae.selectionEnd);
        if (v && v.trim()) return v.trim();
      } catch (e) {}
    }
    var sel = window.getSelection ? window.getSelection().toString() : "";
    return (sel || "").trim();
  }
  function push() {
    var text = getSel();
    if (!text) return;
    var now = Date.now();
    if (text === lastText && now - lastAt < 500) return; // chi chan double-fire tuc thoi
    lastText = text; lastAt = now;
    if (!alive()) return;
    var payload = { type: "selection", text: text, url: location.href, title: document.title, ts: now };
    try { chrome.storage.local.set({ selEvent: payload }); } catch (e) {}
    try { var p = chrome.runtime.sendMessage(payload); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  var t;
  function schedule(d) { clearTimeout(t); t = setTimeout(push, d); }

  document.addEventListener("mouseup",  function () { schedule(60); }, true);
  document.addEventListener("pointerup",function () { schedule(60); }, true);
  document.addEventListener("dblclick", function () { schedule(0); },  true);
  document.addEventListener("keyup", function (e) {
    if (e.shiftKey || e.key === "Shift" || (e.key && e.key.indexOf("Arrow") === 0)) schedule(60);
  }, true);
  document.addEventListener("selectionchange", function () {
    var s = getSel();
    if (!s) { lastText = ""; return; }  // bo chon -> cho phep chon lai chinh no
    schedule(250);
  });
})();
