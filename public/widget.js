(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var tenantId = script.getAttribute("data-tenant-id");
  if (!tenantId) { console.error("[YDBot] data-tenant-id is required"); return; }

  var botName = script.getAttribute("data-bot-name") || "Asistente";
  var welcome = script.getAttribute("data-welcome") || "¡Hola! ¿En qué puedo ayudarte?";
  var color = script.getAttribute("data-color") || "#7c3aed";
  var position = script.getAttribute("data-position") || "right";
  var baseUrl = script.src.replace(/\/widget\.js.*$/, "");

  var sessionId = (function () {
    var key = "yd_bot_session_" + tenantId;
    var id = localStorage.getItem(key);
    if (!id) { id = "w_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(key, id); }
    return id;
  })();

  var isOpen = false;
  var messages = [{ role: "bot", text: welcome }];

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === "style" && typeof attrs[k] === "object") { Object.assign(e.style, attrs[k]); } else { e.setAttribute(k, attrs[k]); } });
    if (children) { if (typeof children === "string") e.textContent = children; else if (Array.isArray(children)) children.forEach(function (c) { if (c) e.appendChild(c); }); else e.appendChild(children); }
    return e;
  }

  var root = el("div", { id: "yd-bot-widget", style: { position: "fixed", bottom: "20px", zIndex: "99999", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", [position === "left" ? "left" : "right"]: "20px" } });

  var bubbleSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var closeSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var sendSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

  var bubble = el("button", { style: { width: "56px", height: "56px", borderRadius: "50%", backgroundColor: color, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", transition: "transform 0.2s" } });
  bubble.innerHTML = bubbleSvg;
  bubble.onmouseenter = function () { bubble.style.transform = "scale(1.1)"; };
  bubble.onmouseleave = function () { bubble.style.transform = "scale(1)"; };

  var panel = el("div", { style: { display: "none", width: "370px", maxWidth: "calc(100vw - 40px)", height: "520px", maxHeight: "calc(100vh - 100px)", borderRadius: "16px", overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.12)", marginBottom: "12px", flexDirection: "column", backgroundColor: "#fff" } });

  var header = el("div", { style: { padding: "16px", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" } }, [
    el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, [
      el("div", { style: { width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" } }, "🤖"),
      el("div", null, [
        el("div", { style: { fontWeight: "600", fontSize: "14px" } }, botName),
        el("div", { style: { fontSize: "11px", opacity: "0.8" } }, "En línea")
      ])
    ])
  ]);
  var closeBtn = el("button", { style: { background: "none", border: "none", cursor: "pointer", padding: "4px" } });
  closeBtn.innerHTML = closeSvg;
  closeBtn.onclick = function () { toggle(); };
  header.querySelector("div").parentElement.appendChild(closeBtn);

  var body = el("div", { style: { flex: "1", overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "8px", backgroundColor: "#f9fafb" } });

  var footer = el("form", { style: { padding: "12px", borderTop: "1px solid #e5e7eb", display: "flex", gap: "8px", backgroundColor: "#fff" } });
  var input = el("input", { type: "text", placeholder: "Escribe un mensaje...", style: { flex: "1", padding: "10px 14px", borderRadius: "24px", border: "1px solid #d1d5db", outline: "none", fontSize: "14px", backgroundColor: "#f9fafb" } });
  input.onfocus = function () { input.style.borderColor = color; };
  input.onblur = function () { input.style.borderColor = "#d1d5db"; };
  var sendBtn = el("button", { type: "submit", style: { width: "40px", height: "40px", borderRadius: "50%", backgroundColor: color, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: "0" } });
  sendBtn.innerHTML = sendSvg;
  footer.appendChild(input);
  footer.appendChild(sendBtn);

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);
  root.appendChild(panel);
  root.appendChild(bubble);
  document.body.appendChild(root);

  function renderMessages() {
    body.innerHTML = "";
    messages.forEach(function (m) {
      var isBot = m.role === "bot";
      var msg = el("div", { style: { maxWidth: "80%", padding: "10px 14px", borderRadius: isBot ? "16px 16px 16px 4px" : "16px 16px 4px 16px", backgroundColor: isBot ? "#fff" : color, color: isBot ? "#1f2937" : "#fff", fontSize: "14px", lineHeight: "1.5", alignSelf: isBot ? "flex-start" : "flex-end", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", wordBreak: "break-word" } }, m.text);
      body.appendChild(msg);
    });
    body.scrollTop = body.scrollHeight;
  }

  function toggle() {
    isOpen = !isOpen;
    panel.style.display = isOpen ? "flex" : "none";
    bubble.innerHTML = isOpen ? closeSvg : bubbleSvg;
    bubble.style.backgroundColor = isOpen ? "#6b7280" : color;
    if (isOpen) { renderMessages(); input.focus(); }
  }

  bubble.onclick = function () { toggle(); };

  footer.onsubmit = function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    messages.push({ role: "user", text: text });
    renderMessages();

    var typing = el("div", { style: { maxWidth: "80%", padding: "10px 14px", borderRadius: "16px 16px 16px 4px", backgroundColor: "#fff", color: "#9ca3af", fontSize: "14px", alignSelf: "flex-start", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" } }, "Escribiendo...");
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;

    fetch(baseUrl + "/api/bot/" + tenantId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, session_id: sessionId, channel: "web" })
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      messages.push({ role: "bot", text: data.message || data.bot_response || data.error || "Sin respuesta" });
      if (data.payment_link) messages.push({ role: "bot", text: "💳 Link de pago: " + data.payment_link });
      renderMessages();
    }).catch(function () {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      messages.push({ role: "bot", text: "Lo siento, hubo un error. Intenta de nuevo." });
      renderMessages();
    });
  };

  renderMessages();
})();
