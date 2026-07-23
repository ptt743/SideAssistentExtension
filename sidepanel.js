const messagesEl = document.getElementById("messages");
const input = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const attachmentsEl = document.getElementById("attachments");
const addPageBtn = document.getElementById("addPageBtn");

let messages = [];
let attachments = []; // {type:'link'|'text', title, subtitle, url?, text?, favicon?}

const hasStorage =
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

function save() {
  if (hasStorage) chrome.storage.local.set({ appleChat: messages });
}
function load(cb) {
  if (hasStorage) {
    chrome.storage.local.get("appleChat", (d) => {
      messages = d.appleChat || seed();
      cb();
    });
  } else {
    messages = seed();
    cb();
  }
}
function seed() {
  const now = Date.now();
  return [
    { side: "received", text: "Chao ban 👋", t: now - 120000 },
    { side: "received", text: "Boi den (chon) mot doan text tren trang web -> no tu them vao day. Bam nut 🌐 de dinh kem trang hien tai. Hoac dan (Ctrl/Cmd+V) mot dong chu / link.", t: now - 115000 },
  ];
}

/* =================== DINH KEM =================== */
function isURL(s) {
  s = s.trim();
  if (/\s/.test(s)) return false;
  return /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(s);
}
function hostOf(url) {
  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Them chip (co chong trung)
function pushAttachment(obj) {
  const dup = attachments.some(
    (a) =>
      (obj.type === "link" && a.type === "link" && a.url === obj.url) ||
      (obj.type === "text" && a.type === "text" && a.text === obj.text) ||
      (obj.type === "page" && a.type === "page" && a.url === obj.url)
  );
  if (dup) return;
  attachments.push(obj);
  renderAttachments();
  updateSend();
}

// Dan (paste) text hoac link
function addAttachment(raw) {
  const text = raw.trim();
  if (!text) return;
  if (isURL(text)) {
    const url = text.startsWith("http") ? text : "https://" + text;
    pushAttachment({
      type: "link",
      url,
      title: hostOf(url),
      subtitle: url.replace(/^https?:\/\//, ""),
    });
  } else {
    pushAttachment({
      type: "text",
      text,
      title: text.replace(/\s+/g, " "),
      subtitle: "Noi dung da sao chep",
    });
  }
}

// Text boi den tren trang web (tu content script gui sang)
function addSelectedText(text, srcUrl) {
  const t = (text || "").trim();
  if (!t) return;
  pushAttachment({
    type: "text",
    text: t,
    title: t.replace(/\s+/g, " "),
    subtitle: srcUrl ? "Da chon tu " + hostOf(srcUrl) : "Noi dung da chon",
  });
}

// Ham chay TRONG trang de trich noi dung van ban chinh
function __extractPageContent() {
  try {
    var pick = document.querySelector("article") || document.querySelector("main") || document.body;
    var clone = pick.cloneNode(true);
    clone.querySelectorAll(
      'script,style,noscript,svg,canvas,iframe,nav,header,footer,aside,form,button,[aria-hidden="true"]'
    ).forEach(function (n) { n.remove(); });
    var text = (clone.innerText || clone.textContent || "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { title: document.title || location.hostname, url: location.href, text: text };
  } catch (e) {
    return { title: document.title || "", url: location.href, text: (document.body ? document.body.innerText : "") || "" };
  }
}

// Nut 🌐: crawl toan bo noi dung trang hien tai -> chip "noi dung trang"
function addCurrentTab() {
  if (!(typeof chrome !== "undefined" && chrome.tabs && chrome.scripting)) return;
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id || !tab.url) return;
    if (!/^https?:/.test(tab.url)) {
      addMessage("received", "Không lấy được nội dung trang hệ thống này. Hãy mở một trang web thường rồi thử lại.", []);
      return;
    }
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, func: __extractPageContent },
      (results) => {
        if (chrome.runtime.lastError || !results || !results[0]) {
          addMessage("received", "Không crawl được nội dung trang (trang có thể chặn script).", []);
          return;
        }
        const r = results[0].result || {};
        let text = (r.text || "").trim();
        if (!text) {
          addMessage("received", "Trang không có nội dung văn bản để lấy.", []);
          return;
        }
        const MAX = 20000;
        const truncated = text.length > MAX;
        if (truncated) text = text.slice(0, MAX);
        const host = hostOf(r.url || tab.url);
        const words = text.split(/\s+/).filter(Boolean).length;
        pushAttachment({
          type: "page",
          url: r.url || tab.url,
          title: r.title || tab.title || host,
          subtitle: host + " · " + words + " từ" + (truncated ? " (đã cắt)" : ""),
          text: text,
          favicon: tab.favIconUrl || null,
        });
      }
    );
  });
}

