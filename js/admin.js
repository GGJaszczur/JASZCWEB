let adminUsers = [];
let adminCommunities = [];

document.addEventListener("DOMContentLoaded", async () => {
  injectAdminButtonStyles();

  if (!JC.initClient()) {
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

  const adminUserElement =
    document.getElementById("adminUser");

  if (adminUserElement) {
    adminUserElement.textContent =
      `${JC.profile?.display_name || "Admin"} · Administrator`;
  }

  const systemEmailElement =
    document.getElementById("systemEmail");

  if (systemEmailElement) {
    systemEmailElement.textContent =
      JC.user.email || "—";
  }

  setupNavigation();

  document
    .getElementById("adminLogout")
    ?.addEventListener("click", async () => {
      await JC.sb.auth.signOut();
      location.href = "index.html";
    });

  document
    .getElementById("userSearch")
    ?.addEventListener("input", renderUsers);

  document
    .getElementById("communitySearch")
    ?.addEventListener(
      "input",
      renderCommunities
    );

  await refreshStats();
  await loadUsers();
  await loadCommunities();

  buildMessageModeration();
});


/* =========================================================
   ADMIN ACCESS
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
   NAVIGATION
========================================================= */

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
    .querySelectorAll(".admin-section")
    .forEach(sectionEl => {
      sectionEl.classList.toggle(
        "active",
        sectionEl.id === `${section}Section`
      );
    });

  document
    .querySelectorAll(".admin-nav")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.section === section
      );
    });

  const titles = {
    overview: "Overview",
    users: "Users",
    communities: "Communities",
    messages: "Messages",
    system: "System"
  };

  const title =
    document.getElementById(
      "adminPageTitle"
    );

  if (title) {
    title.textContent =
      titles[section] || "Overview";
  }
}


/* =========================================================
   STATS
========================================================= */

async function refreshStats() {
  const [
    users,
    communities,
    messages,
    dms
  ] = await Promise.all([
    countRows("profiles"),
    countRows("communities"),
    countRows("messages"),
    countRows("direct_messages")
  ]);

  const statUsers =
    document.getElementById(
      "statUsers"
    );

  const statCommunities =
    document.getElementById(
      "statCommunities"
    );

  const statMessages =
    document.getElementById(
      "statMessages"
    );

  const statDMs =
    document.getElementById(
      "statDMs"
    );

  const messageBig =
    document.getElementById(
      "messageBig"
    );

  const dmBig =
    document.getElementById(
      "dmBig"
    );

  if (statUsers) {
    statUsers.textContent = users;
  }

  if (statCommunities) {
    statCommunities.textContent =
      communities;
  }

  if (statMessages) {
    statMessages.textContent =
      messages;
  }

  if (statDMs) {
    statDMs.textContent = dms;
  }

  if (messageBig) {
    messageBig.textContent =
      messages;
  }

  if (dmBig) {
    dmBig.textContent = dms;
  }
}


