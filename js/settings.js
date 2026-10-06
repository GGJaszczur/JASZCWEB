document.addEventListener("DOMContentLoaded", async () => {
  if (!(await JC.boot(true))) return;

  const { data: membership } = await JC.sb
    .from("community_members")
    .select("role")
    .eq("community_id", JC.community.id)
    .eq("user_id", JC.user.id)
    .eq("banned", false)
    .single();

  const role = membership?.role || "member";
  if (!["owner", "admin"].includes(role)) {
    document.querySelector(".settings-card").innerHTML = `
      <div class="chat-empty">
        <div>🔒</div>
        <h3>Owner/admin only.</h3>
        <p>You need the right role to change community settings.</p>
      </div>
    `;
    return;
  }

  const $ = id => document.getElementById(id);
  $("settingsName").value = JC.community.name || "";
  $("settingsSlug").value = JC.community.slug || "";
  $("settingsDescription").value = JC.community.description || "";
  $("settingsColor").value = JC.community.accent_color || "#c8ff38";
  $("settingsBanner").value = JC.community.banner_color || "#111318";
  $("colorText").textContent = $("settingsColor").value;
  $("bannerText").textContent = $("settingsBanner").value;

  const { data: invite } = await JC.sb
    .from("community_invites")
    .select("code")
    .eq("community_id", JC.community.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (invite?.code) $("settingsInvite").textContent = invite.code;

  $("settingsColor").addEventListener("input", e => $("colorText").textContent = e.target.value);
  $("settingsBanner").addEventListener("input", e => $("bannerText").textContent = e.target.value);
  $("copySettingsInvite").addEventListener("click", async () => navigator.clipboard.writeText($("settingsInvite").textContent));

  $("settingsForm").addEventListener("submit", async event => {
    event.preventDefault();
    const update = {
      name: $("settingsName").value.trim(),
      slug: $("settingsSlug").value.trim().toLowerCase(),
      description: $("settingsDescription").value.trim(),
      accent_color: $("settingsColor").value,
      banner_color: $("settingsBanner").value
    };

    const { error } = await JC.sb.from("communities").update(update).eq("id", JC.community.id);
    if (error) {
      $("settingsMsg").textContent = error.message;
      $("settingsMsg").classList.add("error");
      return;
    }

    JC.community = { ...JC.community, ...update };
    document.documentElement.style.setProperty("--accent", update.accent_color);
    document.documentElement.style.setProperty("--community-banner", update.banner_color);
    JC.paintSidebar();
    $("settingsMsg").textContent = "Saved ✓";
  });
});
