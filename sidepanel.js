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

// Ham chay TRONG trang de trich noi dung. Trang bai viet -> lay article/main;
// trang chu/danh sach -> lay toan bo text hien thi cua trang.
function __extractPageContent() {
  try {
    var tlen = function (el) { return el ? (el.innerText || "").trim().length : 0; };
    var body = document.body;
    var bodyLen = tlen(body);
    var cand = null, candLen = 0;
    ["main", "article"].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      var l = tlen(el);
      // chi dung neu du lon (bai viet thuc su), khong thi de trang chu roi vao body
      if ((l >= 1500 || l >= bodyLen * 0.4) && l > candLen) { cand = el; candLen = l; }
    });
    var root = cand || body;
    var clone = root.cloneNode(true);
    // chi bo cac phan KHONG phai noi dung; giu nav/header vi tren trang chu do la tin bai
    clone.querySelectorAll(
      'script,style,noscript,svg,canvas,iframe,template,link,[hidden],[aria-hidden="true"]'
    ).forEach(function (n) { n.remove(); });
    var text = (clone.innerText || clone.textContent || "")
      .replace(/[ \t]+/g, " ")
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
        const MAX = 40000;
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
    messagesEl.appendChild(makeBubble(m, first, tail, i));
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
    out += renderProse(text.slice(last, m.index));
    out += codeBlockHTML(m[1] || "", m[2].replace(/\n$/, ""));
    last = re.lastIndex;
  }
  out += renderProse(text.slice(last));
  return out;
}
// Inline markdown: `code`, **dam**, *nghieng*, link
function mdInline(s) {
  let e = escapeHTML(s);
  e = e.replace(/`([^`]+)`/g, (mm, c) => '<code class="md-code">' + c + "</code>");
  e = e.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  e = e.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  e = e.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  e = e.replace(
    /(https?:\/\/[^\s<]+)/g,
    (u) => '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + "</a>"
  );
  return e;
}
// Block-level markdown: tieu de, danh sach, trich dan, hr, doan van
function renderProse(md) {
  if (!md) return "";
  const lines = md.replace(/\r/g, "").split("\n");
  let html = "", i = 0, para = [];
  const flush = () => {
    if (para.length) { html += "<p>" + para.map(mdInline).join("<br>") + "</p>"; para = []; }
  };
  while (i < lines.length) {
    const line = lines[i], t = line.trim();
    if (t === "") { flush(); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); html += '<hr class="md-hr">'; i++; continue; }
    const hm = /^(#{1,6})\s+(.*)$/.exec(t);
    if (hm) { flush(); html += '<div class="md-h md-h' + hm[1].length + '">' + mdInline(hm[2]) + "</div>"; i++; continue; }
    if (/^>\s?/.test(t)) {
      flush(); const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { q.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      html += '<blockquote class="md-quote">' + q.map(mdInline).join("<br>") + "</blockquote>"; continue;
    }
    if (/^([-*•])\s+/.test(t)) {
      flush(); html += '<ul class="md-ul">';
      while (i < lines.length && /^([-*•])\s+/.test(lines[i].trim()))
        { html += "<li>" + mdInline(lines[i].trim().replace(/^([-*•])\s+/, "")) + "</li>"; i++; }
      html += "</ul>"; continue;
    }
    if (/^\d+[.)]\s+/.test(t)) {
      flush(); html += '<ol class="md-ol">';
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim()))
        { html += "<li>" + mdInline(lines[i].trim().replace(/^\d+[.)]\s+/, "")) + "</li>"; i++; }
      html += "</ol>"; continue;
    }
    para.push(line); i++;
  }
  flush();
  return html;
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

function makeBubble(m, first, tail, idx) {
  const el = document.createElement("div");
  el.className = "bubble " + m.side + (tail ? " tail" : "");
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
  el.className += (m.side === "sent" && first ? " first" : "");

  const dots = document.createElement("button");
  dots.className = "msg-dots";
  dots.dataset.i = idx;
  dots.title = "Tùy chọn";
  dots.innerHTML =
    '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
  el.appendChild(dots); // dots NAM TRONG bong bong

  if (m.side !== "received") return el;

  const row = document.createElement("div");
  row.className = "msg-row received" + (first ? " first" : "");
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
let suggestMode = "default"; // "default" | "group"
const groupSelected = new Set();
const GROUP_OPTIONS = [
  { label: "Tiếng Việt", instr: "Dịch sang tiếng Việt" },
  { label: "Tiếng Anh", instr: "Dịch sang tiếng Anh" },
  { label: "Tiếng Trung", instr: "Dịch sang tiếng Trung" },
  { label: "Chính tả & ngữ pháp", instr: "Sửa chính tả và ngữ pháp" },
  { label: "Trang trọng", instr: "Viết lại văn phong trang trọng" },
  { label: "Thân thiện", instr: "Viết lại văn phong thân thiện" },
  { label: "Ngắn gọn", instr: "Viết lại ngắn gọn hơn" },
];

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
  if (!has) { suggestMode = "default"; groupSelected.clear(); }
  suggestionsEl.classList.toggle("multi", suggestMode === "group");
  let html = "";
  if (suggestMode === "group") {
    html += '<button class="sg-btn sg-back" data-act="back" title="Đóng">✕</button>';
    html += '<div class="sg-track" id="sgTrack">';
    GROUP_OPTIONS.forEach(
      (o, i) =>
        (html +=
          '<button class="sg-btn sg-opt' + (groupSelected.has(o.instr) ? " sel" : "") + '" data-oi="' + i + '" style="animation-delay:' + i * 35 + 'ms">' + escapeHTML(o.label) + "</button>")
    );
    html += "</div>";
    html += '<button class="sg-btn sg-ok" data-act="ok"' + (groupSelected.size ? "" : " disabled") + ">OK</button>";
  } else {
    if (currentSingleWord()) html += '<button class="sg-btn sg-def" data-act="def">Định nghĩa</button>';
    html += '<button class="sg-btn" data-instr="Tóm tắt ý chính">Tóm tắt ý chính</button>';
    html += '<button class="sg-btn" data-act="group">Phiên dịch, văn phong &amp; chính tả</button>';
    html += '<button class="sg-btn sg-obs" data-act="obs">Lưu Obsidian</button>';
  }
  suggestionsEl.innerHTML = html;
  suggestionsEl.querySelectorAll(".sg-btn").forEach((b) => b.addEventListener("click", () => onSgClick(b)));
}
function onSgClick(b) {
  const act = b.dataset.act;
  if (act === "def") { const w = currentSingleWord(); if (w) defineWordLocal(w); return; }
  if (act === "obs") { saveTextToObsidian(buildPrompt(input.value.trim(), attachments), "Ghi chú"); return; }
  if (act === "group") { suggestMode = "group"; groupSelected.clear(); updateSuggestions(); return; }
  if (act === "back") { suggestMode = "default"; groupSelected.clear(); updateSuggestions(); return; }
  if (act === "ok") {
    if (!groupSelected.size) return;
    const instr = "Áp dụng các yêu cầu sau cho nội dung bên dưới (giữ nguyên ý, trả về kết quả): " + [...groupSelected].join("; ") + ".";
    sendSuggestion(instr);
    return;
  }
  if (b.dataset.oi !== undefined) {
    const o = GROUP_OPTIONS[+b.dataset.oi];
    if (groupSelected.has(o.instr)) groupSelected.delete(o.instr);
    else groupSelected.add(o.instr);
    b.classList.toggle("sel");
    const ok = suggestionsEl.querySelector(".sg-ok");
    if (ok) ok.disabled = groupSelected.size === 0;
    return;
  }
  if (b.dataset.instr) sendSuggestion(b.dataset.instr);
}
function sendSuggestion(instr) {
  suggestMode = "default";
  groupSelected.clear();
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
function lemmaCandidates(w) {
  const c = [w];
  if (w.length > 4 && w.endsWith("ies")) c.push(w.slice(0, -3) + "y");
  if (w.length > 3 && w.endsWith("es")) c.push(w.slice(0, -2));
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) c.push(w.slice(0, -1));
  if (w.length > 3 && w.endsWith("ed")) {
    c.push(w.slice(0, -2)); c.push(w.slice(0, -1));
    if (w[w.length - 3] === w[w.length - 4]) c.push(w.slice(0, -3));
  }
  if (w.length > 4 && w.endsWith("ing")) {
    c.push(w.slice(0, -3)); c.push(w.slice(0, -3) + "e");
    if (w[w.length - 4] === w[w.length - 5]) c.push(w.slice(0, -4));
  }
  return [...new Set(c)];
}
async function lookupWord(word) {
  const w = word.toLowerCase().trim();
  const letter = /^[a-z]/.test(w) ? w[0] : "misc";
  const data = await loadLetter(letter);
  for (const c of lemmaCandidates(w)) if (data[c]) return data[c];
  return null;
}
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
    e.vi.forEach((g) => {
      if (typeof g === "string") { h += '<div class="def-vi-item">' + escapeHTML(g) + "</div>"; return; }
      h += '<div class="def-group">';
      if (g.pos) h += '<span class="pos pos-vi">' + escapeHTML(g.pos) + "</span>";
      if (g.means && g.means.length)
        h += '<ul class="def-vi-list">' + g.means.map((x) => "<li>" + escapeHTML(x) + "</li>").join("") + "</ul>";
      if (g.ex && g.ex.length)
        g.ex.forEach((x) => (h += '<div class="def-ex"><span class="ex-en">' + escapeHTML(x.en) + "</span> — " + escapeHTML(x.vi) + "</div>"));
      h += "</div>";
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
/* =================== SU KIEN =================== */
sendBtn.addEventListener("click", send);
if (addPageBtn) addPageBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMoon(); });
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
      // Neu model da luu khong con trong danh sach (vd Gemini da bo) -> ve mac dinh
      if (!MODELS.some((x) => x.id === settings.model)) settings.model = MODELS[0].id;
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

/* =================== MENU CONG CU TRANG (nut mat trang) =================== */
const moonPanel = document.getElementById("moonPanel");
const moonListEl = document.getElementById("moonList");

// Them tuy chon moi vao day trong tuong lai
const PAGE_ACTIONS = [
  { name: "Lấy nội dung trang hiện tại", sub: "Trích văn bản trang đang mở", run: addCurrentTab },
  { name: "Cấu hình Obsidian", sub: "Dán API key Local REST API", run: configObsidian },
  { name: "Mở ở cửa sổ riêng", sub: "Dùng khi trình duyệt không có side panel", run: openInOwnWindow },
];
function openInOwnWindow() {
  if (chrome.windows && chrome.windows.create)
    chrome.windows.create({ url: chrome.runtime.getURL("sidepanel.html"), type: "popup", width: 440, height: 760 });
}

function renderMoonList() {
  moonListEl.innerHTML = PAGE_ACTIONS.map(
    (a, i) =>
      `<button class="model-row moon-row" data-i="${i}">
        <span class="mr-main">
          <span class="mr-name">${escapeHTML(a.name)}</span>
          <span class="mr-sub">${escapeHTML(a.sub || "")}</span>
        </span>
      </button>`
  ).join("");
  moonListEl.querySelectorAll(".moon-row").forEach((b) =>
    b.addEventListener("click", () => {
      toggleMoon(false);
      const a = PAGE_ACTIONS[+b.dataset.i];
      if (a && a.run) a.run();
    })
  );
}
function toggleMoon(open) {
  const show = open === undefined ? !moonPanel.classList.contains("open") : open;
  moonPanel.classList.toggle("open", show);
}
moonPanel.addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => toggleMoon(false));
renderMoonList();

/* =================== MENU MOI TIN NHAN (...) =================== */
const msgMenu = document.getElementById("msgMenu");
let menuTargetIndex = -1;

function messagePlainText(m) {
  if (!m) return "";
  if (m.text) return m.text;
  if (m.kind === "def" && m.def) {
    const e = m.def;
    let s = e.w + (e.ipa ? " " + e.ipa : "");
    (e.en || []).forEach((x) => (s += "\n- " + (x.p ? "(" + x.p + ") " : "") + x.d));
    (e.vi || []).forEach((g) => {
      if (typeof g === "string") { s += "\n- " + g; return; }
      if (g.pos) s += "\n[" + g.pos + "]";
      (g.means || []).forEach((x) => (s += "\n- " + x));
    });
    return s;
  }
  return "";
}
function openMsgMenu(btn, i) {
  menuTargetIndex = i;
  msgMenu.classList.add("open");
  const r = btn.getBoundingClientRect();
  const mh = msgMenu.offsetHeight || 90, mw = msgMenu.offsetWidth || 130;
  let top = r.bottom + 4, vy = "top";
  if (top + mh > window.innerHeight - 8) { top = r.top - mh - 4; vy = "bottom"; }
  let left = r.left, vx = "left";
  if (left + mw > window.innerWidth - 8) { left = window.innerWidth - 8 - mw; vx = "right"; }
  msgMenu.style.transformOrigin = vy + " " + vx; // bung ra tu goc gan nut nhat
  msgMenu.style.top = Math.max(8, top) + "px";
  msgMenu.style.left = Math.max(8, left) + "px";
}
function closeMsgMenu() { msgMenu.classList.remove("open"); menuTargetIndex = -1; }

messagesEl.addEventListener("click", (e) => {
  const dots = e.target.closest(".msg-dots");
  if (dots) {
    e.stopPropagation();
    const i = +dots.dataset.i;
    if (msgMenu.classList.contains("open") && menuTargetIndex === i) closeMsgMenu();
    else openMsgMenu(dots, i);
  }
});
msgMenu.addEventListener("click", (e) => {
  const it = e.target.closest(".mm-item");
  if (!it) return;
  e.stopPropagation();
  const m = messages[menuTargetIndex];
  const txt = messagePlainText(m);
  if (it.dataset.act === "copy") {
    if (txt) navigator.clipboard.writeText(txt).catch(() => {});
  } else if (it.dataset.act === "quote") {
    if (txt) pushAttachment({ type: "text", text: txt, title: txt.replace(/\s+/g, " "), subtitle: "Trích tin nhắn" });
  } else if (it.dataset.act === "obsidian") {
    saveToObsidian(m); // giu nguyen cu chi nguoi dung de mo hop thoai chon thu muc
  }
  closeMsgMenu();
});
document.addEventListener("click", closeMsgMenu);

/* =================== LUU VAO OBSIDIAN (Local REST API - qua fetch) =================== */
const OBS_NOTE_DEFAULT = "Claude Chat.md";
const OBS_PORT_DEFAULT = 27123; // HTTP port cua plugin Local REST API
function obsKeyClean(k) {
  return (k || "").trim().replace(/^Bearer\s+/i, "").trim();
}
function obsPad(n) { return String(n).padStart(2, "0"); }
function obsNoteName() {
  let name = (settings.obsidianNote || OBS_NOTE_DEFAULT).trim();
  let base = name, ext = ".md";
  if (/\.md$/i.test(name)) base = name.slice(0, -3);
  const d = new Date();
  let suffix = "";
  if (settings.obsidianDateStamp) suffix += " " + d.getFullYear() + "-" + obsPad(d.getMonth() + 1) + "-" + obsPad(d.getDate());
  if (settings.obsidianTimeStamp) suffix += " " + obsPad(d.getHours()) + "-" + obsPad(d.getMinutes());
  return base + suffix + ext;
}
function obsBase() {
  const proto = settings.obsidianProto || "http";
  const port = settings.obsidianPort || (proto === "https" ? 27124 : 27123);
  return proto + "://127.0.0.1:" + port;
}

const obsModal = document.getElementById("obsModal");
function configObsidian() {
  document.getElementById("obsKey").value = settings.obsidianKey || "";
  document.getElementById("obsNote").value = settings.obsidianNote || OBS_NOTE_DEFAULT;
  document.getElementById("obsDate").checked = !!settings.obsidianDateStamp;
  document.getElementById("obsTime").checked = !!settings.obsidianTimeStamp;
  document.getElementById("obsProto").value =
    (settings.obsidianProto || "http") + ":" + (settings.obsidianPort || (settings.obsidianProto === "https" ? 27124 : 27123));
  obsModal.classList.add("open");
}
if (obsModal) {
  obsModal.addEventListener("click", (e) => { if (e.target === obsModal) obsModal.classList.remove("open"); });
  document.getElementById("obsCancel").addEventListener("click", () => obsModal.classList.remove("open"));
  document.getElementById("obsSave").addEventListener("click", () => {
    settings.obsidianKey = obsKeyClean(document.getElementById("obsKey").value);
    settings.obsidianNote = document.getElementById("obsNote").value.trim() || OBS_NOTE_DEFAULT;
    settings.obsidianDateStamp = document.getElementById("obsDate").checked;
    settings.obsidianTimeStamp = document.getElementById("obsTime").checked;
    const [proto, port] = document.getElementById("obsProto").value.split(":");
    settings.obsidianProto = proto;
    settings.obsidianPort = parseInt(port, 10) || OBS_PORT_DEFAULT;
    saveSettings();
    obsModal.classList.remove("open");
    showToast("Đã lưu cấu hình Obsidian");
  });
  document.getElementById("obsTest").addEventListener("click", async () => {
    const [proto, port] = document.getElementById("obsProto").value.split(":");
    const key = obsKeyClean(document.getElementById("obsKey").value);
    const url = proto + "://127.0.0.1:" + port + "/";
    try {
      const res = await fetch(url, { headers: key ? { Authorization: "Bearer " + key } : {} });
      showToast(res.ok ? "✓ Kết nối Obsidian OK (" + proto.toUpperCase() + ")" : "⚠️ HTTP " + res.status, res.ok);
    } catch (e) {
      showToast("⚠️ Không kết nối được " + proto.toUpperCase() + ". " + (proto === "https" ? "Cần cài chứng chỉ, " : "Bật HTTP Server trong plugin, ") + "và mở Obsidian.", false, 6000);
    }
  });
}
async function saveTextToObsidian(text, title) {
  if (!text || !text.trim()) { showToast("Không có nội dung để lưu", false); return; }
  const key = obsKeyClean(settings.obsidianKey);
  if (!key) { showToast("Chưa cấu hình Obsidian. Bấm 🌙 → 'Cấu hình Obsidian' để dán API key.", false, 5500); return; }
  const note = obsNoteName();
  const base = obsBase() + "/vault/" + encodeURIComponent(note);
  const stamp = new Date().toLocaleString("vi-VN");
  const block = "\n\n---\n\n### " + title + "  \n*" + stamp + "*\n\n" + text + "\n";
  const headers = { "Authorization": "Bearer " + key, "Content-Type": "text/markdown" };
  try {
    let res = await fetch(base, { method: "POST", headers, body: block });
    if (res.status === 404) {
      res = await fetch(base, { method: "PUT", headers, body: block.replace(/^\n\n---\n\n/, "") });
    }
    if (res.ok) showToast("✓ Đã lưu vào Obsidian (note " + note + ")");
    else {
      const t = await res.text().catch(() => "");
      showToast("⚠️ Lỗi HTTP " + res.status + (t ? ": " + t.slice(0, 120) : ""), false, 5500);
    }
  } catch (err) {
    showToast("⚠️ Không kết nối được Obsidian. Mở Obsidian + bật plugin Local REST API (và HTTP server). " + (err.message || ""), false, 6500);
  }
}
function saveToObsidian(m) {
  return saveTextToObsidian(messagePlainText(m), m.side === "sent" ? "Câu hỏi" : "Trả lời");
}

// Toast nho
function showToast(msg, ok = true, ms = 2500) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.toggle("err", !ok);
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), ms);
}

