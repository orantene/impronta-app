/* Support Desk Phase 0.5 mockup app — simulated only, no network writes. */
(function () {
  const D = () => window.DESK_DATA;
  const $ = (sel, el = document) => el.querySelector(sel);

  const state = {
    theme: localStorage.getItem("desk-mock-theme") || "light",
    viewport: localStorage.getItem("desk-mock-viewport") || "desktop",
    role: localStorage.getItem("desk-mock-role") || "agent",
    queue: "needs_you",
    activeId: "c1",
    contextCollapsed: false,
    composerMode: "reply",
    draft: "",
    noteDraft: "",
    showCmdk: false,
    cmdkFilter: "",
    mobileStep: "queues",
    toast: null,
  };

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "") || "hub";
    const [path, ...rest] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    const params = Object.fromEntries(new URLSearchParams(rest.join("?") || ""));
    // Also accept search params (?theme=dark&viewport=mobile) for screenshot automation.
    const search = Object.fromEntries(new URLSearchParams(location.search || ""));
    return { parts, params: { ...search, ...params }, path };
  }

  function applyRouteParams(params) {
    if (params.theme === "light" || params.theme === "dark") {
      state.theme = params.theme;
      localStorage.setItem("desk-mock-theme", state.theme);
    }
    if (params.viewport === "desktop" || params.viewport === "mobile") {
      state.viewport = params.viewport;
      localStorage.setItem("desk-mock-viewport", state.viewport);
    }
    if (params.role) {
      state.role = params.role;
      localStorage.setItem("desk-mock-role", state.role);
    }
  }

  function go(hash) {
    location.hash = hash.startsWith("#") ? hash : `#/${hash.replace(/^\//, "")}`;
  }

  function setTheme(t) {
    state.theme = t;
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("desk-mock-theme", t);
  }

  function setViewport(v) {
    state.viewport = v;
    localStorage.setItem("desk-mock-viewport", v);
    render();
  }

  function toast(msg) {
    state.toast = msg;
    render();
    setTimeout(() => {
      state.toast = null;
      render();
    }, 2200);
  }

  function channelIcon(ch) {
    const map = {
      email: "✉",
      in_app: "💬",
      guest_chat: "◌",
      form: "▤",
      system: "⚙",
    };
    return map[ch] || "•";
  }

  function statusPill(status) {
    const map = {
      open: ["pill-brand", "Open"],
      waiting_agent: ["pill-coral", "Waiting on agent"],
      waiting_customer: ["pill-caution", "Waiting on customer"],
      escalated: ["pill-critical", "Escalated"],
      resolved: ["pill-success", "Resolved"],
      snoozed: ["pill-muted", "Snoozed"],
    };
    const [cls, label] = map[status] || ["pill-muted", status];
    return `<span class="pill ${cls}"><span class="dot ${cls.includes("critical") ? "dot-critical" : cls.includes("success") ? "dot-success" : cls.includes("coral") ? "dot-coral" : "dot-brand"}"></span>${label}</span>`;
  }

  function protoChrome(inner) {
    const route = parseHash();
    return `
      <div class="proto">
        <div class="proto-banner" role="status">
          <span class="sim-tag">Simulated</span>
          <strong>Phase 0.5 design mockup</strong>
          — fake data only · no production writes · no real email/payments/notifications
        </div>
        <div class="proto-bar">
          <a class="btn" href="#/hub">Hub</a>
          <label>Theme
            <select id="themeSel">
              <option value="light" ${state.theme === "light" ? "selected" : ""}>Light</option>
              <option value="dark" ${state.theme === "dark" ? "selected" : ""}>Dark</option>
            </select>
          </label>
          <label>Viewport
            <select id="vpSel">
              <option value="desktop" ${state.viewport === "desktop" ? "selected" : ""}>Desktop 1440</option>
              <option value="mobile" ${state.viewport === "mobile" ? "selected" : ""}>Mobile 390</option>
            </select>
          </label>
          <label>Role
            <select id="roleSel">
              <option value="owner" ${state.role === "owner" ? "selected" : ""}>Owner</option>
              <option value="agent" ${state.role === "agent" ? "selected" : ""}>Human agent</option>
              <option value="specialist" ${state.role === "specialist" ? "selected" : ""}>Specialist</option>
              <option value="guest" ${state.role === "guest" ? "selected" : ""}>Unverified guest view</option>
            </select>
          </label>
          <button type="button" data-go="inbox/needs_you">Inbox</button>
          <button type="button" data-go="login/default">Login</button>
          <button type="button" data-go="cmdk/default">⌘K</button>
          <button type="button" data-go="insights">Insights</button>
          <button type="button" data-go="mobile/queues">Mobile</button>
          <span style="margin-left:auto;opacity:.7">#/${route.path}</span>
        </div>
        <div class="proto-stage" data-viewport="${state.viewport}" id="stage">
          ${
            state.viewport === "mobile"
              ? `<div class="phone-frame" data-screen>${inner}</div>`
              : `<div class="screen-root" data-screen>${inner}</div>`
          }
          ${state.toast ? `<div class="toast">${esc(state.toast)}</div>` : ""}
        </div>
      </div>`;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ——— Screens ——— */

  function renderHub() {
    const cards = [
      ["A", "login/default", "Support Desk login", "Branding, errors, invite, session expired"],
      ["B", "inbox/needs_you", "Inbox shell", "Queues, list, thread, context, resize"],
      ["C", "thread/c1", "Conversation thread", "Full message taxonomy + AI draft"],
      ["D", "composer/reply", "Composer", "Reply/note, canned, attach, failures"],
      ["E", "context/rich", "Customer context", "Sections + role visibility"],
      ["F", "cmdk/default", "Command palette", "Search, actions, owner-only"],
      ["G", "empty/inbox", "Empty / loading / failure", "All recovery states"],
      ["H", "mobile/queues", "Mobile journeys", "10-step phone flow"],
      ["I", "insights", "Insights overview", "Layout-only metrics + definitions"],
      ["—", "journeys", "25 journeys index", "Entry → recovery map"],
    ];
    const loginStates = [
      ["default", "Default"],
      ["invalid", "Invalid"],
      ["locked", "Locked"],
      ["forgot", "Forgot"],
      ["invite", "Invite"],
      ["unsupported", "No access"],
      ["expired", "Expired"],
      ["return", "Return path"],
      ["owner", "Owner"],
      ["loading", "Loading"],
    ];
    return `
      <div class="hub">
        ${brandWordmark()}
        <h1>Phase 0.5 interaction prototype</h1>
        <p class="lede">Clickable HTML mockups for Oran design review. Every control is simulated. Prefer light mode; toggle dark from the bar. Desktop target 1440px · mobile 390px.</p>
        <div class="hub-review">
          <strong>Review brief</strong>
          <ol>
            <li>Walk screens A–I in light, then flip dark on B / C / F / I.</li>
            <li><strong>Oran feedback (2026-10-03):</strong> Tulala mark + Support Desk wordmark; global ops search; Inbox + green presence + avatar; customer-first header with SLA countdown; Assist <code>NOT SENT</code> + Approve / Edit / Reject; short Canned/Macro/Attach + strong teal Send; quieter right rail; ES tickets use Spanish previews.</li>
            <li>Also check forest brand primary, dashed internal-note chrome, and explicit reply recipient line.</li>
            <li>Mobile H: queues → list → thread → context → keyboard → attach → note → AI → back (draft kept).</li>
            <li>Design reference only. Live Desk shell is on production behind <code>SUPPORT_DESK_ENABLED</code> (default OFF). Approving mockups does not enable the flag.</li>
          </ol>
          <div class="hub-login-states">
            <span class="code">A · login states</span>
            ${loginStates
              .map(
                ([id, label]) =>
                  `<a class="btn btn-sm" href="#/login/${id}">${label}</a>`
              )
              .join("")}
          </div>
        </div>
        <div class="hub-grid">
          ${cards
            .map(
              ([code, href, title, desc]) => `
            <a class="hub-card" href="#/${href}">
              <div class="code">Screen ${code}</div>
              <h3>${title}</h3>
              <p>${desc}</p>
            </a>`
            )
            .join("")}
        </div>
      </div>`;
  }

  function renderLogin(variant) {
    const v = variant || "default";
    const titles = {
      default: ["Sign in to Support Desk", "Agents use support.tulala.digital — separate from customer apps."],
      loading: ["Sign in to Support Desk", "Checking credentials…"],
      invalid: ["Sign in to Support Desk", "Email or password didn’t match."],
      locked: ["Account locked", "This Desk seat is disabled. Contact an owner."],
      forgot: ["Reset password", "We’ll email a reset link. Simulated — no email sent."],
      invite: ["Accept invitation", "Join Tulala Support as a human agent."],
      unsupported: ["No Desk access", "Your account can’t open Support Desk."],
      expired: ["Session expired", "Sign in again to continue. Your draft was kept locally (simulated)."],
      return: ["Sign in to continue", "You’ll return to conversation Ana Castillo after sign-in."],
      owner: ["Sign in to Support Desk", "Owner accounts can open Platform Admin from the Desk."],
    };
    const [title, sub] = titles[v] || titles.default;
    return `
      <div class="login-wrap">
        <div class="login-card">
          ${brandWordmark()}
          <h1>${title}</h1>
          <p class="sub">${sub}</p>
          ${v === "invalid" ? `<div class="alert alert-error">Invalid email or password. <button class="btn btn-sm btn-ghost" data-go="login/forgot">Forgot password?</button></div>` : ""}
          ${v === "locked" ? `<div class="alert alert-warn">Seat disabled · last login blocked by owner policy.</div>` : ""}
          ${v === "unsupported" ? `<div class="alert alert-info">You’re signed in as a workspace member without Desk permission. <button class="btn btn-sm" data-go="login/default">Use a Desk account</button></div>` : ""}
          ${v === "expired" ? `<div class="alert alert-warn">Session ended while composing. Draft preserved in this browser (simulated).</div>` : ""}
          ${v === "return" ? `<div class="alert alert-info">Return path: <code>#/thread/c1</code></div>` : ""}
          <form class="login-stack" onsubmit="return false;">
            ${
              v === "invite"
                ? `<div class="field"><label>Invite code</label><input value="INVITE-DEMO-ONLY" readonly /></div>`
                : ""
            }
            <div class="field ${v === "invalid" ? "field-error" : ""}">
              <label>Email</label>
              <input type="email" value="${v === "owner" ? "oran@tulala.digital" : "maya.ruiz@tulala.digital"}" ${v === "loading" ? "disabled" : ""} />
              ${v === "invalid" ? `<span class="field-hint">Check spelling or reset password</span>` : ""}
            </div>
            <div class="field">
              <label>Password</label>
              <input type="password" value="••••••••" ${v === "loading" || v === "locked" ? "disabled" : ""} />
            </div>
            <button class="btn btn-primary" data-go="${v === "unsupported" || v === "locked" ? "login/default" : "inbox/needs_you"}" ${v === "loading" ? "disabled" : ""}>
              ${v === "loading" ? "Signing in…" : v === "invite" ? "Accept & continue" : v === "forgot" ? "Send reset link (simulated)" : "Sign in"}
            </button>
            <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" data-go="login/forgot" type="button">Forgot password</button>
              <button class="btn btn-ghost btn-sm" data-go="login/invite" type="button">Have an invite?</button>
            </div>
            <div style="border-top:1px solid var(--desk-border);padding-top:10px;display:flex;flex-wrap:wrap;gap:6px">
              <span class="sim-tag">States</span>
              ${["default", "loading", "invalid", "locked", "forgot", "invite", "unsupported", "expired", "return", "owner"]
                .map((s) => `<button class="btn btn-sm ${v === s ? "btn-primary" : ""}" data-go="login/${s}" type="button">${s}</button>`)
                .join("")}
            </div>
            ${
              v === "owner"
                ? `<p class="field-hint">After login, owner sees <strong>Open Platform Admin ↗</strong> in the rail. Agents do not.</p>`
                : `<p class="field-hint">Support-only users stay on Desk · owners can open Platform Admin.</p>`
            }
          </form>
        </div>
      </div>`;
  }

  function brandWordmark(compact) {
    // Tulala mark (logo) + “Support Desk” wordmark — not one mashed title string (Oran).
    return `<div class="brand-mark${compact ? " brand-mark-compact" : ""}" title="Tulala Support Desk"><span class="logo" aria-hidden="true">T</span><span class="brand-text"><span class="brand-name visually-hidden">Tulala</span><span class="brand-product">Support Desk</span></span></div>`;
  }

  function deskChrome() {
    const me = D().agents[D().me] || D().agents.maya;
    return `
      <header class="desk-chrome">
        <a class="desk-chrome-brand" href="#/inbox/needs_you" data-go="inbox/needs_you">${brandWordmark()}</a>
        <label class="desk-global-search">
          <span class="desk-global-search-icon" aria-hidden="true">⌕</span>
          <input type="search" placeholder="Search name, email, booking, payment…" data-go-on-focus="cmdk/search" aria-label="Search name, email, booking, payment" />
        </label>
        <div class="desk-chrome-presence">
          <button class="desk-inbox-btn" type="button" data-go="inbox/needs_you" title="Inbox">
            Inbox <span class="dot dot-success desk-presence-dot" title="Online"></span>
          </button>
          <span class="avatar avatar-sm desk-agent-avatar" title="${esc(me.name)}">${esc(me.initials)}</span>
        </div>
      </header>`;
  }

  function deskFrame(bodyInner, opts = {}) {
    const collapsed = opts.collapsed ?? state.contextCollapsed;
    const style = opts.style || "--context-w:320px;height:100%;position:relative";
    return `
      <div class="desk-shell ${collapsed ? "context-collapsed" : ""}" style="${style}">
        ${deskChrome()}
        <div class="desk-body">
          ${bodyInner}
        </div>
        ${opts.overlay || ""}
      </div>`;
  }

  function rail(activeQueue) {
    const owner = state.role === "owner";
    return `
      <aside class="pane pane-rail">
        <div class="pane-body">
          <div class="nav-section">Views</div>
          ${D()
            .queues.map(
              (q) => `
            <button class="nav-item ${activeQueue === q.id ? "active" : ""}" data-go="inbox/${q.id}">
              ${q.label}<span class="count">${q.count}</span>
            </button>`
            )
            .join("")}
          <div class="nav-section">Workspace</div>
          <button class="nav-item" data-go="insights">Insights</button>
          <button class="nav-item" data-go="cmdk/default">Command palette</button>
          ${
            owner
              ? `<button class="nav-item" data-action="open-hq">Open Platform Admin ↗</button>`
              : `<button class="nav-item" disabled title="Owner only" aria-disabled="true">Platform Admin <span class="pill pill-muted">Owner</span></button>`
          }
        </div>
      </aside>`;
  }

  function conversationList(queue) {
    const rows = D().conversations;
    return `
      <section class="pane pane-list">
        <div class="pane-header">
          <h2>${D().queues.find((q) => q.id === queue)?.label || "Inbox"}</h2>
          <div style="margin-left:auto;display:flex;gap:4px">
            <button class="icon-btn" title="Search" data-go="cmdk/search">⌕</button>
            <button class="icon-btn" title="Refresh (simulated)" data-action="toast" data-msg="Refreshed (simulated)">↻</button>
          </div>
        </div>
        <div style="padding:8px 12px;border-bottom:1px solid var(--desk-border)">
          <input class="list-filter" placeholder="Filter this view…" aria-label="Filter this view" data-go-on-focus="cmdk/search" />
        </div>
        <div class="pane-body">
          ${rows
            .map((c) => {
              const assignee = c.assignee ? D().agents[c.assignee]?.initials : "—";
              return `
              <button class="conv-row ${c.id === state.activeId ? "active" : ""} ${c.unread ? "unread" : ""}" data-go="thread/${c.id}">
                <span class="avatar avatar-sm" title="${esc(c.channel)}">${channelIcon(c.channel)}</span>
                <span>
                  <span class="conv-top"><span class="conv-name">${esc(c.customer)}</span><span class="conv-time">${esc(c.time)}</span></span>
                  <div class="conv-preview">${esc(c.preview)}</div>
                  <div class="conv-meta">
                    ${statusPill(c.status)}
                    ${c.sla === "warn" ? `<span class="pill pill-sla-warn">SLA warn</span>` : ""}
                    ${c.sla === "breach" ? `<span class="pill pill-critical">SLA breach</span>` : ""}
                    <span class="pill pill-muted" title="Language">${esc(c.language)}</span>
                    <span class="pill pill-muted" title="Assignee">${assignee}</span>
                  </div>
                  <div class="conv-source" title="Source">${esc(c.hub)}</div>
                </span>
                <span>${c.unread ? `<span class="dot dot-brand" title="Unread"></span>` : ""}</span>
              </button>`;
            })
            .join("")}
        </div>
      </section>`;
  }

  function renderMessages(items) {
    return items
      .map((m) => {
        if (m.type === "date") return `<div class="divider-date">${esc(m.label)}</div>`;
        if (m.type === "unread") return `<div class="divider-unread">${esc(m.label)}</div>`;
        if (m.type === "system" || m.type === "assignment" || m.type === "status" || m.type === "escalation") {
          return `<div class="msg system"><div class="system-line">${esc(m.text)}</div></div>`;
        }
        if (m.type === "presence") {
          return `<div class="msg system"><div class="system-line presence">${esc(m.text)}</div></div>`;
        }
        if (m.type === "typing") {
          return `<div class="msg"><span class="avatar avatar-sm">AC</span><div class="msg-body"><div class="msg-bubble"><span class="typing-dots"><span></span><span></span><span></span></span> ${esc(m.who)} typing</div></div></div>`;
        }
        if (m.type === "loading") {
          return `<div class="msg agent"><span class="avatar avatar-sm">MR</span><div class="msg-body"><div class="msg-meta"><span class="who">${esc(m.who)}</span><span>Sending…</span></div><div class="msg-bubble"><div class="skeleton" style="height:14px;width:70%"></div></div></div></div>`;
        }
        if (m.type === "failed") {
          return `<div class="msg agent"><span class="avatar avatar-sm">MR</span><div class="msg-body"><div class="msg-meta"><span class="who">${esc(m.who)}</span><span>${esc(m.time)}</span><span class="pill pill-critical">Failed</span></div><div class="msg-bubble">${esc(m.text)}</div><div class="ai-actions"><span class="field-hint">${esc(m.error)}</span><button class="btn btn-sm btn-primary" data-action="retry-send">Retry send (no duplicate)</button></div></div></div>`;
        }
        if (m.type === "attachment") {
          return `<div class="msg ${m.ok ? "customer" : "customer"}"><span class="avatar avatar-sm">AC</span><div class="msg-body"><div class="msg-meta"><span class="who">${esc(m.who)}</span><span>${esc(m.time)}</span></div><div class="attach-chip ${m.ok ? "" : "fail"}">${m.ok ? "📎" : "⚠"} ${esc(m.name)} · ${esc(m.size)}${m.reason ? ` · ${esc(m.reason)}` : ""}</div></div></div>`;
        }
        if (m.type === "ai-draft") {
          return `<div class="msg ai-draft"><span class="avatar avatar-sm avatar-ai">AI</span><div class="msg-body"><div class="msg-meta"><span class="who">${esc(m.who)} · draft</span><span>${esc(m.time)}</span><span class="pill pill-ai">Confidence ${esc(m.confidence)}</span><span class="pill pill-not-sent" title="Draft has not been sent to the customer">NOT SENT</span></div><div class="msg-bubble">${esc(m.text)}</div><div class="ai-actions"><button class="btn btn-sm btn-primary" data-action="approve-ai">Approve & send</button><button class="btn btn-sm" data-action="edit-ai">Edit draft</button><button class="btn btn-sm btn-danger" data-action="reject-ai">Reject</button>${m.confidence === "low" ? `<button class="btn btn-sm" data-go="composer/escalate">Escalate — low confidence</button>` : ""}</div></div></div>`;
        }
        if (m.type === "note") {
          return `<div class="msg note"><span class="avatar avatar-sm">MR</span><div class="msg-body"><div class="msg-meta"><span class="who">${esc(m.who)}</span><span class="pill pill-coral">Internal note · not visible to customer</span><span>${esc(m.time)}</span></div><div class="msg-bubble">${esc(m.text)}</div></div></div>`;
        }
        const cls = m.type === "agent" ? "agent" : "customer";
        const ini = m.type === "agent" ? "MR" : "AC";
        return `<div class="msg ${cls}"><span class="avatar avatar-sm">${ini}</span><div class="msg-body"><div class="msg-meta"><span class="who">${esc(m.who)}</span><span>${esc(m.time)}</span></div><div class="msg-bubble">${esc(m.text)}${
          m.linkPreview
            ? `<div class="link-preview"><div class="lp-body"><div class="lp-host">${esc(m.linkPreview.host)}</div><div class="lp-title">${esc(m.linkPreview.title)}</div></div></div>`
            : ""
        }</div></div></div>`;
      })
      .join("");
  }

  function composer(opts = {}) {
    const mode = opts.mode || state.composerMode;
    const disabled = opts.disabled;
    const fail = opts.fail;
    const upload = opts.upload;
    const mention = opts.mention;
    const canned = opts.canned;
    const draft = mode === "note" ? state.noteDraft : state.draft;
    const recipient =
      mode === "note"
        ? `<span class="recipient-line"><strong>Internal only</strong> — never sent to the customer · visible to agents with ticket access</span>`
        : `<span class="recipient-line"><strong>Reply to</strong> Ana Castillo · ana.castillo@example.test · channel email</span>`;
    return `
      <div class="composer ${mode === "note" ? "note-mode" : ""} ${disabled ? "is-disabled" : ""}">
        <div class="composer-mode">
          <div class="mode-toggle" role="tablist">
            <button type="button" class="${mode === "reply" ? "active" : ""}" data-action="composer-mode" data-mode="reply">Reply</button>
            <button type="button" class="${mode === "note" ? "active note" : ""}" data-action="composer-mode" data-mode="note">Internal note</button>
          </div>
          <span class="sim-tag">Draft preserved on navigate</span>
        </div>
        ${recipient}
        <textarea id="composerInput" placeholder="${mode === "note" ? "Write an internal note…" : "Write a reply…"}" ${disabled ? "disabled" : ""}>${esc(draft)}</textarea>
        ${
          upload
            ? `<div class="attach-chip">📎 receipt.pdf · uploading…<div class="progress"><i></i></div></div>`
            : ""
        }
        ${fail === "validation" ? `<div class="alert alert-error" style="margin-top:8px">Message can’t be empty.</div>` : ""}
        ${fail === "send" ? `<div class="alert alert-error" style="margin-top:8px">Send failed. <button class="btn btn-sm" data-action="retry-send">Retry without duplicating</button></div>` : ""}
        ${fail === "attach" ? `<div class="attach-chip fail" style="margin-top:8px">⚠ video.mkv rejected · type not allowed (max image/PDF)</div>` : ""}
        ${
          canned
            ? `<div style="margin-top:8px;border:1px solid var(--desk-border);border-radius:8px;padding:8px;background:var(--desk-surface)">
                <div style="font-size:11px;font-weight:650;margin-bottom:6px">Canned replies · variables filled from ticket</div>
                ${D()
                  .canned.map(
                    (c) =>
                      `<button class="btn btn-sm" style="margin:2px" data-action="insert-canned" data-id="${c.id}">${esc(c.title)}</button>`
                  )
                  .join("")}
                <div class="field-hint" style="margin-top:6px">Preview: Hi Ana — I’ve resent the receipt for BK-10422 to ana.castillo@example.test.</div>
              </div>`
            : ""
        }
        ${
          mention
            ? `<div style="margin-top:8px;border:1px solid var(--desk-border);border-radius:8px;overflow:hidden">
                <button class="cmdk-item active">@Leo Park · specialist</button>
                <button class="cmdk-item">@Oran Tene · owner</button>
              </div>`
            : ""
        }
        <div class="composer-toolbar">
          <button class="btn btn-sm btn-tool" data-go="composer/canned" ${disabled ? "disabled" : ""}>Canned ▾</button>
          <button class="btn btn-sm btn-tool" data-go="composer/macro" ${disabled ? "disabled" : ""}>Macro ▾</button>
          <button class="btn btn-sm btn-tool" data-go="composer/attach" ${disabled ? "disabled" : ""}>Attach</button>
          <button class="btn btn-sm btn-tool" data-go="composer/mention" ${disabled ? "disabled" : ""}>@</button>
          <span class="spacer"></span>
          <button class="btn btn-primary btn-send" data-action="send" ${disabled ? "disabled" : ""}>${mode === "note" ? "Add note" : "Send reply"}</button>
        </div>
        ${opts.leaveWarn ? `<div class="alert alert-warn" style="margin-top:8px">Unsaved draft — leave anyway? <button class="btn btn-sm" data-go="inbox/needs_you">Discard</button> <button class="btn btn-sm btn-primary" data-action="toast" data-msg="Stayed · draft kept">Keep editing</button></div>` : ""}
      </div>`;
  }

  function contextPanel(variant = "rich") {
    const ctx = variant === "empty" ? D().contextEmpty : D().contextRich;
    const role = state.role;
    const hideSensitive = role === "guest" || role === "agent" && variant === "empty";
    const canHistory = role === "owner" || role === "agent" || role === "specialist";
    const showPayments = role === "owner" || role === "specialist" || (role === "agent" && variant === "rich");
    // Keep verification / type / language / plan / related / bookings / quotes open;
    // collapse diagnostic noise by default (Oran B rail density).
    const section = (title, body, opts = {}) => `
      <details class="context-section"${opts.open === false ? "" : " open"}>
        <summary>${title}</summary>
        <div class="context-body">${body}</div>
      </details>`;
    const listOrEmpty = (items, empty = "None") => {
      if (items === "hidden") {
        return `<div class="unavailable">Hidden — verify identity before showing previous conversations</div>`;
      }
      if (!items || !items.length) return `<div class="unavailable">${empty}</div>`;
      return items
        .map((it) =>
          it.href
            ? `<a class="context-link" href="${it.href}"><span>${esc(it.label)}</span><span class="meta">${esc(it.meta || "Open")}</span></a>`
            : `<div class="context-link"><span>${esc(it.label)}</span><span class="meta">${esc(it.meta || "")}</span></div>`
        )
        .join("");
    };
    return `
      <aside class="pane pane-context">
        <div class="pane-header">
          <h2>Customer</h2>
          <button class="icon-btn" style="margin-left:auto" title="Collapse context" data-action="toggle-context">⟩</button>
        </div>
        <div class="pane-body">
          ${section(
            "Identity",
            `<div class="kv"><span class="k">Name</span><span class="v">${esc(ctx.identity.name)}</span></div>
             <div class="kv"><span class="k">Email</span><span class="v">${esc(ctx.identity.email)}</span></div>
             <div class="kv"><span class="k">Phone</span><span class="v">${hideSensitive && role === "guest" ? "Hidden" : esc(ctx.identity.phone)}</span></div>
             <div class="kv"><span class="k">Locale</span><span class="v">${esc(ctx.identity.locale)}</span></div>`
          )}
          ${section("Verification", `<span class="pill ${variant === "empty" ? "pill-caution" : "pill-success"}">${esc(ctx.verification)}</span>`)}
          ${section("Customer type", esc(ctx.customerType))}
          ${section("Language", esc(ctx.language))}
          ${section("Plan", esc(ctx.plan))}
          ${section("Related talent / agency", listOrEmpty(ctx.related, "None linked"))}
          ${section("Website", listOrEmpty(ctx.website, "No website context"), { open: false })}
          ${section("Services", listOrEmpty(ctx.services, "No services"), { open: false })}
          ${section("Bookings", listOrEmpty(ctx.bookings, "No bookings"))}
          ${section("Quotes", listOrEmpty(ctx.quotes, "No quotes"))}
          ${section(
            "Payments",
            showPayments ? listOrEmpty(ctx.payments, "No payments") : `<div class="unavailable">Hidden for this role</div>`,
            { open: false }
          )}
          ${section("Refunds", listOrEmpty(ctx.refunds, "No refunds"), { open: false })}
          ${section(
            "Previous conversations",
            !canHistory || ctx.previous === "hidden"
              ? `<div class="unavailable">Unverified guest — history withheld</div>`
              : listOrEmpty(ctx.previous, "No previous"),
            { open: false }
          )}
          ${section("Diagnostics", role === "guest" ? `<div class="unavailable">Agents only</div>` : listOrEmpty(ctx.diagnostics, "None"), { open: false })}
          ${section("Replay sessions", role === "owner" || role === "specialist" ? listOrEmpty(ctx.replays, "None") : `<div class="unavailable">Owner / specialist</div>`, { open: false })}
          ${section("Feature requests", listOrEmpty(ctx.features, "None"), { open: false })}
          ${section("Escalations", listOrEmpty(ctx.escalations, "None"), { open: false })}
          ${section("Internal risk / priority", ctx.flags.map((f) => `<span class="pill pill-coral">${esc(f)}</span>`).join(" "), { open: false })}
        </div>
      </aside>`;
  }

  function threadPane(id, extras = {}) {
    const c = D().conversations.find((x) => x.id === id) || D().conversations[0];
    const emailLine = c.email ? esc(c.email) : "No email on file";
    const slaPill =
      c.sla === "warn"
        ? `<span class="pill pill-sla-warn">SLA warn · 12m left</span>`
        : c.sla === "breach"
          ? `<span class="pill pill-critical">SLA breach · overdue</span>`
          : "";
    return `
      <section class="pane pane-thread" style="position:relative">
        <div class="thread-toolbar">
          <div class="thread-customer">
            <div class="thread-customer-name">${esc(c.customer)}</div>
            <div class="thread-customer-meta">${emailLine} · ${esc(c.hub || c.source)}</div>
            <div class="thread-subject-secondary">${esc(c.preview)}</div>
          </div>
          ${statusPill(c.status)}
          <span class="pill pill-muted">${c.assignee ? esc(D().agents[c.assignee].name) : "Unassigned"}</span>
          ${slaPill}
          <span class="thread-actions">
            <button class="btn btn-sm" data-go="cmdk/assign">Assign ▾</button>
            <button class="btn btn-sm" data-go="cmdk/status">Status ▾</button>
            <button class="btn btn-sm" data-go="cmdk/snooze">Snooze ▾</button>
            <button class="icon-btn" data-action="toggle-context" title="${state.contextCollapsed ? "Show context" : "Hide context"}">⋮</button>
          </span>
        </div>
        <div class="thread-messages">${renderMessages(D().threadC1)}</div>
        ${composer(extras.composer || {})}
        ${extras.cmdk || ""}
        ${!state.contextCollapsed && state.viewport === "desktop" ? `<div class="resize-hint">Drag edge to resize context (simulated)</div>` : ""}
      </section>`;
  }

  function renderInbox(queue) {
    state.queue = queue || state.queue;
    if (state.viewport === "mobile") {
      return renderMobile("list");
    }
    return deskFrame(`
        ${rail(state.queue)}
        ${conversationList(state.queue)}
        ${threadPane(state.activeId)}
        ${state.contextCollapsed ? "" : contextPanel("rich")}
    `);
  }

  function renderThread(id) {
    state.activeId = id || "c1";
    return renderInbox(state.queue);
  }

  function renderComposer(mode) {
    const map = {
      reply: { mode: "reply" },
      note: { mode: "note" },
      canned: { mode: "reply", canned: true },
      macro: { mode: "reply", canned: true },
      attach: { mode: "reply", upload: true },
      attach_fail: { mode: "reply", fail: "attach" },
      mention: { mode: "note", mention: true },
      disabled: { mode: "reply", disabled: true },
      fail: { mode: "reply", fail: "send" },
      validation: { mode: "reply", fail: "validation" },
      leave: { mode: "reply", leaveWarn: true },
      escalate: { mode: "note" },
    };
    state.composerMode = (map[mode] || map.reply).mode || "reply";
    if (state.viewport === "mobile") return renderMobile("composer");
    return deskFrame(`
        ${rail(state.queue)}
        ${conversationList(state.queue)}
        ${threadPane("c1", { composer: map[mode] || map.reply })}
        ${contextPanel("rich")}
    `);
  }

  function renderContext(variant) {
    return deskFrame(`
        ${rail(state.queue)}
        ${conversationList(state.queue)}
        ${threadPane(variant === "empty" ? "c3" : "c1")}
        ${contextPanel(variant === "empty" ? "empty" : "rich")}
    `);
  }

  function renderCmdk(variant) {
    const filter = (state.cmdkFilter || "").toLowerCase();
    let cmds = D().cmdkCommands.filter((c) => !filter || c.label.toLowerCase().includes(filter));
    if (variant === "empty") cmds = [];
    const owner = state.role === "owner";
    const list =
      cmds.length === 0
        ? `<div class="cmdk-empty">No results for “${esc(state.cmdkFilter || "…")}”</div>`
        : cmds
            .map((c, i) => {
              const restricted = c.ownerOnly && !owner;
              return `<button class="cmdk-item ${i === 0 ? "active" : ""} ${restricted ? "restricted" : ""}" ${restricted ? "disabled" : ""} data-action="cmdk-run" data-id="${c.id}">
                <span>${esc(c.label)}${restricted ? ` <span class="pill pill-muted">Owner only</span>` : ""}</span>
                <span class="kbd">${esc(c.kbd || c.group)}</span>
              </button>`;
            })
            .join("");
    const overlay = `
      <div class="cmdk-backdrop" data-action="close-cmdk">
        <div class="cmdk" onclick="event.stopPropagation()">
          <input id="cmdkInput" placeholder="Search conversations, customers, actions…" value="${esc(state.cmdkFilter)}" />
          <div class="cmdk-list">${list}</div>
          <div style="padding:8px 12px;border-top:1px solid var(--desk-border);font-size:11px;color:var(--desk-ink-dim)">Esc closes · ↑↓ navigate · simulated only</div>
        </div>
      </div>`;
    return deskFrame(
      `
        ${rail(state.queue)}
        ${conversationList(state.queue)}
        ${threadPane("c1")}
        ${contextPanel("rich")}
    `,
      { overlay }
    );
  }

  function renderEmpty(kind) {
    const panels = {
      inbox: { title: "Inbox is clear", body: "No conversations in this view. Check Unassigned or clear filters.", action: ["inbox/unassigned", "Open unassigned"] },
      assigned: { title: "Nothing assigned to you", body: "Grab from Unassigned or wait for routing.", action: ["inbox/unassigned", "Browse unassigned"] },
      search: { title: "No search results", body: "Try email, booking id (BK-…), or payment id (pi_…).", action: ["cmdk/search", "Search again"] },
      context: { title: "No customer context", body: "Guest session with no linked account yet.", action: ["context/empty", "View guest sidebar"] },
      network: { title: "Network error", body: "Couldn’t reach Desk. Check connection, then retry.", action: ["inbox/needs_you", "Retry"] },
      realtime: { title: "Realtime disconnected", body: "Live updates paused. Messages still send; presence may be stale.", action: ["inbox/needs_you", "Reconnect"] },
      send: { title: "Message not delivered", body: "Outbound failed. Retry uses the same idempotency key — no duplicate.", action: ["composer/fail", "Open failed send"] },
      email: { title: "Email delivery failed", body: "Provider returned a temporary error. Customer was not emailed twice.", action: ["composer/fail", "Retry email"] },
      permission: { title: "Permission needed", body: "Your role can’t run this action. Ask an owner.", action: ["cmdk/restricted", "Back"] },
      session: { title: "Session expired", body: "Sign in to keep your draft.", action: ["login/expired", "Sign in"] },
      attachment: { title: "Attachment failed", body: "File type or size not allowed.", action: ["composer/attach_fail", "See rejection"] },
      unsupported: { title: "Proposed · out of scope", body: "Merge UI is designed here; Phase 1 labels it proposed until engine lands.", action: ["hub", "Back to hub"] },
      skeleton: null,
    };
    if (kind === "skeleton") {
      return deskFrame(`
          ${rail("needs_you")}
          <section class="pane pane-list"><div class="pane-header"><h2>Loading</h2></div><div class="pane-body" style="padding:12px;display:flex;flex-direction:column;gap:10px">
            ${[1, 2, 3, 4, 5].map(() => `<div class="skeleton" style="height:64px"></div>`).join("")}
          </div></section>
          <section class="pane pane-thread"><div class="pane-header"><div class="skeleton" style="height:18px;width:180px"></div></div>
            <div class="thread-messages">${[1, 2, 3].map(() => `<div class="skeleton" style="height:48px;width:60%"></div>`).join("")}</div>
          </section>
          <aside class="pane pane-context"><div class="pane-header"><h2>Customer</h2></div><div class="pane-body" style="padding:12px;display:flex;flex-direction:column;gap:8px">
            ${[1, 2, 3, 4].map(() => `<div class="skeleton" style="height:40px"></div>`).join("")}
          </div></aside>
      `);
    }
    if (kind === "restricted") return renderCmdk("default");
    const p = panels[kind] || panels.inbox;
    return `
      <div style="height:100%;display:flex;flex-direction:column">
        <div class="pane-header">${brandWordmark(true)}
          <div style="margin-left:auto;display:flex;gap:4px;flex-wrap:wrap">
            ${Object.keys(panels)
              .filter((k) => k !== "skeleton")
              .map((k) => `<button class="btn btn-sm ${k === kind ? "btn-primary" : ""}" data-go="empty/${k}">${k}</button>`)
              .join("")}
            <button class="btn btn-sm" data-go="empty/skeleton">skeleton</button>
          </div>
        </div>
        <div class="state-panel" style="flex:1">
          <span class="sim-tag">Recovery state</span>
          <h3>${p.title}</h3>
          <p>${p.body}</p>
          <button class="btn btn-primary" data-go="${p.action[0]}">${p.action[1]}</button>
        </div>
      </div>`;
  }

  function renderInsights() {
    const i = D().insights;
    const card = (label, obj) => `
      <div class="stat-card">
        <div class="label">${label}</div>
        <div class="value">${esc(obj.value)}</div>
        <div class="def">${esc(obj.def)}</div>
      </div>`;
    return `
      <div class="insights">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          ${brandWordmark()}
          <span class="pill pill-muted">Insights</span>
          <span class="pill pill-info">Layout only</span>
          <span class="sim-tag">Sample figures · not live</span>
          <span style="margin-left:auto;font-size:12px;color:var(--desk-ink-dim)">${esc(i.range)}</span>
          <button class="btn btn-sm" data-go="inbox/needs_you">Back to inbox</button>
        </div>
        <p style="color:var(--desk-ink-muted);max-width:640px">Definitions are documented under each metric. No invented precision — placeholders use whole numbers and clear units.</p>
        <div class="insights-grid">
          ${card("Volume", i.volume)}
          ${card("First response", i.firstResponse)}
          ${card("Resolution", i.resolution)}
          ${card("SLA met", i.sla)}
          ${card("Backlog", i.backlog)}
          ${card("AI-assisted", i.aiAssisted)}
          ${card("Human handoff", i.handoff)}
          ${card("Escalations", i.escalations)}
          <div class="stat-card chart-card">
            <div class="label">Top categories · sample</div>
            <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
              ${[
                ["Payments / receipts", 34],
                ["Booking changes", 22],
                ["Access / login", 18],
                ["Website / builder", 11],
              ]
                .map(
                  ([n, p]) =>
                    `<div><div style="display:flex;justify-content:space-between;font-size:12px"><span>${n}</span><span>${p}%</span></div><div class="progress"><i style="width:${p}%"></i></div></div>`
                )
                .join("")}
            </div>
            <div class="def">Share of tickets tagged in range (illustrative)</div>
          </div>
          <div class="stat-card chart-card">
            <div class="label">Channel mix · sample</div>
            <div style="margin-top:14px;display:flex;gap:8px;align-items:flex-end;height:90px">
              ${[
                ["Email", 50],
                ["In-app", 28],
                ["Guest", 14],
                ["Form", 8],
              ]
                .map(
                  ([n, h]) =>
                    `<div style="flex:1;text-align:center"><div style="height:${h + 20}px;background:var(--desk-brand-soft);border:1px solid var(--desk-border);border-radius:6px 6px 0 0"></div><div style="font-size:11px;margin-top:6px;color:var(--desk-ink-dim)">${n}</div></div>`
                )
                .join("")}
            </div>
            <div class="def">Volume by intake channel (illustrative)</div>
          </div>
          <div class="stat-card chart-card">
            <div class="label">Agent workload · sample</div>
            <div style="margin-top:10px;font-size:13px;display:flex;flex-direction:column;gap:6px">
              <div>Maya Ruiz · 11 open · 4 waiting</div>
              <div>Leo Park · 3 escalated</div>
              <div>Unassigned · 4</div>
            </div>
            <div class="def">Open tickets by assignee (illustrative)</div>
          </div>
          <div class="stat-card">
            <div class="label">CSAT</div>
            <div class="value">${esc(i.csat.value)}</div>
            <div class="def">${esc(i.csat.def)}</div>
          </div>
        </div>
      </div>`;
  }

  function renderMobile(step) {
    const s = step || "queues";
    state.mobileStep = s;
    const top = (title, back) => `
      <div class="mobile-top">
        ${back ? `<button class="icon-btn" data-go="mobile/${back}" aria-label="Back">←</button>` : `<span class="brand-mark"><span class="logo">T</span></span>`}
        <strong style="flex:1">${title}</strong>
        <button class="icon-btn" data-go="mobile/context" title="Context">ⓘ</button>
      </div>`;

    if (s === "queues") {
      return `<div class="mobile-screen">${top("Views")}
        <div class="mobile-body">${D()
          .queues.map((q) => `<button class="nav-item" style="width:calc(100% - 12px)" data-go="mobile/list">${q.label}<span class="count">${q.count}</span></button>`)
          .join("")}</div></div>`;
    }
    if (s === "list") {
      return `<div class="mobile-screen">${top("Needs you", "queues")}
        <div class="mobile-body">${D()
          .conversations.map(
            (c) => `<button class="conv-row" data-go="mobile/thread">
              <span class="avatar avatar-sm">${channelIcon(c.channel)}</span>
              <span><span class="conv-top"><span class="conv-name">${esc(c.customer)}</span><span class="conv-time">${esc(c.time)}</span></span>
              <div class="conv-preview">${esc(c.preview)}</div></span></button>`
          )
          .join("")}</div></div>`;
    }
    if (s === "thread" || s === "composer" || s === "note" || s === "ai" || s === "attach" || s === "keyboard") {
      const note = s === "note";
      const kbd = s === "keyboard" || s === "composer" || s === "note";
      return `<div class="mobile-screen ${kbd ? "kbd-open" : ""}" style="position:relative">
        ${top("Ana Castillo", "list")}
        <div style="padding:8px 12px;border-bottom:1px solid var(--desk-border);display:flex;gap:6px;flex-wrap:wrap">
          ${statusPill("open")}
          <span class="pill pill-muted">Maya</span>
          <span class="pill pill-sla-warn">SLA warn · 12m left</span>
        </div>
        <div class="mobile-body" style="padding:12px">${renderMessages(D().threadC1.slice(0, s === "ai" ? 5 : 8))}</div>
        ${
          s === "ai"
            ? `<div style="padding:8px;border-top:1px solid var(--desk-border)">${renderMessages([D().threadC1.find((m) => m.type === "ai-draft")])}</div>`
            : ""
        }
        <div class="mobile-composer">
          <div class="mode-toggle" style="margin-bottom:6px">
            <button class="${!note ? "active" : ""}" data-go="mobile/composer">Reply</button>
            <button class="${note ? "active note" : ""}" data-go="mobile/note">Note</button>
          </div>
          <div class="recipient-line">${note ? "<strong>Internal only</strong>" : "<strong>To</strong> ana.castillo@example.test"}</div>
          <textarea style="width:100%;min-height:56px;border:1px solid var(--desk-border);border-radius:8px;padding:8px" placeholder="${note ? "Internal note…" : "Reply…"}">${esc(note ? state.noteDraft : state.draft)}</textarea>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn btn-sm" data-go="mobile/attach">Attach</button>
            <button class="btn btn-sm" data-go="mobile/ai">AI draft</button>
            <button class="btn btn-sm btn-primary" style="margin-left:auto" data-action="send">Send</button>
          </div>
          ${s === "attach" ? `<div class="attach-chip" style="margin-top:6px">📎 photo.jpg</div>` : ""}
        </div>
        ${kbd ? `<div class="fake-keyboard">Software keyboard open · send stays above · draft kept on back</div>` : ""}
        ${s === "context" ? "" : ""}
      </div>`;
    }
    if (s === "context") {
      return `<div class="mobile-screen" style="position:relative">
        ${top("Ana Castillo", "thread")}
        <div class="mobile-body" style="padding:12px;opacity:.5">${renderMessages(D().threadC1.slice(0, 3))}</div>
        <div class="sheet">
          <div class="sheet-handle"></div>
          <div style="padding:0 12px 16px;overflow:auto">${contextPanel("rich").replace("pane pane-context", "").replace("aside", "div")}</div>
        </div>
      </div>`;
    }
    if (s === "back") {
      return `<div class="mobile-screen">${top("Needs you", "queues")}
        <div class="alert alert-info" style="margin:8px">Draft preserved after back · scroll position restored (simulated)</div>
        <div class="mobile-body">${D()
          .conversations.map((c) => `<button class="conv-row" data-go="mobile/thread"><span class="avatar avatar-sm">${channelIcon(c.channel)}</span><span class="conv-name">${esc(c.customer)}</span></button>`)
          .join("")}</div></div>`;
    }
    // step picker
    return `<div class="mobile-screen">${top("Mobile steps")}
      <div class="mobile-body" style="padding:12px;display:flex;flex-direction:column;gap:8px">
        ${["queues", "list", "thread", "context", "keyboard", "attach", "note", "ai", "back"]
          .map((x, i) => `<button class="btn" data-go="mobile/${x}">${i + 1}. ${x}</button>`)
          .join("")}
        <p class="field-hint">Must not: cover composer, hide send, nested scroll traps, stacked modals, lose draft, remove status.</p>
      </div></div>`;
  }

  function renderJourneys() {
    const items = [
      ["1", "Agent opens new conversation and replies", "inbox → thread → composer/reply"],
      ["2", "Switch reply → internal note", "composer/note"],
      ["3", "Canned reply with variables", "composer/canned"],
      ["4", "AI drafts; agent edits and approves", "thread/c1 → Approve"],
      ["5", "AI lacks confidence → escalate", "composer/escalate"],
      ["6", "Customer sends attachment", "thread attachment ok"],
      ["7", "Attachment rejected", "composer/attach_fail"],
      ["8", "Message fails; retry without duplication", "composer/fail"],
      ["9", "Two agents open same conversation", "presence line in thread"],
      ["10", "One typing while another attempts reply", "typing + presence"],
      ["11", "Assign conversation", "cmdk/assign"],
      ["12", "Status → waiting for customer", "cmdk/status"],
      ["13", "Snooze", "cmdk/snooze"],
      ["14", "Customer replies after resolution", "inbox c5 then reopen note"],
      ["15", "Escalate to specialist", "escalation event"],
      ["16", "Merge duplicates", "empty/unsupported proposed"],
      ["17", "Search by name/email/booking/payment", "cmdk/search"],
      ["18", "Support agent attempts owner-only action", "role=agent → cmdk hq"],
      ["19", "Unverified guest attempts previous history", "role=guest → context/empty"],
      ["20", "Session expires while composing", "login/expired"],
      ["21", "Realtime interrupted", "empty/realtime"],
      ["22", "Mobile reply with keyboard open", "mobile/keyboard"],
      ["23", "Context with no bookings/payments", "context/empty"],
      ["24", "Context with several bookings/payments", "context/rich"],
      ["25", "Message from agency-managed source", "thread/c2 hub badge"],
    ];
    return `<div class="hub"><h1>25 journeys</h1><p class="lede">Each journey is reachable in the prototype. Full documentation lives in <code>01-design.md</code>.</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${items
          .map(
            ([n, title, path]) =>
              `<div class="hub-card" style="display:flex;gap:12px;align-items:flex-start"><span class="code">${n}</span><div><h3 style="margin:0">${title}</h3><p>${path}</p></div></div>`
          )
          .join("")}
      </div></div>`;
  }

  function renderUnavailable(kind) {
    return `<div class="state-panel" style="height:100%"><span class="sim-tag">Labelled unavailable</span><h3>${esc(kind)} destination</h3><p>Deep link is designed; Phase 1 wires real records. Not a dead control — explicitly unavailable in this mockup.</p><button class="btn btn-primary" data-go="inbox/needs_you">Back to inbox</button></div>`;
  }

  function renderRoute() {
    const { parts } = parseHash();
    const [root, a, b] = parts;
    switch (root) {
      case "hub":
        return renderHub();
      case "login":
        return renderLogin(a || "default");
      case "inbox":
        return renderInbox(a || "needs_you");
      case "thread":
        return renderThread(a || "c1");
      case "composer":
        return renderComposer(a || "reply");
      case "context":
        return renderContext(a || "rich");
      case "cmdk":
        return renderCmdk(a || "default");
      case "empty":
        return renderEmpty(a || "inbox");
      case "mobile":
        state.viewport = "mobile";
        return renderMobile(a || "queues");
      case "insights":
        return renderInsights();
      case "journeys":
        return renderJourneys();
      case "unavailable":
        return renderUnavailable(a || "record");
      default:
        return renderHub();
    }
  }

  function bind() {
    $("#themeSel")?.addEventListener("change", (e) => {
      setTheme(e.target.value);
      render();
    });
    $("#vpSel")?.addEventListener("change", (e) => setViewport(e.target.value));
    $("#roleSel")?.addEventListener("change", (e) => {
      state.role = e.target.value;
      localStorage.setItem("desk-mock-role", state.role);
      render();
    });

    document.querySelectorAll("[data-go]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const target = el.getAttribute("data-go");
        if (target.startsWith("mobile/")) state.viewport = "mobile";
        if (target.startsWith("inbox/") || target.startsWith("thread/") || target.startsWith("composer/")) {
          /* keep viewport */
        }
        go(target);
      });
    });

    document.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const action = el.getAttribute("data-action");
        if (action === "toggle-context") {
          state.contextCollapsed = !state.contextCollapsed;
          render();
        } else if (action === "composer-mode") {
          const input = $("#composerInput");
          if (input) {
            if (state.composerMode === "note") state.noteDraft = input.value;
            else state.draft = input.value;
          }
          state.composerMode = el.getAttribute("data-mode");
          go(`composer/${state.composerMode}`);
        } else if (action === "send") {
          const input = $("#composerInput");
          if (input) {
            if (state.composerMode === "note") state.noteDraft = input.value;
            else state.draft = input.value;
          }
          toast(state.composerMode === "note" ? "Internal note added (simulated)" : "Reply sent (simulated · no email)");
        } else if (action === "retry-send") {
          toast("Retry queued with same idempotency key (simulated)");
        } else if (action === "approve-ai") {
          toast("AI draft approved & sent (simulated)");
        } else if (action === "edit-ai") {
          state.draft = "Hi Ana — thanks for writing. I can resend the receipt for booking BK-10422…";
          go("composer/reply");
        } else if (action === "reject-ai") {
          toast("AI draft rejected · card retired (simulated)");
        } else if (action === "insert-canned") {
          state.draft = "Hi Ana — I’ve resent the receipt for BK-10422 to ana.castillo@example.test.";
          go("composer/reply");
          toast("Canned reply inserted with variables (simulated)");
        } else if (action === "toast") {
          toast(el.getAttribute("data-msg") || "Simulated");
        } else if (action === "open-hq") {
          toast("Would open Platform Admin in new tab (simulated · owner only)");
        } else if (action === "close-cmdk") {
          go("inbox/needs_you");
        } else if (action === "cmdk-run") {
          const id = el.getAttribute("data-id");
          if (id === "hq" && state.role !== "owner") {
            toast("Blocked · owner only");
            return;
          }
          toast(`Ran “${id}” (simulated)`);
          if (id === "note") go("composer/note");
          else if (id === "canned") go("composer/canned");
          else if (id === "search") go("cmdk/search");
          else go("inbox/needs_you");
        }
      });
    });

    $("#composerInput")?.addEventListener("input", (e) => {
      if (state.composerMode === "note") state.noteDraft = e.target.value;
      else state.draft = e.target.value;
    });

    $("#cmdkInput")?.addEventListener("input", (e) => {
      state.cmdkFilter = e.target.value;
      render();
      const input = $("#cmdkInput");
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });

    document.addEventListener("keydown", onKey, { once: true });
  }

  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      go("cmdk/default");
    } else if (e.key === "Escape") {
      if (parseHash().parts[0] === "cmdk") go("inbox/needs_you");
    }
    // re-bind after render
  }

  function render() {
    const { params } = parseHash();
    applyRouteParams(params);
    document.documentElement.setAttribute("data-theme", state.theme);
    const root = document.getElementById("app");
    root.innerHTML = protoChrome(renderRoute());
    bind();
  }

  window.addEventListener("hashchange", render);
  setTheme(state.theme);
  render();
})();
