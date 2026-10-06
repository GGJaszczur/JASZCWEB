let activeChannelId = null;
let messageSubscription = null;

document.addEventListener("jaszcweb:channel", async (e) => {
  activeChannelId = e.detail.id;
  await loadActiveChannel();
});

async function loadActiveChannel() {
  if (!activeChannelId) return;

  if (messageSubscription) {
    await JC.sb.removeChannel(messageSubscription);
    messageSubscription = null;
  }

  const { data: channel, error: channelError } = await JC.sb
    .from("channels")
    .select("*")
    .eq("id", activeChannelId)
    .single();

  if (channelError || !channel) return;

  const title = document.getElementById("channelTitle");
  const input = document.getElementById("messageInput");
  const crumb = document.getElementById("crumb");

  if (title) {
    title.textContent = `# ${channel.name}`;
  }

  if (input) {
    input.placeholder = `Message #${channel.name}`;
  }

  if (crumb) {
    crumb.innerHTML =
      `${escapeHTML(JC.community.name)} <span>/</span> # ${escapeHTML(channel.name)}`;
  }

  const { data: messages, error } = await JC.sb
    .from("messages")
    .select(
      "id, content, created_at, user_id, profiles(display_name, username)"
    )
    .eq("channel_id", activeChannelId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    document.getElementById("messageList").innerHTML =
      `<div class="setup-warning">${escapeHTML(error.message)}</div>`;
    return;
  }

  renderMessages(messages || []);

  messageSubscription = JC.sb
    .channel(`jaszcweb-messages-${activeChannelId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `channel_id=eq.${activeChannelId}`
      },
      async (payload) => {
        const { data: message } = await JC.sb
          .from("messages")
          .select(
            "id, content, created_at, user_id, profiles(display_name, username)"
          )
          .eq("id", payload.new.id)
          .single();

        if (message) {
          appendMessage(message);
        }
      }
    )
    .subscribe();
}

function renderMessages(messages) {
  const box = document.getElementById("messageList");

  if (!box) return;

  box.innerHTML = "";

  if (!messages.length) {
    box.innerHTML = `
      <div class="chat-empty">
        <div>👋</div>
        <h3>This channel is empty.</h3>
        <p>Be the first person to say something.</p>
      </div>
    `;

    return;
  }

  messages.forEach(appendMessage);
}

function appendMessage(message) {
  const box = document.getElementById("messageList");

  if (!box) return;

  if (box.querySelector(".chat-empty")) {
    box.innerHTML = "";
  }

  if (box.querySelector(`[data-message-id="${message.id}"]`)) {
    return;
  }

  const mine = message.user_id === JC.user.id;
  const name = message.profiles?.display_name || "User";
  const username = message.profiles?.username || "user";

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  const row = document.createElement("article");

  row.className = `message-row ${mine ? "mine" : ""}`;
  row.dataset.messageId = message.id;

  row.innerHTML = `
    <div class="message-avatar">
      ${escapeHTML(name[0]?.toUpperCase() || "U")}
    </div>

    <div class="message-content">
      <div class="message-meta">
        <strong>${escapeHTML(name)}</strong>
        <span>
          @${escapeHTML(username)} · ${time}
        </span>
      </div>

      <p>${escapeHTML(message.content)}</p>
    </div>
  `;

  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

document.getElementById("messageForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!activeChannelId) return;

  const input = document.getElementById("messageInput");
  const content = input.value.trim();

  if (!content) return;

  const { error } = await JC.sb
    .from("messages")
    .insert({
      channel_id: activeChannelId,
      user_id: JC.user.id,
      content
    });

  if (error) {
    alert(error.message);
    return;
  }

  input.value = "";
});