function removeAttachment(i) {
  attachments.splice(i, 1);
  renderAttachments();
  updateSend();
}

function faviconTag(a) {
  const src =
    a.favicon ||
    "https://www.google.com/s2/favicons?domain=" +
      encodeURIComponent(hostOf(a.url)) +
      "&sz=64";
  return `<img class="chip-fav" src="${escapeHTML(src)}" alt="">`;
}
function quoteSVG() {
  return `<svg class="chip-glyph" viewBox="0 0 24 24"><path d="M7 7h5v5c0 2.9-1.7 4.8-4.3 5.5l-.5-1.6C8.9 15.4 10 14.3 10 12.6V12H7zm8 0h5v5c0 2.9-1.7 4.8-4.3 5.5l-.5-1.6c1.2-.5 2.3-1.6 2.3-3.3V12h-2.5z"/></svg>`;
}
function globeSVG() {
  return `<svg class="chip-glyph" viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 6h-2.5a12 12 0 00-1-3.2A8 8 0 0118.9 8zM12 4c.9 0 1.9 1.4 2.4 4h-4.8C10.1 5.4 11.1 4 12 4zM4.6 14a8 8 0 010-4h2.7a17 17 0 000 4zm.5 2h2.5c.3 1.2.6 2.3 1 3.2A8 8 0 015.1 16zm2.5-8H5.1a8 8 0 012.5-3.2c-.4.9-.7 2-.9 3.2zM12 20c-.9 0-1.9-1.4-2.4-4h4.8c-.5 2.6-1.5 4-2.4 4zm-2.7-6a15 15 0 010-4h5.4a15 15 0 010 4zm7.3 5.2c.4-.9.7-2 1-3.2h2.5a8 8 0 01-3.5 3.2zM16.7 14a17 17 0 000-4h2.7a8 8 0 010 4z"/></svg>`;
}
function renderAttachments() {
  attachmentsEl.innerHTML = attachments
    .map((a, i) => {
      const icon = (a.type === "link" || a.type === "page") ? faviconTag(a) : quoteSVG();
      return `<div class="chip">
        <div class="chip-icon">${icon}</div>
        <div class="chip-text">
          <div class="chip-title">${escapeHTML(a.title)}</div>
          <div class="chip-sub">${escapeHTML(a.subtitle)}</div>
        </div>
        <button class="chip-close" data-i="${i}" title="Xoa">&times;</button>
      </div>`;
    })
    .join("");

  attachmentsEl.querySelectorAll(".chip-close").forEach((btn) =>
    btn.addEventListener("click", () => removeAttachment(+btn.dataset.i))
  );
  attachmentsEl.querySelectorAll("img.chip-fav").forEach((img) =>
    img.addEventListener("error", () => {
      const box = img.parentElement;
      if (box) box.innerHTML = globeSVG();
    })
  );
  updateSuggestions();
}

/* =================== TIN NHAN =================== */
function render() {
  messagesEl.innerHTML = "";
  const sep = document.createElement("div");
  sep.className = "time-sep";
  sep.innerHTML = `<b>Hom nay</b> ${fmtTime(messages[0]?.t || Date.now())}`;
  messagesEl.appendChild(sep);

  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const first = !prev || prev.side !== m.side;
    const tail = !next || next.side !== m.side;
    messagesEl.appendChild(makeBubble(m, first, tail));
  });

  const last = messages[messages.length - 1];
  if (last && last.side === "sent") {
    const d = document.createElement("div");
    d.className = "delivered";
    d.textContent = "Da gui";
    messagesEl.appendChild(d);
  }
  scrollBottom();
  attachCodeCopy();
}

