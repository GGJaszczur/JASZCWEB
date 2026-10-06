document.addEventListener("DOMContentLoaded", async () => {
  if (!(await JC.boot(false))) return;

  const nameInput = document.getElementById("profileName");
  const usernameInput = document.getElementById("profileUsername");

  nameInput.value = JC.profile?.display_name || "";
  usernameInput.value = JC.profile?.username || "";

  paintProfile();

  document
    .getElementById("profileForm")
    .addEventListener("submit", async event => {
      event.preventDefault();

      const msg = document.getElementById("profileMsg");

      msg.className = "form-msg";
      msg.textContent = "Saving...";

      const display_name = nameInput.value.trim();
      const username = usernameInput.value.trim().toLowerCase();

      if (!display_name || !username) {
        msg.className = "form-msg error";
        msg.textContent = "Fill in your name and username.";
        return;
      }

      const { data, error } = await JC.sb
        .from("profiles")
        .update({
          display_name,
          username
        })
        .eq("id", JC.user.id)
        .select()
        .single();

      if (error) {
        msg.className = "form-msg error";
        msg.textContent = error.message;
        return;
      }

      JC.profile = {
        ...JC.profile,
        ...data
      };

      JC.paintUser();
      JC.paintSidebar();
      paintProfile();

      msg.className = "form-msg";
      msg.textContent = "Profile saved.";
    });

  document
    .getElementById("signOutBtn")
    ?.addEventListener("click", async () => {
      await JC.sb.auth.signOut();
      location.href = "index.html";
    });


  function paintProfile() {
    const avatar = document.getElementById("profileAvatar");

    const name = JC.profile?.display_name || "User";

    const initials = name
      .split(/\s+/)
      .map(x => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    if (avatar) {
      if (JC.profile?.avatar_url) {
        avatar.innerHTML = `
          <img
            src="${escapeHTML(JC.profile.avatar_url)}"
            alt="${escapeHTML(name)}"
          >
        `;
      } else {
        avatar.textContent = initials;
      }
    }

    document.getElementById("profileDisplay").textContent = name;

    document.getElementById("profileHandle").textContent =
      `@${JC.profile?.username || "user"}`;
  }
});
