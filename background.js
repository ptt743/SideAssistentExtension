chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(function (e) { console.error(e); });

// Tiem content.js vao moi tab http/https dang mo (xu ly tab mo truoc khi cai/reload)
function injectAll() {
  if (!chrome.scripting || !chrome.tabs) return;
  chrome.tabs.query({}, function (tabs) {
    (tabs || []).forEach(function (tab) {
      if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) return;
      chrome.scripting.executeScript(
        { target: { tabId: tab.id, allFrames: true }, files: ["content.js"] },
        function () { void chrome.runtime.lastError; } // bo qua tab bi han che
      );
    });
  });
}
chrome.runtime.onInstalled.addListener(injectAll);
chrome.runtime.onStartup.addListener(injectAll);