/* ---- Render giau: link bam duoc + khoi code copy duoc ---- */
function renderRich(text) {
  let out = "";
  const re = /```(\w*)\r?\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    out += renderInline(text.slice(last, m.index));
    out += codeBlockHTML(m[1] || "", m[2].replace(/\n$/, ""));
    last = re.lastIndex;
  }
  out += renderInline(text.slice(last));
  return out;
}
function renderInline(s) {
  return escapeHTML(s).replace(
    /(https?:\/\/[^\s<]+)/g,
    (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`
  );
}
function codeBlockHTML(lang, code) {
  const label = lang ? escapeHTML(lang) : "code";
  return (
    '<div class="code-block"><div class="code-head"><span class="code-lang">' +
    label +
    '</span><button class="code-copy" type="button">Copy</button></div><pre><code>' +
    escapeHTML(code) +
    "</code></pre></div>"
  );
}
function attachCodeCopy() {
  messagesEl.querySelectorAll(".code-copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const codeEl = btn.closest(".code-block").querySelector("code");
      const txt = codeEl ? codeEl.textContent : "";
      navigator.clipboard.writeText(txt).then(
        () => {
          btn.textContent = "Đã copy";
          setTimeout(() => (btn.textContent = "Copy"), 1200);
        },
        () => {
          btn.textContent = "Lỗi";
          setTimeout(() => (btn.textContent = "Copy"), 1200);
        }
      );
    });
  });
}

const STAR_AV =
  '<div class="star-av"><svg viewBox="0 0 24 24"><path d="M12 2l2.7 6.5L21.5 9l-5 4.4 1.6 6.6L12 16.6 5.9 20l1.6-6.6-5-4.4 6.8-.5z"/></svg></div>';

function makeBubble(m, first, tail) {
  const el = document.createElement("div");
  el.className =
    "bubble " + m.side + (m.side === "sent" && first ? " first" : "") + (tail ? " tail" : "");
  let html = "";
  if (m.kind === "def" && m.def) {
    el.classList.add("bubble-def");
    html = definitionCardHTML(m.def);
  } else {
    if (m.atts && m.atts.length) {
      html +=
        '<div class="msg-atts">' +
        m.atts
          .map((a) => {
            const icon = (a.type === "link" || a.type === "page") ? faviconTag(a) : quoteSVG();
            return `<div class="msg-att"><span class="chip-icon">${icon}</span><span class="msg-att-title">${escapeHTML(
              a.title
            )}</span></div>`;
          })
          .join("") +
        "</div>";
    }
    if (m.text) html += `<div class="msg-text">${renderRich(m.text)}</div>`;
  }
  el.innerHTML = html;

  if (m.side !== "received") return el;

  // Tin cua AI: kem avatar ngoi sao (chi hien o bong bong cuoi cua cum)
  const row = document.createElement("div");
  row.className = "msg-row" + (first ? " first" : "");
  const slot = document.createElement("div");
  slot.className = "avatar-slot";
  if (tail) slot.innerHTML = STAR_AV;
  row.appendChild(slot);
  row.appendChild(el);
  return row;
}

function addMessage(side, text, atts) {
  messages.push({ side, text, t: Date.now(), atts: atts || [] });
  save();
  render();
}

/* =================== GOI MODEL (GEMINI) =================== */
let lastInteractionId = null; // de noi chuyen nhieu luot (server giu lich su)

// Gop text + dinh kem thanh input gui cho model
function buildPrompt(text, atts) {
  const parts = [];
  (atts || []).forEach((a) => {
    if (a.type === "link") parts.push("[Link] " + a.url);
    else if (a.type === "page")
      parts.push("[Nội dung trang: " + (a.title || a.url) + " — " + a.url + "]\n" + (a.text || ""));
    else parts.push("[Trích dẫn] " + a.text);
  });
  if (text) parts.push(text);
  return parts.join("\n\n") || text || "";
}

// Tach text tu response cua Interactions API: steps[-1].content[].text
function extractText(data) {
  if (data && typeof data.output_text === "string" && data.output_text.trim())
    return data.output_text;
  const steps = data && data.steps;
  if (Array.isArray(steps)) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const c = steps[i] && steps[i].content;
      if (Array.isArray(c)) {
        const txt = c
          .filter((p) => p && (p.type === "text" || typeof p.text === "string"))
          .map((p) => p.text || "")
          .join("");
        if (txt.trim()) return txt;
      }
    }
  }
  return "";
}

