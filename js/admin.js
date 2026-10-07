let adminUsers = [];
let adminCommunities = [];
let adminMessages = [];
let adminAnnouncements = [];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    injectAdminButtonStyles();

    if (!JC.initClient()) {
      showFatalError("JASZCWEB client could not initialize.");
      return;
    }

    const user = await JC.requireAuth();

    if (!user) {
      return;
    }

    const allowed = await checkAdminAccess();

    if (!allowed) {
      document.body.innerHTML = `
        <div style="
          min-height:100vh;
          display:grid;
          place-items:center;
          background:#08090c;
          color:#fff;
          font-family:system-ui;
          padding:20px;
          text-align:center;
        ">
          <div>
            <div style="font-size:56px;">🔒</div>

            <h1>Admin access required</h1>

            <p style="color:#999;">
              This account is not a platform administrator.
            </p>

            <a
              href="dashboard.html"
              style="color:#c8ff38;"
            >
              Back to JASZCWEB
            </a>
          </div>
        </div>
      `;

      return;
    }

    setupAdminHeader();
    setupNavigation();
    setupLogout();
    setupSearch();
    setupRefreshButtons();
    setupAnnouncements();

    /*
      Load every section independently.

      This is important:
      if one section has a database problem,
      the other sections still load.
    */
    await refreshStats();
    await loadUsers();
    await loadCommunities();
    await loadMessages();
    await loadAnnouncements();

  } catch (error) {
    console.error(
      "JASZCWEB Admin initialization failed:",
      error
    );

    showFatalError(
      error?.message ||
      "The admin panel failed to initialize."
    );
  }
});


/* =========================================================
   ACCESS
========================================================= */

async function checkAdminAccess() {
  const { data, error } = await JC.sb
    .from("profiles")
    .select("is_admin,is_banned")
    .eq("id", JC.user.id)
    .single();

  if (error) {
    console.error(
      "Admin access check:",
      error
    );

    return false;
  }

  return (
    data?.is_admin === true &&
    data?.is_banned !== true
  );
}


/* =========================================================
   HEADER / NAV
========================================================= */

function setupAdminHeader() {
  const adminUser =
    document.getElementById(
      "adminUser"
    );

  if (adminUser) {
    adminUser.textContent =
      `${JC.profile?.display_name || "Admin"} · Administrator`;
  }

  const email =
    document.getElementById(
      "systemEmail"
    );

  if (email) {
    email.textContent =
      JC.user?.email || "—";
  }
}


function setupNavigation() {
  document
    .querySelectorAll(
      ".admin-nav,.admin-action"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          showSection(
            button.dataset.section
          );
        }
      );
    });
}


function showSection(section) {
  document
    .querySelectorAll(
      ".admin-section"
    )
    .forEach(sectionEl => {
      sectionEl.classList.toggle(
        "active",
        sectionEl.id ===
          `${section}Section`
      );
    });

  document
    .querySelectorAll(
      ".admin-nav"
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.section ===
          section
      );
    });

  const titles = {
    overview: "Overview",
    users: "Users",
    communities: "Communities",
    messages: "Messages",
    announcements: "Announcements",
    system: "System"
  };

  const title =
    document.getElementById(
      "adminPageTitle"
    );

  if (title) {
    title.textContent =
      titles[section] ||
      "Overview";
  }
}


function setupLogout() {
  document
    .getElementById(
      "adminLogout"
    )
    ?.addEventListener(
      "click",
      async () => {
        await JC.sb.auth.signOut();
        location.href =
          "index.html";
      }
    );
}


function setupSearch() {
  document
    .getElementById(
      "userSearch"
    )
    ?.addEventListener(
      "input",
      renderUsers
    );

  document
    .getElementById(
      "communitySearch"
    )
    ?.addEventListener(
      "input",
      renderCommunities
    );
}


function setupRefreshButtons() {
  document
    .getElementById(
      "refreshMessages"
    )
    ?.addEventListener(
      "click",
      async () => {
        await loadMessages();
      }
    );
}


