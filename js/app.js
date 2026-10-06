window.JC = {
  sb: null,
  user: null,
  profile: null,
  community: null,

  initClient() {
    const cfg = window.JASZCWEB_CONFIG;

    if (
      !cfg?.supabaseUrl ||
      !cfg?.supabasePublishableKey ||
      cfg.supabaseUrl.includes("YOUR_") ||
      cfg.supabasePublishableKey.includes("YOUR_")
    ) {
      this.showSetupError(
        "Check js/config.js. Your Supabase URL or publishable key is missing."
      );
      return false;
    }

    if (!window.supabase) {
      this.showSetupError(
        "Supabase library did not load."
      );
      return false;
    }

    this.sb = window.supabase.createClient(
      cfg.supabaseUrl,
      cfg.supabasePublishableKey
    );

    return true;
  },

  async requireAuth() {
    if (!this.sb) return null;

    const {
      data: { session },
      error
    } = await this.sb.auth.getSession();

    if (error) {
      console.error("Session error:", error);
      return null;
    }

    if (!session) {
      window.location.href = "index.html";
      return null;
    }

    this.user = session.user;

    const { data: profile, error: profileError } =
      await this.sb
        .from("profiles")
        .select("*")
        .eq("id", this.user.id)
        .single();

    if (profileError) {
      console.warn("Profile could not be loaded:", profileError);
    }

    this.profile = profile || {
      display_name:
        this.user.email?.split("@")[0] || "User",

      username:
        this.user.email?.split("@")[0] || "user",

      avatar_url: null
    };

    this.paintUser();

    return this.user;
  },

  async loadCommunity() {
    const id =
      new URLSearchParams(location.search).get("community");

    if (!id) {
      window.location.href = "dashboard.html";
      return null;
    }

    const { data, error } =
      await this.sb
        .from("communities")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) {
      console.error("Community error:", error);
      window.location.href = "dashboard.html";
      return null;
    }

    this.community = data;

    document.documentElement.style.setProperty(
      "--accent",
      data.accent_color || "#c8ff38"
    );

    this.paintSidebar();

    return data;
  },

  getInitials() {
    const name =
      this.profile?.display_name || "User";

    return name
      .split(/\s+/)
      .map(part => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  },

  paintUser() {
    const topUser =
      document.getElementById("topUser");

    if (!topUser) return;

    const name =
      this.profile?.display_name || "User";

    const avatar =
      this.profile?.avatar_url;

    if (avatar) {
      topUser.innerHTML = `
        <a
          href="profile.html"
          class="top-profile"
          style="
            display:flex;
            align-items:center;
            gap:8px;
            text-decoration:none;
            color:inherit;
          "
        >
          <span
            style="
              width:32px !important;
              height:32px !important;
              min-width:32px !important;
              max-width:32px !important;
              min-height:32px !important;
              max-height:32px !important;
              display:block !important;
              overflow:hidden !important;
              border-radius:50% !important;
              flex:0 0 32px !important;
            "
          >
            <img
              src="${escapeHTML(avatar)}"
              alt=""
              width="32"
              height="32"
              style="
                width:32px !important;
                height:32px !important;
                min-width:32px !important;
                max-width:32px !important;
                min-height:32px !important;
                max-height:32px !important;
                display:block !important;
                object-fit:cover !important;
                object-position:center !important;
                border-radius:50% !important;
                overflow:hidden !important;
              "
            >
          </span>

          <span>
            ${escapeHTML(name)}
          </span>
        </a>
      `;
    } else {
      topUser.innerHTML = `
        <a
          href="profile.html"
          class="top-profile"
          style="
            display:flex;
            align-items:center;
            gap:8px;
            text-decoration:none;
            color:inherit;
          "
        >
          <span
            style="
              width:32px;
              height:32px;
              min-width:32px;
              max-width:32px;
              min-height:32px;
              max-height:32px;
              display:grid;
              place-items:center;
              border-radius:50%;
              background:var(--accent);
              color:#080900;
              font-size:9px;
              font-weight:900;
              flex:0 0 32px;
            "
          >
            ${escapeHTML(this.getInitials())}
          </span>

          <span>
            ${escapeHTML(name)}
          </span>
        </a>
      `;
    }
  },

  paintSidebar() {
    const sidebar =
      document.getElementById("sidebar");

    if (!sidebar) return;

    const c = this.community;

    const communityQuery = c
      ? `?community=${encodeURIComponent(c.id)}`
      : "";

    const name =
      this.profile?.display_name || "User";

    const username =
      this.profile?.username || "user";

    const avatar =
      this.profile?.avatar_url;

    let avatarHTML;

    if (avatar) {
      avatarHTML = `
        <span
          style="
            width:34px !important;
            height:34px !important;
            min-width:34px !important;
            max-width:34px !important;
            min-height:34px !important;
            max-height:34px !important;
            display:block !important;
            overflow:hidden !important;
            border-radius:50% !important;
            flex:0 0 34px !important;
          "
        >
          <img
            src="${escapeHTML(avatar)}"
            alt=""
            width="34"
            height="34"
            style="
              width:34px !important;
              height:34px !important;
              min-width:34px !important;
              max-width:34px !important;
              min-height:34px !important;
              max-height:34px !important;
              display:block !important;
              object-fit:cover !important;
              object-position:center !important;
              border-radius:50% !important;
              overflow:hidden !important;
            "
          >
        </span>
      `;
    } else {
      avatarHTML = `
        <span
          style="
            width:34px;
            height:34px;
            min-width:34px;
            max-width:34px;
            min-height:34px;
            max-height:34px;
            display:grid;
            place-items:center;
            border-radius:50%;
            background:var(--accent);
            color:#080900;
            font-size:9px;
            font-weight:900;
            flex:0 0 34px;
          "
        >
          ${escapeHTML(this.getInitials())}
        </span>
      `;
    }

    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <a
          class="brand"
          href="dashboard.html"
        >
          JASZC<span>WEB</span>
        </a>
      </div>

      <a
        class="workspace-card"
        href="dashboard.html"
      >
        <div class="community-logo">
          ${escapeHTML(
            (c?.name || "J")[0].toUpperCase()
          )}
        </div>

        <div>
          <strong>
            ${escapeHTML(
              c?.name || "Your communities"
            )}
          </strong>

          <small>
            ${c ? "Community" : "Dashboard"}
          </small>
        </div>

        <span>⌄</span>
      </a>

      <nav class="side-nav">

        <a
          href="dashboard.html"
          class="side-link"
        >
          ⌂ <span>Dashboard</span>
        </a>

        <a
          href="dm.html"
          class="side-link"
        >
          ✉ <span>Direct messages</span>
        </a>

        ${
          c
            ? `
              <div class="side-label">
                COMMUNITY
              </div>

              <a
                href="community.html${communityQuery}"
                class="side-link"
              >
                # <span>Chat</span>
              </a>

              <a
                href="members.html${communityQuery}"
                class="side-link"
              >
                ♙ <span>Members</span>
              </a>

              <a
                href="settings.html${communityQuery}"
                class="side-link"
              >
                ⚙ <span>Settings</span>
              </a>
            `
            : ""
        }

        <div class="side-label">
          ACCOUNT
        </div>

        <a
          href="profile.html"
          class="side-link"
        >
          ● <span>Profile</span>
        </a>

      </nav>

      <div class="sidebar-bottom">

        <a
          href="profile.html"
          class="sidebar-user"
          style="
            display:flex;
            align-items:center;
            gap:9px;
            width:100%;
            padding:10px 7px;
            border-radius:8px;
            text-decoration:none;
            color:inherit;
            overflow:hidden;
          "
        >

          ${avatarHTML}

          <div
            style="
              min-width:0;
              flex:1;
              overflow:hidden;
            "
          >

            <strong
              style="
                display:block;
                font-size:11px;
                white-space:nowrap;
                overflow:hidden;
                text-overflow:ellipsis;
              "
            >
              ${escapeHTML(name)}
            </strong>

            <small
              style="
                display:block;
                font-size:9px;
                color:var(--muted);
                margin-top:3px;
                white-space:nowrap;
                overflow:hidden;
                text-overflow:ellipsis;
              "
            >
              @${escapeHTML(username)}
            </small>

          </div>

        </a>

        <button
          id="signOutSide"
          class="side-signout"
        >
          ↪ <span>Sign out</span>
        </button>

      </div>
    `;

    document
      .getElementById("signOutSide")
      ?.addEventListener(
        "click",
        async () => {
          if (this.sb) {
            await this.sb.auth.signOut();
          }

          window.location.href =
            "index.html";
        }
      );

    document
      .getElementById("mobileToggle")
      ?.addEventListener(
        "click",
        () => {
          sidebar.classList.toggle(
            "open"
          );
        }
      );
  },

  showSetupError(message) {
    const root =
      document.querySelector("main") ||
      document.body;

    if (
      document.querySelector(
        ".setup-warning"
      )
    ) {
      return;
    }

    const box =
      document.createElement("div");

    box.className =
      "setup-warning";

    box.innerHTML = `
      <strong>
        JASZCWEB connection problem.
      </strong>

      <p>
        ${escapeHTML(
          message ||
          "Check your Supabase configuration."
        )}
      </p>
    `;

    root.prepend(box);
  },

  async boot(withCommunity = false) {
    if (!this.initClient()) {
      return false;
    }

    const user =
      await this.requireAuth();

    if (!user) {
      return false;
    }

    if (withCommunity) {
      await this.loadCommunity();
    } else {
      this.paintSidebar();
    }

    return true;
  }
};


function escapeHTML(value = "") {
  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


function openModal(id) {
  document
    .getElementById(id)
    ?.classList.remove(
      "hidden"
    );
}


function closeModal(id) {
  document
    .getElementById(id)
    ?.classList.add(
      "hidden"
    );
}


document.addEventListener(
  "click",
  event => {

    const close =
      event.target.closest(
        "[data-close]"
      );

    if (close) {
      closeModal(
        close.dataset.close
      );
    }

    if (
      event.target.classList.contains(
        "modal"
      )
    ) {
      event.target.classList.add(
        "hidden"
      );
    }
  }
);