// Goi Interactions API (khong streaming - cau truc tra ve on dinh, de parse dung)
async function doCall(promptText, allowRetry) {
  const { model, apiKey } = getModelConfig();
  const body = {
    model: model,
    input: promptText,
    tools: [{ type: "google_search" }],
    generation_config: { thinking_level: "low", max_output_tokens: 8192 },
  };
  // Noi hoi thoai nhieu luot (chi khi co id hop le tu luot truoc)
  if (lastInteractionId) body.previous_interaction_id = lastInteractionId;

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    }
  );

  const raw = await res.text();
  let data = null;
  try { data = JSON.parse(raw); } catch {}

  if (!res.ok) {
    // id hoi thoai cu bi hong (404) -> bo di va thu lai 1 lan, khong kem lich su
    if (res.status === 404 && lastInteractionId && allowRetry) {
      lastInteractionId = null;
      return await doCall(promptText, false);
    }
    const msg =
      (data && data.error && (data.error.message || data.error.status)) ||
      raw.slice(0, 200) ||
      res.statusText;
    throw new Error("HTTP " + res.status + " — " + msg);
  }

  // Luu id de noi luot sau (dung .name nhu tai lieu Google)
  if (data && data.name) lastInteractionId = data.name;
  return extractText(data);
}

function callGemini(promptText) {
  return doCall(promptText, true);
}

// Cac tin la thong bao he thong (khong gui vao lich su model)
function isNotice(m) {
  if (m.side !== "received") return false;
  const t = (m.text || "").trim();
  return (
    t.startsWith("⚠️") || t.startsWith("(") || /API key/i.test(t) ||
    t.startsWith("Chao ban") || t.startsWith("Boi den") ||
    t.startsWith("Hien tai chi noi API") || t.startsWith("Model nay chua")
  );
}

// Dung lich su hoi thoai theo dinh dang OpenAI messages cho DeepSeek
function buildDeepSeekMessages(currentPrompt) {
  const hist = messages
    .slice(0, -1) // bo tin user vua them (thay bang currentPrompt da gom dinh kem)
    .filter((m) => m.text && !isNotice(m))
    .slice(-18)
    .map((m) => ({ role: m.side === "sent" ? "user" : "assistant", content: m.text }));
  hist.push({ role: "user", content: currentPrompt });
  return hist;
}

// Goi DeepSeek qua endpoint tuong thich OpenAI
async function callDeepSeek(promptText) {
  const { model, apiKey } = getModelConfig();
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: model,
      messages: buildDeepSeekMessages(promptText),
      stream: false,
      max_tokens: 4096,
    }),
  });
  const raw = await res.text();
  let data = null;
  try { data = JSON.parse(raw); } catch {}
  if (!res.ok) {
    const msg =
      (data && data.error && (data.error.message || data.error.type)) ||
      raw.slice(0, 200) || res.statusText;
    throw new Error("HTTP " + res.status + " — " + msg);
  }
  const choice = data && data.choices && data.choices[0];
  return (choice && choice.message && choice.message.content) || "";
}

// Quyet dinh tra loi theo nha cung cap cua model dang chon
async function respond(userText, atts) {
  const { model, apiKey } = getModelConfig();
  const prompt = buildPrompt(userText, atts);
  const isGemini = /^gemini/i.test(model);
  const isDeepSeek = /^deepseek/i.test(model);

  if (!isGemini && !isDeepSeek) {
    addMessage("received", "Model nay chua duoc noi API. Bam nut ☀️ chon Gemini hoac DeepSeek nhe.", []);
    return;
  }
  if (!apiKey) {
    addMessage("received", "Chua co API key cho model nay. Bam nut ☀️ o goc phai roi dan API key vao o ben duoi.", []);
    return;
  }

  showTyping();
  try {
    const full = isDeepSeek ? await callDeepSeek(prompt) : await callGemini(prompt);
    hideTyping();
    addMessage("received", full || "(model khong tra ve noi dung — thu doi model o nut ☀️)", []);
  } catch (err) {
    hideTyping();
    addMessage("received", friendlyError(err), []);
  }
}

