let memberCache = [];
let currentTarget = null;
let memberCanManage = false;
let actorRole = "member";

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await JC.boot(true))) return;

  const { data: me } = await JC.sb
    .from("community_members")
    .select("role")
    .eq("community_id", JC.community.id)
    .eq("user_id", JC.user.id)
    .eq("banned", false)
    .single();

  actorRole = me?.role || "member";
  memberCanManage = ["owner", "admin", "moderator"].includes(actorRole);

  await loadMembers();

  document.getElementById("memberSearch")?.addEventListener("input", e => paintMembers(e.target.value.toLowerCase()));
  document.getElementById("inviteMembersBtn")?.addEventListener("click", copyInvite);
  document.getElementById("saveMemberRole")?.addEventListener("click", saveMemberRole);
  document.getElementById("banMember")?.addEventListener("click", () => memberAction("ban_member"));
  document.getElementById("kickMember")?.addEventListener("click", () => memberAction("remove_member"));
});

async function loadMembers() {
  const { data, error } = await JC.sb
    .from("community_members")
    .select("user_id,role,banned,joined_at,profiles(display_name,username,avatar_url,bio,status,pronouns)")
    .eq("community_id", JC.community.id)
    .order("joined_at", { ascending: true });

  if (error) {
    document.getElementById("memberGrid").innerHTML = `<div class="setup-warning">${escapeHTML(error.message)}</div>`;
    return;
  }

  memberCache = data || [];
  const active = memberCache.filter(x => !x.banned);
  document.getElementById("memberTotal").textContent = `${active.length} member${active.length === 1 ? "" : "s"}`;
  document.getElementById("memberSubtitle").textContent = `${JC.community.name} · ${active.length} members`;
  paintMembers("");
}

function paintMembers(query) {
  const list = memberCache.filter(member => {
    const text = `${member.profiles?.display_name || ""} ${member.profiles?.username || ""}`.toLowerCase();
    return !query || text.includes(query);
  });

  document.getElementById("memberGrid").innerHTML = list.map(member => {
    const profile = member.profiles || {};
    const name = profile.display_name || "User";
    const initials = name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();

    return `
      <article class="member-card ${member.banned ? "banned" : ""}">
        <div class="member-avatar">
          ${profile.avatar_url ? `<img src="${escapeHTML(profile.avatar_url)}" alt="">` : escapeHTML(initials)}
        </div>
        <div class="member-card-body">
          <h3>${escapeHTML(name)}</h3>
          <p>@${escapeHTML(profile.username || "user")}</p>
          <span class="role-pill ${member.role}">${escapeHTML(member.role)}</span>
          ${profile.status ? `<small class="member-status">${escapeHTML(profile.status)}</small>` : ""}
          ${member.banned ? `<small class="member-status">Banned</small>` : ""}
          ${memberCanManage && member.user_id !== JC.user.id && member.role !== "owner" ? `<button class="manage-btn" data-manage="${member.user_id}">Manage</button>` : ""}
        </div>
      </article>
    `;
  }).join("");

  document.querySelectorAll("[data-manage]").forEach(button => {
    button.addEventListener("click", () => openManage(button.dataset.manage));
  });
}

function openManage(id) {
  currentTarget = memberCache.find(member => member.user_id === id);
  if (!currentTarget) return;

  document.getElementById("manageMemberName").textContent = currentTarget.profiles?.display_name || "Member";
  document.getElementById("memberRole").value = currentTarget.role === "owner" ? "admin" : currentTarget.role;
  document.getElementById("saveMemberRole").classList.toggle("hidden", actorRole !== "owner");
  openModal("memberModal");
}

async function saveMemberRole() {
  if (!currentTarget || actorRole !== "owner") return;
  const role = document.getElementById("memberRole").value;
  const { error } = await JC.sb.rpc("set_member_role", {
    p_community_id: JC.community.id,
    p_user_id: currentTarget.user_id,
    p_role: role
  });
  if (error) {
    document.getElementById("memberMsg").textContent = error.message;
    return;
  }
  closeModal("memberModal");
  await loadMembers();
}

async function memberAction(fn) {
  if (!currentTarget) return;
  const { error } = await JC.sb.rpc(fn, {
    p_community_id: JC.community.id,
    p_user_id: currentTarget.user_id
  });
  if (error) {
    document.getElementById("memberMsg").textContent = error.message;
    return;
  }
  closeModal("memberModal");
  await loadMembers();
}

async function copyInvite() {
  const { data } = await JC.sb
    .from("community_invites")
    .select("code")
    .eq("community_id", JC.community.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (data?.code) {
    await navigator.clipboard.writeText(data.code);
    alert(`Invite code copied: ${data.code}`);
  }
}