async function countRows(table) {
  const { count, error } =
    await JC.sb
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
  const { data, error } =
    await JC.sb.rpc(
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
    adminUsers.filter(user => {
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
    });

  box.innerHTML = `
    <div class="admin-table-row head">
      <span>User</span>
      <span>Username</span>
      <span>Status</span>
      <span>Role</span>
      <span>Actions</span>
    </div>

    ${
      users.map(user => {
        const suspended =
          user.suspended_until &&
          new Date(
            user.suspended_until
          ) > new Date();

        let status = "";

        if (user.is_banned) {
          status = `
            <span style="color:#ff6666;">
              BANNED
            </span>
          `;
        } else if (suspended) {
          status = `
            <span style="color:#ffd166;">
              SUSPENDED
            </span>
          `;
        } else {
          status = `
            <span style="color:#52e0a0;">
              ACTIVE
            </span>
          `;
        }

        const role = user.is_admin
          ? `
            <span style="color:#c8ff38;">
              ADMIN
            </span>
          `
          : "USER";

        const cannotLockSelf =
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
                cannotLockSelf
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
                cannotLockSelf
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
      }).join("")

      || `
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
            button.dataset.userAction,
            button.dataset.id
          );
        }
      );
    });
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
  const { data, error } =
    await JC.sb.rpc(
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

  const communities =
    Array.isArray(data)
      ? data
      : [];

  adminCommunities =
    communities.map(
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
      communities.map(
        community => `
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
        `
      ).join("")

      || `
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
            button.dataset.communityAction,
            button.dataset.id
          );
        }
      );
    });
}


async function runCommunityAction(
  action,
  communityId
) {
  let actualAction = action;

  /*
    The button uses toggle-lock,
    but the SQL function accepts
    lock / unlock / delete.
  */

  if (action === "toggle-lock") {
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

  let message = "";

  if (actualAction === "delete") {
    message =
      "Delete this community and its content?";
  } else if (
    actualAction === "lock"
  ) {
    message =
      "Lock this community?";
  } else {
    message =
      "Unlock this community?";
  }

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
   MESSAGE MODERATION
========================================================= */

function buildMessageModeration() {
  const section =
    document.getElementById(
      "messagesSection"
    );

  if (!section) {
    return;
  }

  const grid =
    section.querySelector(
      ".admin-grid"
    );

  if (!grid) {
    return;
  }

  const existing =
    document.getElementById(
      "adminModerationPanel"
    );

  if (existing) {
    existing.remove();
  }

  const panel =
    document.createElement(
      "div"
    );

  panel.id =
    "adminModerationPanel";

  panel.className =
    "admin-panel";

  panel.style.marginTop =
    "15px";

  panel.innerHTML = `
    <div class="admin-panel-head">
      <h2>
        Recent community messages
      </h2>

      <p>
        Delete messages directly
        from the platform.
      </p>
    </div>

    <div id="moderationMessages"></div>
  `;

  section.appendChild(panel);

  loadRecentMessages();
}


async function loadRecentMessages() {
  const box =
    document.getElementById(
      "moderationMessages"
    );

  if (!box) {
    return;
  }

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
    box.innerHTML = `
      <div
        class="setup-warning"
        style="margin:15px;"
      >
        ${escapeHTML(
          error.message
        )}
      </div>
    `;

    return;
  }

  box.innerHTML = `
    <div class="admin-table-row head">
      <span>Message</span>
      <span>User</span>
      <span>Time</span>
      <span>ID</span>
      <span>Action</span>
    </div>

    ${
      (data || [])
        .map(message => {
          const userId =
            message.user_id
              ? String(
                  message.user_id
                )
              : "unknown";

          return `
            <div class="admin-table-row">

              <span>
                ${escapeHTML(
                  (
                    message.content ||
                    ""
                  ).slice(0, 80)
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
                  message.id
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
        })
        .join("")

      || `
        <div class="admin-table-row">
          <span>
            No messages.
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
        async () => {
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
                Number(
                  button.dataset
                    .deleteMessage
                )
            }
          );

          if (error) {
            alert(error.message);
            return;
          }

          if (!data?.success) {
            alert(
              data?.message ||
              "Delete failed."
            );

            return;
          }

          await loadRecentMessages();
          await refreshStats();
        }
      );
    });
}


/* =========================================================
   STYLING
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
      border: 1px solid #272b35;
      background: #151820;
      color: #aeb4bf;
      border-radius: 7px;
      padding: 7px 9px;
      font-size: 9px;
      cursor: pointer;
      white-space: nowrap;
      transition:
        border-color 0.15s ease,
        color 0.15s ease,
        background 0.15s ease;
    }

    .admin-inline-btn:hover {
      color: #f4f6f8;
      border-color: #c8ff38;
    }

    .admin-inline-btn.accent:hover {
      color: #c8ff38;
      border-color: #c8ff38;
    }

    .admin-inline-btn.danger:hover {
      color: #ff6666;
      border-color: #ff6666;
    }

    .admin-inline-btn:active {
      transform: translateY(1px);
    }
  `;

  document.head.appendChild(style);
}


/* =========================================================
   HELPERS
========================================================= */

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
      ${escapeHTML(message)}
    </div>
  `;
}


function formatDate(value) {
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