// Dich loi API sang thong bao de hieu + huong xu ly
function friendlyError(err) {
  const m = err && err.message ? err.message : String(err);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m))
    return "⚠️ Không gọi được API (lỗi mạng hoặc CORS). Vào chrome://extensions bấm Reload ⟳ trên extension rồi thử lại; kiểm tra kết nối mạng.";
  if (/\b401\b|Authentication|invalid.*key|Unauthorized/i.test(m))
    return "⚠️ API key không hợp lệ (401). Mở nút ☀️, chọn đúng nhà cung cấp và dán lại key.";
  if (/\b402\b|Insufficient|balance/i.test(m))
    return "⚠️ Tài khoản DeepSeek hết số dư (402). API DeepSeek tính phí — nạp tiền tại platform.deepseek.com. (Chat web miễn phí nhưng API thì không.)";
  if (/\b400\b|Model.*Exist|\b404\b|not found/i.test(m))
    return "⚠️ Model không hợp lệ hoặc yêu cầu sai (" + m + "). Thử chọn model khác ở nút ☀️.";
  if (/\b429\b|rate limit/i.test(m))
    return "⚠️ Bị giới hạn tần suất (429). Chờ một lát rồi thử lại.";
  return "⚠️ Lỗi gọi API: " + m;
}
function showTyping() {
  hideTyping();
  const row = document.createElement("div");
  row.className = "msg-row";
  row.id = "typing";
  row.innerHTML =
    '<div class="avatar-slot">' +
    STAR_AV.replace('class="star-av"', 'class="star-av spin"') +
    '</div><div class="typing-bubble"><span></span><span></span><span></span></div>';
  messagesEl.appendChild(row);
  scrollBottom();
}
function hideTyping() {
  const el = document.getElementById("typing");
  if (el) el.remove();
}

/* =================== GUI =================== */
function send() {
  const text = input.value.trim();
  if (!text && attachments.length === 0) return;
  const atts = attachments.slice();
  addMessage("sent", text, atts);
  attachments = [];
  renderAttachments();
  input.value = "";
  autoGrow();
  updateSend();
  updateSuggestions();
  respond(text, atts);
}

let _scrollT = null;
function scrollBottomSoon() {
  if (_scrollT) return;
  _scrollT = setTimeout(() => {
    _scrollT = null;
    scrollBottom();
  }, 80);
}

/* =================== TIEN ICH =================== */
function fmtTime(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ap = h >= 12 ? "CH" : "SA";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function autoGrow() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 110) + "px";
}
function updateSend() {
  sendBtn.disabled = input.value.trim().length === 0 && attachments.length === 0;
}

/* =================== GOI Y =================== */
const suggestionsEl = document.getElementById("suggestions");
const sgDefBtn = document.getElementById("sgDef");

