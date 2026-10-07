let adminUsers = [];
let adminCommunities = [];


document.addEventListener("DOMContentLoaded", async () => {

  if (!JC.initClient()) {
    return;
  }

  const user = await JC.requireAuth();

  if (!user) {
    return;
  }

  const allowed =
    await checkAdminAccess();

  if (!allowed) {
    document.body.innerHTML = `
      <div style="
        min-height:100vh;
        display:grid;
        place-items:center;
        background:#08090c;
        color:white;
        font-family:Inter,sans-serif;
        text-align:center;
        padding:20px;
      ">
        <div>
          <div style="font-size:50px">🔒</div>
          <h1>Admin access required</h1>
          <p style="color:#888">
            This account isn't a platform administrator.
          </p>
          <a
            href="dashboard.html"
            style="color:#c8ff38"
          >
            Back to JASZCWEB
          </a>
        </div>
      </div>
    `;

    return;
  }


  document.getElementById(
    "adminUser"
  ).textContent =
    `${JC.profile.display_name} · Administrator`;


  document.getElementById(
    "systemEmail"
  ).textContent =
    JC.user.email || "—";


  setupNavigation();

  await loadOverview();

  await loadUsers();

  await loadCommunities();


  document
    .getElementById("userSearch")
    ?.addEventListener(
      "input",
      renderUsers
    );


  document
    .getElementById("communitySearch")
    ?.addEventListener(
      "input",
      renderCommunities
    );


  document
    .getElementById("adminLogout")
    ?.addEventListener(
      "click",
      async () => {

        await JC.sb.auth.signOut();

        location.href =
          "index.html";

      }
    );

});


/* =========================================================
   ADMIN CHECK
   ========================================================= */

async function checkAdminAccess() {

  const {
    data,
    error
  } = await JC.sb
    .from("profiles")
    .select("is_admin")
    .eq("id", JC.user.id)
    .single();


  if (error) {

    console.error(
      "Admin check:",
      error
    );

    return false;

  }


  return data?.is_admin === true;

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

  document
    .querySelectorAll(".admin-nav, .admin-action")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const section =
            button.dataset.section;

          showAdminSection(
            section
          );

        }
      );

    });

}


function showAdminSection(
  section
) {

  document
    .querySelectorAll(
      ".admin-section"
    )
    .forEach(el => {

      el.classList.toggle(
        "active",
        el.id ===
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

    overview:
      "Overview",

    users:
      "Users",

    communities:
      "Communities",

    messages:
      "Messages",

    system:
      "System"

  };


  document.getElementById(
    "adminPageTitle"
  ).textContent =
    titles[section] ||
    "Overview";

}


/* =========================================================
   OVERVIEW
   ========================================================= */

async function loadOverview() {

  const users =
    await countRows(
      "profiles"
    );

  const communities =
    await countRows(
      "communities"
    );

  const messages =
    await countRows(
      "messages"
    );

  const dms =
    await countRows(
      "direct_messages"
    );


  document.getElementById(
    "statUsers"
  ).textContent =
    users;


  document.getElementById(
    "statCommunities"
  ).textContent =
    communities;


  document.getElementById(
    "statMessages"
  ).textContent =
    messages;


  document.getElementById(
    "statDMs"
  ).textContent =
    dms;


  document.getElementById(
    "messageBig"
  ).textContent =
    messages;


  document.getElementById(
    "dmBig"
  ).textContent =
    dms;

}


async function countRows(
  table
) {

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
  } = await JC.sb
    .from("profiles")
    .select(
      "id,username,display_name,is_admin,created_at"
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    )
    .limit(500);


  if (error) {

    showTableError(
      "usersTable",
      error.message
    );

    return;
  }


  adminUsers =
    data || [];


  renderUsers();

}


function renderUsers() {

  const box =
    document.getElementById(
      "usersTable"
    );


  const search =
    (
      document.getElementById(
        "userSearch"
      )?.value || ""
    )
      .toLowerCase()
      .trim();


  const filtered =
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
        !search ||
        name.includes(search) ||
        username.includes(search)
      );

    });


  box.innerHTML = `

    <div class="admin-table-row head">

      <span>User</span>

      <span>Username</span>

      <span>Role</span>

      <span>Created</span>

    </div>

    ${
      filtered.map(user => `

        <div class="admin-table-row">

          <span>
            <strong>
              ${escapeHTML(
                user.display_name ||
                "User"
              )}
            </strong>

            <small>
              ${escapeHTML(
                user.id.slice(0, 8)
              )}...
            </small>
          </span>

          <span>
            @${escapeHTML(
              user.username ||
              "user"
            )}
          </span>

          <span class="${
            user.is_admin
              ? "role-admin"
              : ""
          }">
            ${
              user.is_admin
                ? "ADMIN"
                : "USER"
            }
          </span>

          <span>
            ${formatDate(
              user.created_at
            )}
          </span>

        </div>

      `).join("")
      ||
      `
        <div class="admin-table-row">
          <span>No users found.</span>
        </div>
      `
    }

  `;

}


/* =========================================================
   COMMUNITIES
   ========================================================= */

async function loadCommunities() {

  const {
    data,
    error
  } = await JC.sb
    .from("communities")
    .select(
      "id,name,slug,owner_id,created_at,profiles(display_name,username)"
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    )
    .limit(500);


  if (error) {

    showTableError(
      "communitiesTable",
      error.message
    );

    return;
  }


  adminCommunities =
    data || [];


  renderCommunities();

}


function renderCommunities() {

  const box =
    document.getElementById(
      "communitiesTable"
    );


  const search =
    (
      document.getElementById(
        "communitySearch"
      )?.value || ""
    )
      .toLowerCase()
      .trim();


  const filtered =
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
          !search ||
          name.includes(search) ||
          slug.includes(search)
        );

      }
    );


  box.innerHTML = `

    <div class="admin-table-row head">

      <span>Community</span>

      <span>Owner</span>

      <span>Slug</span>

      <span>Created</span>

    </div>

    ${
      filtered.map(
        community => `

          <div class="admin-table-row">

            <span>

              <strong>
                ${escapeHTML(
                  community.name
                )}
              </strong>

              <small>
                ${escapeHTML(
                  community.id.slice(0, 8)
                )}...
              </small>

            </span>

            <span>
              ${escapeHTML(
                community.profiles
                  ?.display_name ||
                "Unknown"
              )}
            </span>

            <span>
              /${escapeHTML(
                community.slug
              )}
            </span>

            <span>
              ${formatDate(
                community.created_at
              )}
            </span>

          </div>

        `
      ).join("")
      ||
      `
        <div class="admin-table-row">
          <span>No communities found.</span>
        </div>
      `
    }

  `;

}


/* =========================================================
   HELPERS
   ========================================================= */

function showTableError(
  id,
  message
) {

  document.getElementById(
    id
  ).innerHTML = `

    <div
      class="setup-warning"
      style="margin:15px"
    >
      ${escapeHTML(message)}
    </div>

  `;

}


function formatDate(
  value
) {

  if (!value) return "—";

  return new Date(
    value
  ).toLocaleDateString();

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