/* =========================================================
   STATS
========================================================= */

async function refreshStats() {
  const results =
    await Promise.allSettled([
      countRows("profiles"),
      countRows("communities"),
      countRows("messages"),
      countRows("direct_messages")
    ]);

  const users =
    getSettledValue(
      results[0],
      "—"
    );

  const communities =
    getSettledValue(
      results[1],
      "—"
    );

  const messages =
    getSettledValue(
      results[2],
      "—"
    );

  const dms =
    getSettledValue(
      results[3],
      "—"
    );

  setText(
    "statUsers",
    users
  );

  setText(
    "statCommunities",
    communities
  );

  setText(
    "statMessages",
    messages
  );

  setText(
    "statDMs",
    dms
  );
}


async function countRows(table) {
  const {
    count,
    error
  } = await JC.sb
    .from(table)
    .select("*", {
      count: "exact",
      head: true
    });

  if (error) {
    console.error(
      `Count ${table}:`,
      error
    );

    return "—";
  }

  return count ?? 0;
}


/* =========================================================
   USERS
========================================================= */

async function loadUsers() {
  const {
    data,
    error
  } = await JC.sb.rpc(
    "admin_list_users"
  );

  if (error) {
    console.error(
      "Admin users:",
      error
    );

    showError(
      "usersTable",
      error.message
    );

    return;
  }

  adminUsers =
    Array.isArray(data)
      ? data
      : [];

  renderUsers();
}


function renderUsers() {
  const box =
    document.getElementById(
      "usersTable"
    );

  if (!box) {
    return;
  }

  const q = (
    document.getElementById(
      "userSearch"
    )?.value || ""
  )
    .trim()
    .toLowerCase();

  const users =
    adminUsers.filter(
      user => {
        const name =
          (
            user.display_name ||
            ""
          ).toLowerCase();

        const username =
          (
            user.username ||
            ""
          ).toLowerCase();

        return (
          !q ||
          name.includes(q) ||
          username.includes(q)
        );
      }
    );

  box.innerHTML = `
    <div class="admin-table-row head">
      <span>User</span>
      <span>Username</span>
      <span>Status</span>
      <span>Role</span>
      <span>Actions</span>
    </div>

    ${
      users.length
        ? users.map(
            user =>
              renderUserRow(
                user
              )
          ).join("")
        : `
          <div class="admin-table-row">
            <span>
              No users found.
            </span>
          </div>
        `
    }
  `;

  box
    .querySelectorAll(
      "[data-user-action]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          runUserAction(
            button.dataset
              .userAction,
            button.dataset.id
          );
        }
      );
    });
}


function renderUserRow(user) {
  const suspended =
    user.suspended_until &&
    new Date(
      user.suspended_until
    ) > new Date();

  let status = "";

  if (user.is_banned) {
    status = `
      <span
        style="color:#ff6666;"
      >
        BANNED
      </span>
    `;
  } else if (suspended) {
    status = `
      <span
        style="color:#ffd166;"
      >
        SUSPENDED
      </span>
    `;
  } else {
    status = `
      <span
        style="color:#52e0a0;"
      >
        ACTIVE
      </span>
    `;
  }

  const role =
    user.is_admin
      ? `
        <span
          style="color:#c8ff38;"
        >
          ADMIN
        </span>
      `
      : "USER";

  const self =
    user.id === JC.user.id;

  return `
    <div class="admin-table-row">

      <span>
        <strong>
          ${escapeHTML(
            user.display_name ||
            "User"
          )}
        </strong>

        <small>
          @${escapeHTML(
            user.username ||
            "user"
          )}
        </small>
      </span>

      <span>
        ${escapeHTML(
          user.username ||
          "user"
        )}
      </span>

      <span>
        ${status}
      </span>

      <span>
        ${role}
      </span>

      <span
        style="
          display:flex;
          gap:5px;
          flex-wrap:wrap;
        "
      >

        ${
          user.is_admin
            ? `
              <button
                class="admin-inline-btn"
                data-user-action="demote"
                data-id="${user.id}"
              >
                Remove admin
              </button>
            `
            : `
              <button
                class="admin-inline-btn accent"
                data-user-action="promote"
                data-id="${user.id}"
              >
                Make admin
              </button>
            `
        }

        ${
          self
            ? ""
            : suspended
              ? `
                <button
                  class="admin-inline-btn"
                  data-user-action="unsuspend"
                  data-id="${user.id}"
                >
                  Unsuspend
                </button>
              `
              : `
                <button
                  class="admin-inline-btn"
                  data-user-action="suspend"
                  data-id="${user.id}"
                >
                  Suspend
                </button>
              `
        }

        ${
          self
            ? ""
            : user.is_banned
              ? `
                <button
                  class="admin-inline-btn accent"
                  data-user-action="unban"
                  data-id="${user.id}"
                >
                  Unban
                </button>
              `
              : `
                <button
                  class="admin-inline-btn danger"
                  data-user-action="ban"
                  data-id="${user.id}"
                >
                  Ban
                </button>
              `
        }

      </span>
    </div>
  `;
}