// Text hien tai co phai 1 tu tieng Anh khong?
function currentSingleWord() {
  const t = input.value.trim();
  if (t) return /^[A-Za-z][A-Za-z'-]*$/.test(t) ? t : null;
  if (attachments.length === 1 && attachments[0].type === "text") {
    const a = attachments[0].text.trim();
    if (/^[A-Za-z][A-Za-z'-]*$/.test(a)) return a;
  }
  return null;
}
function updateSuggestions() {
  const has = input.value.trim().length > 0 || attachments.length > 0;
  suggestionsEl.classList.toggle("show", has);
  sgDefBtn.style.display = currentSingleWord() ? "" : "none";
}
function sendSuggestion(instr) {
  const extra = input.value.trim();
  const text = extra ? instr + "\n\n" + extra : instr;
  const atts = attachments.slice();
  addMessage("sent", text, atts);
  attachments = [];
  renderAttachments();
  input.value = "";
  autoGrow();
  updateSend();
  updateSuggestions();
  respond(text, atts);
}
// Chi noi cac goi y model (co data-instr); nut Dinh nghia xu ly rieng (local)
suggestionsEl.querySelectorAll(".sg-btn[data-instr]").forEach((b) =>
  b.addEventListener("click", () => sendSuggestion(b.dataset.instr))
);

/* =================== TU DIEN OFFLINE (local) =================== */
const dictCache = {};
async function loadLetter(letter) {
  if (dictCache[letter]) return dictCache[letter];
  const path = "dict/" + letter + ".json";
  const url =
    (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL(path)
      : path;
  try {
    const res = await fetch(url);
    dictCache[letter] = await res.json();
  } catch (e) {
    dictCache[letter] = {};
  }
  return dictCache[letter];
}
async function lookupWord(word) {
  const w = word.toLowerCase().trim();
  const letter = /^[a-z]/.test(w) ? w[0] : "misc";
  const data = await loadLetter(letter);
  return data[w] || null;
}
const VI_POS = new Set([
  "danh từ", "động từ", "ngoại động từ", "nội động từ", "tính từ", "phó từ",
  "trạng từ", "giới từ", "đại từ", "liên từ", "thán từ", "mạo từ", "số từ", "viết tắt",
]);
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
function posClass(p) {
  p = (p || "").toLowerCase();
  if (p.includes("noun")) return "noun";
  if (p.includes("verb")) return "verb";
  if (p.includes("adjective")) return "adj";
  if (p.includes("adverb")) return "adv";
  return "other";
}
function definitionCardHTML(e) {
  let h = '<div class="defcard">';
  h += '<div class="def-head"><span class="def-word">' + escapeHTML(e.w) + "</span>";
  if (e.ipa) h += '<span class="def-ipa">' + escapeHTML(e.ipa) + "</span>";
  h += "</div>";
  if (e.en && e.en.length) {
    h += '<div class="def-sec"><div class="def-lang def-lang-en">English</div>';
    e.en.forEach((m) => {
      h += '<div class="def-item">';
      if (m.p) h += '<span class="pos pos-' + posClass(m.p) + '">' + escapeHTML(m.p) + "</span>";
      h += '<span class="def-mean">' + escapeHTML(m.d) + "</span>";
      if (m.e) h += '<div class="def-ex">' + escapeHTML(m.e) + "</div>";
      h += "</div>";
    });
    h += "</div>";
  }
  if (e.vi && e.vi.length) {
    h += '<div class="def-sec"><div class="def-lang def-lang-vi">Tiếng Việt</div>';
    e.vi.forEach((line) => {
      const t = (line || "").trim();
      if (!t) return;
      if (VI_POS.has(t.toLowerCase())) h += '<div class="pos-vi">' + escapeHTML(t) + "</div>";
      else if (!VI_CHARS.test(t)) h += '<div class="def-ex">' + escapeHTML(t) + "</div>";
      else h += '<div class="def-vi-item">' + escapeHTML(t) + "</div>";
    });
    h += "</div>";
  }
  h += "</div>";
  return h;
}
// Tra tu ngay tren may, KHONG goi server
async function defineWordLocal(word) {
  const atts = attachments.slice();
  addMessage("sent", word, atts);
  attachments = [];
  renderAttachments();
  input.value = "";
  autoGrow();
  updateSend();
  updateSuggestions();
  const entry = await lookupWord(word);
  if (entry) {
    messages.push({ side: "received", t: Date.now(), atts: [], kind: "def", def: entry });
    save();
    render();
  } else {
    addMessage("received", "Không tìm thấy “" + word + "” trong từ điển offline.", []);
  }
}
sgDefBtn.addEventListener("click", () => {
  const w = currentSingleWord();
  if (w) defineWordLocal(w);
});

/* =================== SU KIEN =================== */
sendBtn.addEventListener("click", send);
if (addPageBtn) addPageBtn.addEventListener("click", addCurrentTab);
input.addEventListener("input", () => {
  autoGrow();
  updateSend();
  updateSuggestions();
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
input.addEventListener("paste", (e) => {
  const t = (e.clipboardData || window.clipboardData).getData("text");
  if (!t) return;
  e.preventDefault();
  addAttachment(t);
});

// Nhan text boi den tu content script qua chrome.storage (on dinh hon messaging)
let lastSelTs = 0;
function handleSelEvent(ev) {
  if (!ev || !ev.text || !ev.ts) return;
  if (ev.ts <= lastSelTs) return; // da xu ly roi
  lastSelTs = ev.ts;
  addSelectedText(ev.text, ev.url);
}
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.selEvent && changes.selEvent.newValue) {
      handleSelEvent(changes.selEvent.newValue);
    }
  });
}
// Kenh thu 2: nhan truc tiep qua message (khu trung bang ts o handleSelEvent)
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "selection") handleSelEvent(msg);
  });
}

