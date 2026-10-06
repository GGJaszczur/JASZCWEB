document.addEventListener("DOMContentLoaded", async () => {
  if (!(await JC.boot(false))) return;

  const $ = id => document.getElementById(id);
  const hello = $("helloTitle");
  const grid = $("dashboardGrid");
  const empty = $("noCommunities");
  const createBtn = $("createCommunityBtn");
  const emptyCreate = $("emptyCreateBtn");
  const joinBtn = $("joinCommunityBtn");
  const emptyJoin = $("emptyJoinBtn");

  hello.textContent = `Welcome back, ${JC.profile?.display_name || "there"}.`;

  createBtn?.addEventListener("click", () => openModal("communityModal"));
  emptyCreate?.addEventListener("click", () => openModal("communityModal"));
  joinBtn?.addEventListener("click", () => openModal("joinModal"));
  emptyJoin?.addEventListener("click", () => openModal("joinModal"));

  const name = $("communityName");
  const slug = $("communitySlug");
  name?.addEventListener("input", () => {
    if (!slug.dataset.edited) {
      slug.value = name.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
  });
  slug?.addEventListener("input", () => { slug.dataset.edited = "1"; });

  $("createCommunitySubmit")?.addEventListener("click", createCommunity);
  $("joinCommunitySubmit")?.addEventListener("click", joinCommunity);

  await loadCommunities();

  async function loadCommunities() {
    const { data, error } = await JC.sb
      .from("community_members")
      .select("community_id, role, banned, communities(id,name,slug,description,accent_color,banner_color)")
      .eq("user_id", JC.user.id)
      .eq("banned", false);

    if (error) {
      grid.innerHTML = `<div class="setup-warning">${escapeHTML(error.message)}</div>`;
      return;
    }

    const communities = (data || []).map(row => ({ ...row.communities, role: row.role }));
    empty.classList.toggle("hidden", communities.length > 0);

    grid.innerHTML = communities.map(c => `
      <article class="community-card">
        <div class="community-logo">${escapeHTML((c.name || "J")[0].toUpperCase())}</div>
        <h3>${escapeHTML(c.name)}</h3>
        <p>${escapeHTML(c.description || "Your community.")}</p>
        <div class="card-foot">
          <span>${escapeHTML(c.role)}</span>
          <button class="btn primary small" data-id="${escapeHTML(c.id)}">Enter →</button>
        </div>
      </article>
    `).join("");

    grid.querySelectorAll("[data-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        location.href = `community.html?community=${encodeURIComponent(btn.dataset.id)}`;
      });
    });
  }

  async function createCommunity() {
    const msg = $("communityMsg");
    msg.textContent = "Creating...";
    msg.classList.remove("error");

    const p_name = name.value.trim();
    const p_slug = slug.value.trim().toLowerCase();
    const p_description = $("communityDescription").value.trim();

    if (!p_name || !p_slug) {
      msg.textContent = "Add a name and slug.";
      msg.classList.add("error");
      return;
    }

    const { data, error } = await JC.sb.rpc("create_community", {
      p_name,
      p_slug,
      p_description
    });

    if (error) {
      msg.textContent = error.message;
      msg.classList.add("error");
      return;
    }

    location.href = `community.html?community=${encodeURIComponent(data)}`;
  }

  async function joinCommunity() {
    const msg = $("joinMsg");
    const code = $("joinCode").value.trim().toUpperCase();
    msg.textContent = "Joining...";
    msg.classList.remove("error");

    if (!code) {
      msg.textContent = "Enter an invite code.";
      msg.classList.add("error");
      return;
    }

    const { data, error } = await JC.sb.rpc("join_community", { p_code: code });

    if (error) {
      msg.textContent = error.message;
      msg.classList.add("error");
      return;
    }

    location.href = `community.html?community=${encodeURIComponent(data)}`;
  }
});
