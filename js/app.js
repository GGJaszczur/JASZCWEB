window.JC = {
  sb: null,
  user: null,
  profile: null,
  community: null,
  notificationSub: null,

  initClient() {
    const cfg = window.JASZCWEB_CONFIG;
    if (!cfg?.supabaseUrl || !cfg?.supabasePublishableKey || cfg.supabaseUrl.includes("YOUR_")) {
      this.showSetupError();
      return false;
    }
    this.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
    return true;
  },

  async requireAuth() {
    if (!this.sb) return null;
    const { data: { session }, error } = await this.sb.auth.getSession();
    if (error || !session) {
      location.href = "index.html";
      return null;
    }

    this.user = session.user;

    const { data: profile } = await this.sb
      .from("profiles")
      .select("*")
      .eq("id", this.user.id)
      .maybeSingle();

    if (profile) {
      this.profile = profile;
    } else {
      const displayName = this.user.user_metadata?.display_name || this.user.email?.split("@")[0] || "User";
      const username = (this.user.user_metadata?.username || displayName)
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 24) || `user_${this.user.id.slice(0, 8)}`;
      const { data: createdProfile } = await this.sb
        .from("profiles")
        .upsert({ id: this.user.id, display_name: displayName, username }, { onConflict: "id" })
        .select("*")
        .single();
      this.profile = createdProfile || { display_name: displayName, username };
    }

    this.applyProfileTheme();
    this.paintUser();
    this.paintSidebar();
    this.watchNotifications();
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
      alert(error?.message || "Community not found or you are not a member.");
      location.href = "dashboard.html";
      return null;
    }

    this.community = data;
    document.documentElement.style.setProperty("--community-accent", data.accent_color || "#c8ff38");
    document.documentElement.style.setProperty("--community-banner", data.banner_color || "#111318");
    this.paintSidebar();
    return data;
  },

  applyProfileTheme() {
    const theme = this.profile?.theme || "dark";
    document.body.dataset.theme = theme;
    document.documentElement.style.setProperty("--accent", this.profile?.accent_color || "#c8ff38");
  },

  paintUser() {
    const name = this.profile?.display_name || "User";
    const initials = name
      .split(/\s+/)
      .map(x => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const top = document.getElementById("topUser");
    if (top) {
      const avatar = this.profile?.avatar_url
        ? `<img class="top-avatar-image" src="${escapeHTML(this.profile.avatar_url)}" alt="">`
        : escapeHTML(initials);
      top.innerHTML = `
        <a class="top-profile" href="profile.html">
          <span class="user-dot profile-user-image">${avatar}</span>
          <span>${escapeHTML(name)}</span>
        </a>
      `;
    }
  },

  paintSidebar() {
    const el = document.getElementById("sidebar");
    if (!el) return;

    const c = this.community;
    const q = c ? `?community=${encodeURIComponent(c.id)}` : "";

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
        ${c ? `
          <div class="side-label">COMMUNITY</div>
          <a href="community.html${q}" class="side-link"># <span>Chat</span></a>
          <a href="members.html${q}" class="side-link">♙ <span>Members</span></a>
          <a href="settings.html${q}" class="side-link">⚙ <span>Settings</span></a>
        ` : ""}
        <div class="side-label">PERSONAL</div>
        <a href="messages.html" class="side-link">◇ <span>Messages</span></a>
        <a href="notifications.html" class="side-link notification-link">♢ <span>Notifications</span><b id="notificationCount" class="nav-count hidden">0</b></a>
        <div class="side-label">ACCOUNT</div>
        <a href="profile.html" class="side-link">● <span>Profile</span></a>
      </nav>
      <div class="sidebar-bottom">
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

  async watchNotifications() {
    if (!this.sb || !this.user || !document.getElementById("notificationCount")) return;

    const paint = async () => {
      const { count } = await this.sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", this.user.id)
        .is("read_at", null);

      const el = document.getElementById("notificationCount");
      if (el) {
        el.textContent = count || 0;
        el.classList.toggle("hidden", !(count > 0));
      }
    };

    await paint();
    if (this.notificationSub) await this.sb.removeChannel(this.notificationSub);
    this.notificationSub = this.sb
      .channel(`notify-count:${this.user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${this.user.id}`
      }, paint)
      .subscribe();
  },

  showSetupError() {
    const t = document.querySelector("h1");
    if (!t) return;
    const box = document.createElement("div");
    box.className = "setup-warning";
    box.innerHTML = `<strong>JASZCWEB isn't connected yet.</strong><p>Open <code>js/config.js</code> and add your Supabase URL and publishable key.</p>`;
    t.parentElement?.appendChild(box);
  },

  async boot(withCommunity = false) {
    if (!this.initClient()) return false;
    const user = await this.requireAuth();
    if (!user) return false;
    if (withCommunity) await this.loadCommunity();
    return true;
  }
};

function escapeHTML(v = "") {
  return String(v)
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