async function runUserAction(
  action,
  userId
) {
  const labels = {
    promote:
      "Make this user an administrator?",

    demote:
      "Remove administrator access?",

    suspend:
      "Suspend this user for 24 hours?",

    unsuspend:
      "Remove this user's suspension?",

    ban:
      "Ban this user?",

    unban:
      "Unban this user?"
  };

  if (
    !confirm(
      labels[action] ||
      "Confirm this action?"
    )
  ) {
    return;
  }

  const {
    data,
    error
  } = await JC.sb.rpc(
    "admin_manage_user",
    {
      p_user_id: userId,
      p_action: action
    }
  );

  if (error) {
    alert(error.message);
    return;
  }

  if (!data?.success) {
    alert(
      data?.message ||
      "Admin action failed."
    );

    return;
  }

  await loadUsers();
  await refreshStats();
}


/* =========================================================
   COMMUNITIES
========================================================= */

async function loadCommunities() {
  const {
    data,
    error
  } = await JC.sb.rpc(
    "admin_list_communities"
  );

  if (error) {
    console.error(
      "Admin communities:",
      error
    );

    showError(
      "communitiesTable",
      error.message
    );

    return;
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  adminCommunities =
    rows.map(
      community => ({
        ...community,

        owner: {
          display_name:
            community.owner_display_name ||
            "Unknown",

          username:
            community.owner_username ||
            "unknown"
        }
      })
    );

  renderCommunities();
}


function renderCommunities() {
  const box =
    document.getElementById(
      "communitiesTable"
    );

  if (!box) {
    return;
  }

  const q = (
    document.getElementById(
      "communitySearch"
    )?.value || ""
  )
    .trim()
    .toLowerCase();

  const communities =
    adminCommunities.filter(
      community => {
        const name =
          (
            community.name ||
            ""
          ).toLowerCase();

        const slug =
          (
            community.slug ||
            ""
          ).toLowerCase();

        return (
          !q ||
          name.includes(q) ||
          slug.includes(q)
        );
      }
    );

  box.innerHTML = `
    <div class="admin-table-row head">
      <span>Community</span>
      <span>Owner</span>
      <span>Status</span>
      <span>Created</span>
      <span>Actions</span>
    </div>

    ${
      communities.length
        ? communities.map(
            community =>
              renderCommunityRow(
                community
              )
          ).join("")
        : `
          <div class="admin-table-row">
            <span>
              No communities found.
            </span>
          </div>
        `
    }
  `;

  box
    .querySelectorAll(
      "[data-community-action]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          runCommunityAction(
            button.dataset
              .communityAction,
            button.dataset.id
          );
        }
      );
    });
}


