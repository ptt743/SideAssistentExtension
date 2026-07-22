// Chay tren moi trang (moi frame). Khi boi den text -> ghi vao chrome.storage,
// side panel lang nghe storage.onChanged de tao chip. Dung storage cho on dinh
// (khong bi truot nhu runtime.sendMessage).
let lastSent = "";
let lastAt = 0;

function alive() {
  try { return !!(chrome && chrome.runtime && chrome.runtime.id); }
  catch (e) { return false; }
}
function currentSelection() {
  const s = window.getSelection ? window.getSelection().toString() : "";
  return (s || "").trim();
}
function push() {
  const text = currentSelection();
  if (!text) return;
  const now = Date.now();
  if (text === lastSent && now - lastAt < 1200) return; // chong spam ngan han
  if (!alive()) return; // extension vua reload -> context cu vo hieu
  lastSent = text;
  lastAt = now;
  try {
    chrome.storage.local.set({
      selEvent: { text: text, url: location.href, title: document.title, ts: now },
    });
  } catch (e) { /* context invalidated */ }
}

let timer;
function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(push, delay);
}
document.addEventListener("mouseup", () => schedule(100));
document.addEventListener("keyup", (e) => {
  if (e.shiftKey || e.key === "Shift" || (e.key && e.key.startsWith("Arrow"))) schedule(100);
});
document.addEventListener("selectionchange", () => {
  const s = currentSelection();
  if (!s) { lastSent = ""; return; } // bo chon -> reset de lan sau gui lai duoc
  schedule(300);
});