/* =================== KHOI TAO =================== */
load(() => {
  render();
  renderAttachments();
  updateSend();
});
// Bat ca truong hop boi den TRUOC khi mo panel: doc lua chon gan day (<8s)
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  lastSelTs = Date.now() - 8000;
  chrome.storage.local.get("selEvent", (d) => {
    if (d && d.selEvent) handleSelEvent(d.selEvent);
  });
}

/* =================== BANG CHON MODEL =================== */
// Danh sach model - sua/them tuy y o day
const MODELS = [
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "DeepSeek" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "DeepSeek" },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", provider: "Google" },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash (preview)", provider: "Google" },
];

const modelBtn = document.getElementById("modelBtn");
const modelPanel = document.getElementById("modelPanel");
const modelListEl = document.getElementById("modelList");
const apiKeyInput = document.getElementById("apiKey");
const activeModelLabel = document.getElementById("activeModel");

let settings = { model: MODELS[0].id, keys: {} };

function currentProvider() {
  const m = MODELS.find((x) => x.id === settings.model);
  return m ? m.provider : "";
}
function loadSettings(cb) {
  if (hasStorage) {
    chrome.storage.local.get("settings", (d) => {
      if (d && d.settings) settings = Object.assign({ model: MODELS[0].id, keys: {} }, d.settings);
      if (!settings.keys) settings.keys = {};
      // Chuyen doi tu ban cu (mot key chung) sang key theo nha cung cap
      if (d && d.settings && d.settings.apiKey && !Object.keys(settings.keys).length) {
        settings.keys[currentProvider()] = d.settings.apiKey;
      }
      cb && cb();
    });
  } else {
    cb && cb();
  }
}
function saveSettings() {
  if (hasStorage) chrome.storage.local.set({ settings });
}
function modelName(id) {
  const m = MODELS.find((x) => x.id === id);
  return m ? m.name : id;
}
// Lay model + key (theo nha cung cap dang chon)
function getModelConfig() {
  return { model: settings.model, apiKey: (settings.keys && settings.keys[currentProvider()]) || "" };
}
// Dong bo o nhap key theo nha cung cap cua model dang chon
function syncKeyInput() {
  apiKeyInput.value = getModelConfig().apiKey || "";
  apiKeyInput.placeholder = "Dan API key (" + currentProvider() + ")...";
}

function renderModels() {
  modelListEl.innerHTML = MODELS.map((m) => {
    const active = m.id === settings.model;
    return `<button class="model-row${active ? " active" : ""}" data-id="${m.id}">
      <span class="mr-main">
        <span class="mr-name">${escapeHTML(m.name)}</span>
        <span class="mr-sub">${escapeHTML(m.provider)}</span>
      </span>
      <svg class="mr-check" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>`;
  }).join("");

  modelListEl.querySelectorAll(".model-row").forEach((b) =>
    b.addEventListener("click", () => {
      settings.model = b.dataset.id;
      saveSettings();
      renderModels();
      updateActiveLabel();
      syncKeyInput();
    })
  );
}
function updateActiveLabel() {
  if (activeModelLabel) activeModelLabel.textContent = modelName(settings.model);
}

function togglePanel(open) {
  const show =
    open === undefined ? !modelPanel.classList.contains("open") : open;
  modelPanel.classList.toggle("open", show);
}

modelBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  togglePanel();
});
modelPanel.addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => togglePanel(false));

let keyTimer;
apiKeyInput.addEventListener("input", () => {
  clearTimeout(keyTimer);
  keyTimer = setTimeout(() => {
    settings.keys[currentProvider()] = apiKeyInput.value.trim();
    saveSettings();
  }, 300);
});

loadSettings(() => {
  renderModels();
  updateActiveLabel();
  syncKeyInput();
});
