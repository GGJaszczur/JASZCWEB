document.addEventListener("DOMContentLoaded", async () => {
  if (!(await JC.boot(false))) return;
  const $ = id => document.getElementById(id);

  $("profileName").value = JC.profile?.display_name || "";
  $("profileUsername").value = JC.profile?.username || "";
  $("profileBio").value = JC.profile?.bio || "";
  $("profilePronouns").value = JC.profile?.pronouns || "";
  $("profileStatus").value = JC.profile?.status || "";
  $("profileAccent").value = JC.profile?.accent_color || "#c8ff38";
  $("profileBannerColor").value = JC.profile?.banner_color || "#111318";
  $("profileTheme").value = JC.profile?.theme || "dark";
  paint();

  ["profileName", "profileUsername", "profileBio", "profilePronouns", "profileStatus", "profileAccent", "profileBannerColor", "profileTheme"].forEach(id => {
    $(id)?.addEventListener("input", paint);
    $(id)?.addEventListener("change", paint);
  });

  $("profileAvatarFile")?.addEventListener("change", () => {
    const file = $("profileAvatarFile").files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      $("profileMsg").textContent = "Avatar must be under 5 MB.";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const avatar = $("profileAvatar");
      avatar.innerHTML = `<img src="${reader.result}" alt="">`;
    };
    reader.readAsDataURL(file);
  });

  $("profileForm").addEventListener("submit", saveProfile);
  $("signOutBtn").addEventListener("click", async () => {
    await JC.sb.auth.signOut();
    location.href = "index.html";
  });

  async function saveProfile(event) {
    event.preventDefault();

    const msg = $("profileMsg");
    msg.textContent = "Saving...";
    msg.classList.remove("error");

    let avatarUrl = JC.profile?.avatar_url || null;
    const file = $("profileAvatarFile").files[0];

    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        msg.textContent = "Avatar must be under 5 MB.";
        msg.classList.add("error");
        return;
      }

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${JC.user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await JC.sb.storage
        .from("avatars")
        .upload(path, file, {
          upsert: false,
          cacheControl: "3600",
          contentType: file.type || "image/jpeg"
        });

      if (uploadError) {
        msg.textContent = uploadError.message;
        msg.classList.add("error");
        return;
      }

      const { data } = JC.sb.storage.from("avatars").getPublicUrl(path);
      avatarUrl = data.publicUrl;
    }

    const update = {
      display_name: $("profileName").value.trim(),
      username: $("profileUsername").value.trim().toLowerCase(),
      avatar_url: avatarUrl,
      bio: $("profileBio").value.trim(),
      pronouns: $("profilePronouns").value.trim(),
      status: $("profileStatus").value.trim(),
      accent_color: $("profileAccent").value,
      banner_color: $("profileBannerColor").value,
      theme: $("profileTheme").value
    };

    if (!update.display_name || !update.username) {
      msg.textContent = "Display name and username are required.";
      msg.classList.add("error");
      return;
    }

    const { error } = await JC.sb
      .from("profiles")
      .update(update)
      .eq("id", JC.user.id);

    if (error) {
      msg.textContent = error.message;
      msg.classList.add("error");
      return;
    }

    JC.profile = { ...JC.profile, ...update };
    JC.applyProfileTheme();
    JC.paintUser();
    paint();
    msg.textContent = "Profile saved ✓";
    $("profileAvatarFile").value = "";
  }

  function paint() {
    const name = $("profileName").value.trim() || "J";
    const username = $("profileUsername").value.trim() || "user";
    const status = $("profileStatus").value.trim() || "Available";

    $("profileDisplay").textContent = name;
    $("profileHandle").textContent = `@${username}`;
    $("profileStatusPreview").textContent = status;
    $("profileBanner").style.background = $("profileBannerColor").value;
    $("accentText").textContent = $("profileAccent").value;
    $("bannerText").textContent = $("profileBannerColor").value;
    document.documentElement.style.setProperty("--accent", $("profileAccent").value);
    document.body.dataset.theme = $("profileTheme").value;

    const avatar = $("profileAvatar");
    if (!$("profileAvatarFile").files[0] && JC.profile?.avatar_url) {
      avatar.innerHTML = `<img src="${escapeHTML(JC.profile.avatar_url)}" alt="">`;
    } else if (!$("profileAvatarFile").files[0]) {
      avatar.textContent = name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
    }
  }
});
