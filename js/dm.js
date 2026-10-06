let conversations = [];
let activeConversation = null;
let dmSubscription = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await JC.boot(false))) return;

  await loadConversations();
  document.getElementById("newDmBtn")?.addEventListener("click", () => openModal("newDmModal"));
  document.getElementById("startDm")?.addEventListener("click", startDm);
  document.getElementById("dmSearch")?.addEventListener("input", e => paintConversationList(e.target.value.toLowerCase()));
  document.getElementById("dmForm")?.addEventListener("submit", sendDm);
});

async function loadConversations() {
  const { data: mine, error } = await JC.sb
    .from("direct_participants")
    .select("conversation_id")
    .eq("user_id", JC.user.id);

  if (error) {
    showDmError(error.message);
    return;
  }

  const ids = [...new Set((mine || []).map(row => row.conversation_id))];

  if (!ids.length) {
    conversations = [];
    paintConversationList("");
    return;
  }

  const { data: participants, error: participantError } = await JC.sb
    .from("direct_participants")
    .select("conversation_id,user_id,profiles(id,display_name,username,avatar_url,status)")
    .in("conversation_id", ids);

  if (participantError) {
    showDmError(participantError.message);
    return;
  }

  conversations = ids.map(id => ({
    id,
    direct_participants: (participants || []).filter(row => row.conversation_id === id)
  }));

  paintConversationList("");
}

function showDmError(message) {
  document.getElementById("conversationList").innerHTML = `<div class="setup-warning">${escapeHTML(message)}</div>`;
}

function otherParticipant(conversation) {
  return (conversation?.direct_participants || [])
    .find(row => row.user_id !== JC.user.id)?.profiles || null;
}

function paintConversationList(query) {
  const list = conversations.filter(conversation => {
    const p = otherParticipant(conversation);
    const text = `${p?.display_name || ""} ${p?.username || ""}`.toLowerCase();
    return !query || text.includes(query);
  });

  const box = document.getElementById("conversationList");
  if (!box) return;

  box.innerHTML = list.map(conversation => {
    const p = otherParticipant(conversation);
    const name = p?.display_name || "User";
    return `
      <button class="dm-conversation ${activeConversation?.id === conversation.id ? "active" : ""}" data-conv="${conversation.id}">
        <div class="message-avatar">
          ${p?.avatar_url ? `<img src="${escapeHTML(p.avatar_url)}" alt="">` : escapeHTML(name[0]?.toUpperCase() || "U")}
        </div>
        <div>
          <strong>${escapeHTML(name)}</strong>
          <small>@${escapeHTML(p?.username || "user")}</small>
        </div>
      </button>
    `;
  }).join("") || `<div class="dm-empty">No conversations yet.</div>`;

  box.querySelectorAll("[data-conv]").forEach(button => {
    button.addEventListener("click", () => openConversation(button.dataset.conv));
  });
}

async function startDm() {
  const input = document.getElementById("dmUsername");
  const msg = document.getElementById("dmMsg");
  const username = input.value.trim().toLowerCase();

  msg.className = "form-msg";
  msg.textContent = "Starting...";

  if (!username) {
    msg.textContent = "Enter a username.";
    msg.classList.add("error");
    return;
  }

  const { data, error } = await JC.sb.rpc("create_direct_conversation", {
    p_username: username
  });

  if (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
    return;
  }

  closeModal("newDmModal");
  input.value = "";
  await loadConversations();
  await openConversation(data);
}

async function openConversation(id) {
  activeConversation = conversations.find(c => c.id === id) || {
    id,
    direct_participants: []
  };

  paintConversationList(document.getElementById("dmSearch")?.value.toLowerCase() || "");

  let other = otherParticipant(activeConversation);
  if (!other) {
    const { data: participants } = await JC.sb
      .from("direct_participants")
      .select("conversation_id,user_id,profiles(id,display_name,username,avatar_url,status)")
      .eq("conversation_id", id);

    activeConversation.direct_participants = participants || [];
    other = otherParticipant(activeConversation);
  }

  const name = other?.display_name || "User";
  document.getElementById("dmChatHead").innerHTML = `
    <div class="dm-head-inner">
      <div class="message-avatar">${other?.avatar_url ? `<img src="${escapeHTML(other.avatar_url)}" alt="">` : escapeHTML(name[0]?.toUpperCase() || "U")}</div>
      <div><strong>${escapeHTML(name)}</strong><small>@${escapeHTML(other?.username || "user")}</small></div>
    </div>
  `;

  document.getElementById("dmForm").classList.remove("hidden");

  if (dmSubscription) {
    await JC.sb.removeChannel(dmSubscription);
    dmSubscription = null;
  }

  await loadDmMessages(id);

  dmSubscription = JC.sb
    .channel(`dm:${id}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "direct_messages",
      filter: `conversation_id=eq.${id}`
    }, async payload => {
      await appendDmMessage(payload.new);
    })
    .subscribe();
}

async function loadDmMessages(id) {
  const { data, error } = await JC.sb
    .from("direct_messages")
    .select("id,conversation_id,user_id,content,created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    alert(error.message);
    return;
  }

  const box = document.getElementById("dmMessages");
  box.innerHTML = "";
  for (const message of data || []) await appendDmMessage(message);
  box.scrollTop = box.scrollHeight;
}

async function appendDmMessage(message) {
  const box = document.getElementById("dmMessages");
  if (!box || box.querySelector(`[data-dm-id="${message.id}"]`)) return;

  const { data: profile } = await JC.sb
    .from("profiles")
    .select("display_name,username,avatar_url")
    .eq("id", message.user_id)
    .single();

  const name = profile?.display_name || "User";
  const row = document.createElement("div");
  row.dataset.dmId = message.id;
  row.className = `dm-bubble ${message.user_id === JC.user.id ? "mine" : ""}`;
  row.innerHTML = `
    <strong>${escapeHTML(name)}</strong>
    <p>${escapeHTML(message.content)}</p>
    <small>${new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
  `;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

async function sendDm(event) {
  event.preventDefault();
  if (!activeConversation) return;

  const input = document.getElementById("dmInput");
  const content = input.value.trim();
  if (!content) return;

  const { error } = await JC.sb.from("direct_messages").insert({
    conversation_id: activeConversation.id,
    user_id: JC.user.id,
    content
  });

  if (error) {
    alert(error.message);
    return;
  }

  input.value = "";
}