function renderCommunityRow(
  community
) {
  return `
    <div class="admin-table-row">

      <span>
        <strong>
          ${escapeHTML(
            community.name ||
            "Unnamed community"
          )}
        </strong>

        <small>
          /${escapeHTML(
            community.slug ||
            ""
          )}
        </small>
      </span>

      <span>
        ${escapeHTML(
          community.owner
            ?.display_name ||
          "Unknown"
        )}
      </span>

      <span>
        ${
          community.is_locked
            ? `
              <span
                style="color:#ffd166;"
              >
                LOCKED
              </span>
            `
            : `
              <span
                style="color:#52e0a0;"
              >
                OPEN
              </span>
            `
        }
      </span>

      <span>
        ${formatDate(
          community.created_at
        )}
      </span>

      <span
        style="
          display:flex;
          gap:5px;
          flex-wrap:wrap;
        "
      >

        <button
          class="admin-inline-btn"
          data-community-action="toggle-lock"
          data-id="${community.id}"
        >
          ${
            community.is_locked
              ? "Unlock"
              : "Lock"
          }
        </button>

        <button
          class="admin-inline-btn danger"
          data-community-action="delete"
          data-id="${community.id}"
        >
          Delete
        </button>

      </span>

    </div>
  `;
}


async function runCommunityAction(
  action,
  communityId
) {
  let actualAction =
    action;

  if (
    action ===
    "toggle-lock"
  ) {
    const community =
      adminCommunities.find(
        item =>
          String(item.id) ===
          String(communityId)
      );

    actualAction =
      community?.is_locked
        ? "unlock"
        : "lock";
  }

  const message =
    actualAction ===
    "delete"
      ? "Delete this community and its content?"
      : actualAction ===
        "lock"
        ? "Lock this community?"
        : "Unlock this community?";

  if (!confirm(message)) {
    return;
  }

  const {
    data,
    error
  } = await JC.sb.rpc(
    "admin_manage_community",
    {
      p_community_id:
        communityId,

      p_action:
        actualAction
    }
  );

  if (error) {
    alert(error.message);
    return;
  }

  if (!data?.success) {
    alert(
      data?.message ||
      "Community action failed."
    );

    return;
  }

  await loadCommunities();
  await refreshStats();
}


/* =========================================================
   MESSAGES
========================================================= */

async function loadMessages() {
  const box =
    document.getElementById(
      "messagesTable"
    );

  if (!box) {
    return;
  }

  box.innerHTML = `
    <div
      class="admin-table-row"
    >
      <span>
        Loading messages...
      </span>
    </div>
  `;

  const {
    data,
    error
  } = await JC.sb
    .from("messages")
    .select(
      "id,content,created_at,user_id,channel_id"
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    )
    .limit(100);

  if (error) {
    console.error(
      "Admin messages:",
      error
    );

    showError(
      "messagesTable",
      error.message
    );

    return;
  }

  adminMessages =
    data || [];

  renderMessages();
}


function renderMessages() {
  const box =
    document.getElementById(
      "messagesTable"
    );

  if (!box) {
    return;
  }

  box.innerHTML = `
    <div class="admin-table-row head">
      <span>Message</span>
      <span>User</span>
      <span>Time</span>
      <span>Channel</span>
      <span>Action</span>
    </div>

    ${
      adminMessages.length
        ? adminMessages.map(
            message =>
              renderMessageRow(
                message
              )
          ).join("")
        : `
          <div class="admin-table-row">
            <span>
              No messages found.
            </span>
          </div>
        `
    }
  `;

  box
    .querySelectorAll(
      "[data-delete-message]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          deleteMessage(
            button.dataset
              .deleteMessage
          );
        }
      );
    });
}


function renderMessageRow(
  message
) {
  const userId =
    message.user_id
      ? String(
          message.user_id
        )
      : "Unknown";

  return `
    <div class="admin-table-row">

      <span>
        ${escapeHTML(
          (
            message.content ||
            ""
          ).slice(0, 120)
        )}
      </span>

      <span>
        ${escapeHTML(
          userId.slice(0, 8)
        )}...
      </span>

      <span>
        ${formatDate(
          message.created_at
        )}
      </span>

      <span>
        ${escapeHTML(
          message.channel_id ??
          "—"
        )}
      </span>

      <span>
        <button
          class="admin-inline-btn danger"
          data-delete-message="${message.id}"
        >
          Delete
        </button>
      </span>

    </div>
  `;
}


