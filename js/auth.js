document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");

  // Attach the form handlers FIRST.
  // This prevents the page from reloading even if Supabase has a problem.
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const msg = document.getElementById("loginMsg");
    msg.className = "form-msg";
    msg.textContent = "Connecting...";

    try {
      if (!window.JASZCWEB_CONFIG) {
        throw new Error("config.js was not loaded.");
      }

      if (
        !window.JASZCWEB_CONFIG.supabaseUrl ||
        !window.JASZCWEB_CONFIG.supabasePublishableKey
      ) {
        throw new Error("Supabase URL or publishable key is missing.");
      }

      if (!window.supabase) {
        throw new Error("Supabase library did not load.");
      }

      if (!JC.sb) {
        const ok = JC.initClient();

        if (!ok || !JC.sb) {
          throw new Error("Supabase could not initialize.");
        }
      }

      const email = document
        .getElementById("loginEmail")
        .value
        .trim();

      const password =
        document.getElementById("loginPassword").value;

      if (!email || !password) {
        throw new Error("Enter your email and password.");
      }

      msg.textContent = "Logging in...";

      const { data, error } =
        await JC.sb.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        throw error;
      }

      if (!data.session) {
        throw new Error("Login succeeded but no session was returned.");
      }

      msg.className = "form-msg";
      msg.textContent = "Logged in!";

      window.location.href = "dashboard.html";

    } catch (error) {
      console.error("JASZCWEB LOGIN ERROR:", error);

      msg.className = "form-msg error";
      msg.textContent = error.message || "Login failed.";
    }
  });


  signupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const msg = document.getElementById("signupMsg");
    msg.className = "form-msg";
    msg.textContent = "Creating account...";

    try {
      if (!window.JASZCWEB_CONFIG) {
        throw new Error("config.js was not loaded.");
      }

      if (!window.supabase) {
        throw new Error("Supabase library did not load.");
      }

      if (!JC.sb) {
        const ok = JC.initClient();

        if (!ok || !JC.sb) {
          throw new Error("Supabase could not initialize.");
        }
      }

      const displayName =
        document.getElementById("signupName").value.trim();

      const username =
        document.getElementById("signupUsername").value
          .trim()
          .toLowerCase();

      const email =
        document.getElementById("signupEmail").value.trim();

      const password =
        document.getElementById("signupPassword").value;

      if (!displayName || !username || !email || !password) {
        throw new Error("Fill in all fields.");
      }

      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      const { data, error } =
        await JC.sb.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
              username
            }
          }
        });

      if (error) {
        throw error;
      }

      if (!data.session) {
        msg.textContent =
          "Account created. Check your email to confirm it, then log in.";
        return;
      }

      window.location.href = "dashboard.html";

    } catch (error) {
      console.error("JASZCWEB SIGNUP ERROR:", error);

      msg.className = "form-msg error";
      msg.textContent =
        error.message || "Account creation failed.";
    }
  });


  // Login / signup tabs
  document.querySelectorAll(".auth-tab").forEach(tab => {
    tab.addEventListener("click", () => {

      document.querySelectorAll(".auth-tab")
        .forEach(t => t.classList.remove("active"));

      tab.classList.add("active");

      const signup =
        tab.dataset.auth === "signup";

      document
        .getElementById("loginForm")
        .classList.toggle("hidden", signup);

      document
        .getElementById("signupForm")
        .classList.toggle("hidden", !signup);
    });
  });
});
