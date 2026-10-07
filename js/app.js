window.JC = {
  sb: null,
  user: null,
  profile: null,
  community: null,

  initClient() {
    const cfg = window.JASZCWEB_CONFIG;

    if (!cfg?.supabaseUrl || !cfg?.supabasePublishableKey) {
      this.showSetupError();
      return false;
    }

    if (!window.supabase) {
      this.showSetupError("Supabase library did not load.");
      return false;
    }

    this.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
    return true;
  },

  async requireAuth() {
    if (!this.sb) return null;

    const { data: { session } } = await this.sb.auth.getSession();

    if (!session) {
      location.href = "index.html";
      return null;
    }

    this.user = session.user;

    const { data: profile } = await this.sb
      .from("profiles")
      .select("*")
      .eq("id", this.user.id)
      .single();

    this.profile = profile || {
      display_name: this.user.email?.split("@")[0] || "User",
      username: this.user.email?.split("@")[0] || "user",
      avatar_url: null
    };

    this.paintUser();
    return this.user;
  },

  async loadCommunity() {
    const id = new URLSearchParams(location.search).get("community");

    if (!id) {
      location.href = "dashboard.html";
      return null;
    }

    const { data, error } = await this.sb
      .from("communities")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      location.href = "dashboard.html";
      return null;
    }

    this.community = data;
    document.documentElement.style.setProperty("--accent", data.accent_color || "#c8ff38");
    this.paintSidebar();
    return data;
  },

  getInitials() {
    const name = this.profile?.display_name || "User";
    return name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
  },

  paintUser() {
    const top = document.getElementById("topUser");
    if (!top) return;

    const name = this.profile?.display_name || "User";
    const avatar = this.profile?.avatar_url;

    top.innerHTML = `
      <a class="top-profile" href="profile.html">
        ${avatar ? `
          <img class="top-user-avatar" src="${escapeHTML(avatar)}" alt="">
        ` : `
          <span class="top-user-avatar avatar-fallback">${escapeHTML(this.getInitials())}</span>
        `}
        <span>${escapeHTML(name)}</span>
      </a>
    `;
  },

  paintSidebar() {
    const el = document.getElementById("sidebar");
    if (!el) return;

    const c = this.community;
    const communityQuery = c ? `?community=${encodeURIComponent(c.id)}` : "";
    const name = this.profile?.display_name || "User";
    const username = this.profile?.username || "user";
    const avatar = this.profile?.avatar_url;

    el.innerHTML = `
      <div class="sidebar-brand">
        <a class="brand" href="dashboard.html">JASZC<span>WEB</span></a>
      </div>

      <a class="workspace-card" href="dashboard.html">
        <div class="community-logo">${escapeHTML((c?.name || "J")[0].toUpperCase())}</div>
        <div>
          <strong>${escapeHTML(c?.name || "Your communities")}</strong>
          <small>${c ? "Community" : "Dashboard"}</small>
        </div>
        <span>⌄</span>
      </a>

      <nav class="side-nav">
        <a href="dashboard.html" class="side-link">⌂ <span>Dashboard</span></a>
        <a href="dm.html" class="side-link">✉ <span>Direct messages</span></a>

        ${c ? `
          <div class="side-label">COMMUNITY</div>
          <a href="community.html${communityQuery}" class="side-link"># <span>Chat</span></a>
          <a href="members.html${communityQuery}" class="side-link">♙ <span>Members</span></a>
          <a href="settings.html${communityQuery}" class="side-link">⚙ <span>Settings</span></a>
        ` : ""}

        ${this.profile?.is_admin ? `<div class="side-label">PLATFORM</div><a href="admin.html" class="side-link">◆ <span>Admin</span></a>` : ""}

        <div class="side-label">ACCOUNT</div>
        <a href="profile.html" class="side-link">● <span>Profile</span></a>
      </nav>

      <div class="sidebar-bottom">
        <a class="sidebar-user" href="profile.html">
          ${avatar ? `<img class="sidebar-user-avatar" src="${escapeHTML(avatar)}" alt="">` : `<span class="sidebar-user-avatar avatar-fallback">${escapeHTML(this.getInitials())}</span>`}
          <div class="sidebar-user-info">
            <strong>${escapeHTML(name)}</strong>
            <small>@${escapeHTML(username)}</small>
          </div>
        </a>

        <button id="signOutSide" class="side-signout">↪ <span>Sign out</span></button>
      </div>
    `;

    el.querySelector("#signOutSide")?.addEventListener("click", async () => {
      await this.sb.auth.signOut();
      location.href = "index.html";
    });

    document.getElementById("mobileToggle")?.addEventListener("click", () => {
      el.classList.toggle("open");
    });
  },


  showBlockedAccount(message) {
    document.body.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;background:#08090c;color:#fff;font-family:system-ui;text-align:center;padding:20px"><div><div style="font-size:56px">🔒</div><h1>Account unavailable</h1><p style="color:#999;line-height:1.6">${escapeHTML(message)}</p><a href="index.html" style="color:#c8ff38">Return to login</a></div></div>`;
  },

  showSetupError(message = "Open js/config.js and check your Supabase settings.") {
    const root = document.querySelector("main") || document.body;
    if (document.querySelector(".setup-warning")) return;

    const box = document.createElement("div");
    box.className = "setup-warning";
    box.innerHTML = `<strong>JASZCWEB connection problem.</strong><p>${escapeHTML(message)}</p>`;
    root.prepend(box);
  },

  async boot(withCommunity = false) {
    if (!this.initClient()) return false;
    const user = await this.requireAuth();
    if (!user) return false;
    if (withCommunity) await this.loadCommunity();
    else this.paintSidebar();
    return true;
  }
};

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openModal(id) {
  document.getElementById(id)?.classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

document.addEventListener("click", event => {
  const close = event.target.closest("[data-close]");
  if (close) closeModal(close.dataset.close);
  if (event.target.classList.contains("modal")) event.target.classList.add("hidden");
});