async function deleteMessage(
  messageId
) {
  if (
    !confirm(
      "Delete this message?"
    )
  ) {
    return;
  }

  const {
    data,
    error
  } = await JC.sb.rpc(
    "admin_delete_message",
    {
      p_message_id:
        Number(messageId)
    }
  );

  if (error) {
    alert(error.message);
    return;
  }

  if (!data?.success) {
    alert(
      data?.message ||
      "Message deletion failed."
    );

    return;
  }

  await loadMessages();
  await refreshStats();
}


/* =========================================================
   ANNOUNCEMENTS
========================================================= */

function setupAnnouncements() {
  const publishButton =
    document.getElementById(
      "publishAnnouncement"
    );

  publishButton?.addEventListener(
    "click",
    publishAnnouncement
  );
}


async function loadAnnouncements() {
  const box =
    document.getElementById(
      "announcementList"
    );

  if (!box) {
    return;
  }

  box.innerHTML = `
    <div
      class="admin-table-row"
    >
      <span>
        Loading announcements...
      </span>
    </div>
  `;

  const {
    data,
    error
  } = await JC.sb
    .from(
      "platform_announcements"
    )
    .select(
      "id,title,body,severity,active,created_by,created_at"
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    )
    .limit(50);

  if (error) {
    console.error(
      "Announcements:",
      error
    );

    showError(
      "announcementList",
      error.message
    );

    return;
  }

  adminAnnouncements =
    data || [];

  renderAnnouncements();
}


function renderAnnouncements() {
  const box =
    document.getElementById(
      "announcementList"
    );

  if (!box) {
    return;
  }

  if (
    !adminAnnouncements.length
  ) {
    box.innerHTML = `
      <div
        class="admin-table-row"
      >
        <span>
          No announcements yet.
        </span>
      </div>
    `;

    return;
  }

  box.innerHTML =
    adminAnnouncements
      .map(
        announcement =>
          renderAnnouncementRow(
            announcement
          )
      )
      .join("");
}


function renderAnnouncementRow(
  announcement
) {
  const severity =
    String(
      announcement.severity ||
      "info"
    ).toUpperCase();

  return `
    <div
      class="admin-announcement"
      style="
        padding:16px;
        border-bottom:1px solid #1c2028;
      "
    >
      <div
        style="
          display:flex;
          justify-content:space-between;
          gap:12px;
          align-items:flex-start;
        "
      >
        <div>

          <strong>
            ${escapeHTML(
              announcement.title
            )}
          </strong>

          <div
            style="
              font-size:11px;
              color:#888;
              margin-top:4px;
            "
          >
            ${severity}
            ·
            ${formatDate(
              announcement.created_at
            )}
          </div>

        </div>
      </div>

      <div
        style="
          margin-top:10px;
          color:#b8bdc7;
          white-space:pre-wrap;
          line-height:1.5;
        "
      >
        ${escapeHTML(
          announcement.body
        )}
      </div>
    </div>
  `;
}


async function publishAnnouncement() {
  const titleInput =
    document.getElementById(
      "announcementTitle"
    );

  const bodyInput =
    document.getElementById(
      "announcementBody"
    );

  const severityInput =
    document.getElementById(
      "announcementSeverity"
    );

  const message =
    document.getElementById(
      "announcementMsg"
    );

  const title =
    titleInput?.value.trim() ||
    "";

  const body =
    bodyInput?.value.trim() ||
    "";

  const severity =
    severityInput?.value ||
    "info";

  if (!title) {
    setFormMessage(
      message,
      "Enter an announcement title.",
      true
    );

    return;
  }

  if (!body) {
    setFormMessage(
      message,
      "Enter an announcement message.",
      true
    );

    return;
  }

  const button =
    document.getElementById(
      "publishAnnouncement"
    );

  if (button) {
    button.disabled = true;
    button.textContent =
      "Publishing...";
  }

  setFormMessage(
    message,
    "Publishing..."
  );

  const {
    data,
    error
  } = await JC.sb.rpc(
    "admin_publish_announcement",
    {
      p_title: title,
      p_body: body,
      p_severity: severity
    }
  );

  if (button) {
    button.disabled = false;
    button.textContent =
      "Publish";
  }

  if (error) {
    console.error(
      "Publish announcement:",
      error
    );

    setFormMessage(
      message,
      error.message,
      true
    );

    return;
  }

  if (!data?.success) {
    setFormMessage(
      message,
      data?.message ||
        "Announcement failed.",
      true
    );

    return;
  }

  if (titleInput) {
    titleInput.value = "";
  }

  if (bodyInput) {
    bodyInput.value = "";
  }

  if (severityInput) {
    severityInput.value =
      "info";
  }

  setFormMessage(
    message,
    "Announcement published."
  );

  await loadAnnouncements();
}


