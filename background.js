// Mo UI: uu tien side panel; neu trinh duyet khong ho tro (vd Arc) -> mo cua so noi
let uiWinId = null;
async function openInWindow() {
  if (uiWinId !== null) {
    try { await chrome.windows.get(uiWinId); await chrome.windows.update(uiWinId, { focused: true }); return; }
    catch (e) { uiWinId = null; }
  }
  const w = await chrome.windows.create({
    url: chrome.runtime.getURL("sidepanel.html"),
    type: "popup", width: 440, height: 760,
  });
  uiWinId = w.id;
}
chrome.action.onClicked.addListener(async (tab) => {
  // Thu mo side panel truoc
  if (chrome.sidePanel && chrome.sidePanel.open) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch (e) { /* khong dung duoc -> fallback */ }
  }
  openInWindow();
});
// Neu co side panel, cho phep mo bang cach bam icon (Chrome/Edge)
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

// Tiem content.js vao cac tab http/https dang mo (xu ly tab mo truoc khi cai/reload)
function injectAll() {
  if (!chrome.scripting || !chrome.tabs) return;
  chrome.tabs.query({}, function (tabs) {
    (tabs || []).forEach(function (tab) {
      if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) return;
      chrome.scripting.executeScript(
        { target: { tabId: tab.id, allFrames: true }, files: ["content.js"] },
        function () { void chrome.runtime.lastError; }
      );
    });
  });
}
chrome.runtime.onInstalled.addListener(injectAll);
chrome.runtime.onStartup.addListener(injectAll);