function setFormMessage(
  element,
  text,
  error = false
) {
  if (!element) {
    return;
  }

  element.textContent =
    text;

  element.style.color =
    error
      ? "#ff6666"
      : "#52e0a0";
}


/* =========================================================
   UI HELPERS
========================================================= */

function setText(
  elementId,
  value
) {
  const element =
    document.getElementById(
      elementId
    );

  if (element) {
    element.textContent =
      value;
  }
}


function showError(
  elementId,
  message
) {
  const element =
    document.getElementById(
      elementId
    );

  if (!element) {
    return;
  }

  element.innerHTML = `
    <div
      class="setup-warning"
      style="margin:15px;"
    >
      ${escapeHTML(
        message
      )}
    </div>
  `;
}


function showFatalError(
  message
) {
  const old =
    document.getElementById(
      "adminFatalError"
    );

  if (old) {
    old.remove();
  }

  const element =
    document.createElement(
      "div"
    );

  element.id =
    "adminFatalError";

  element.style.cssText = `
    position:fixed;
    left:20px;
    right:20px;
    bottom:20px;
    z-index:99999;
    padding:16px;
    border:1px solid #ff6666;
    border-radius:10px;
    background:#170c0f;
    color:#fff;
    font-family:system-ui;
    box-shadow:0 10px 30px rgba(0,0,0,.4);
  `;

  element.innerHTML = `
    <strong>
      Admin panel error
    </strong>

    <div
      style="
        margin-top:6px;
        color:#ffb8b8;
      "
    >
      ${escapeHTML(
        message
      )}
    </div>
  `;

  document.body.appendChild(
    element
  );
}


function getSettledValue(
  result,
  fallback
) {
  if (
    !result ||
    result.status !==
      "fulfilled"
  ) {
    return fallback;
  }

  return result.value;
}


function formatDate(
  value
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleString();
}


function escapeHTML(
  value = ""
) {
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


/* =========================================================
   BUTTON STYLES
========================================================= */

function injectAdminButtonStyles() {
  if (
    document.getElementById(
      "jaszcweb-admin-inline-styles"
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      "style"
    );

  style.id =
    "jaszcweb-admin-inline-styles";

  style.textContent = `
    .admin-inline-btn {
      border:1px solid #272b35;
      background:#151820;
      color:#aeb4bf;
      border-radius:7px;
      padding:7px 9px;
      font-size:9px;
      cursor:pointer;
      white-space:nowrap;
      transition:
        border-color .15s ease,
        color .15s ease,
        background .15s ease;
    }

    .admin-inline-btn:hover {
      color:#f4f6f8;
      border-color:#c8ff38;
      background:#1b2028;
    }

    .admin-inline-btn.accent:hover {
      color:#c8ff38;
      border-color:#c8ff38;
    }

    .admin-inline-btn.danger:hover {
      color:#ff6666;
      border-color:#ff6666;
    }

    .admin-inline-btn:disabled {
      opacity:.5;
      cursor:not-allowed;
    }

    .admin-announcement {
      background:#0e1116;
    }

    .admin-announcement:hover {
      background:#11151b;
    }
  `;

  document.head.appendChild(
    style
  );
}
