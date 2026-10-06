let activeChannelId = null;
let messageSubscription = null;
let activeMessages = [];
let refreshTimer = null;

const reactionChoices = ["❤️", "👍", "😂", "🔥", "🎉"];

document.addEventListener("jaszcweb:channel", async event => {
  activeChannelId = event.detail.id;
  await loadActiveChannel();
});

document.getElementById("attachBtn")?.addEventListener("click", () => {
  document.getElementById("fileInput")?.click();
});

document.getElementById("cancelReply")?.addEventListener("click", clearReply);

document.getElementById("fileInput")?.addEventListener("change", () => {
  const file = document.getElementById("fileInput").files[0];
  const input = document.getElementById("messageInput");
  if (file) input.placeholder = `Attach: ${file.name}`;
});

document.getElementById("messageForm")?.addEventListener("submit", sendMessage);

async function sendMessage(event) {
  event.preventDefault();
  if (!activeChannelId) return;

  const input = document.getElementById("messageInput");
  const fileInput = document.getElementById("fileInput");
  const content = input.value.trim();
  const file = fileInput.files[0] || null;

  if (!content && !file) return;

  let filePath = null;
  let fileName = null;
  let fileSize = null;

  if (file) {
    if (file.size > 50 * 1024 * 1024) {
      alert("Maximum file size is 50 MB.");
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    fileName = file.name;
    fileSize = file.size;
    filePath = `${JC.community.id}/${JC.user.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await JC.sb.storage
      .from("community-files")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });

    if (uploadError) {
      alert(uploadError.message);
      return;
    }
  }

  const replyTo = document.getElementById("replyTo").value || null;

  const { error } = await JC.sb.from("messages").insert({
    channel_id: activeChannelId,
    user_id: JC.user.id,
    content: content || `📎 ${fileName}`,
    reply_to: replyTo,
    file_path: filePath,
    file_name: fileName,
    file_size: fileSize
  });

  if (error) {
    if (filePath) {
      await JC.sb.storage.from("community-files").remove([filePath]);
    }
    alert(error.message);
    return;
  }

  input.value = "";
  fileInput.value = "";
  clearReply();
  input.placeholder = `Message #${currentChannelName()}`;
}

async function loadActiveChannel() {
  if (!activeChannelId) return;

  if (messageSubscription) {
    await JC.sb.removeChannel(messageSubscription);
    messageSubscription = null;
  }

  const { data: channel, error: channelError } = await JC.sb
    .from("channels")
    .select("id,name,type,topic")
    .eq("id", activeChannelId)
    .single();

  if (channelError || !channel) return;

  document.getElementById("channelTitle").textContent = `# ${channel.name}`;
  document.getElementById("channelTopic").textContent = channel.topic || "";
  document.getElementById("messageInput").placeholder = `Message #${channel.name}`;
  const crumb = document.getElementById("crumb");
  if (crumb) crumb.innerHTML = `${escapeHTML(JC.community.name)} <span>/</span> # ${escapeHTML(channel.name)}`;

  await fetchAndRenderMessages();

  messageSubscription = JC.sb
    .channel(`chat:${activeChannelId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `channel_id=eq.${activeChannelId}`
    }, () => queueRefresh())
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "messages",
      filter: `channel_id=eq.${activeChannelId}`
    }, () => queueRefresh())
    .subscribe();
}

function queueRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(fetchAndRenderMessages, 80);
}

async function fetchAndRenderMessages() {
  if (!activeChannelId) return;

  const { data: rawMessages, error } = await JC.sb
    .from("messages")
    .select("id,content,created_at,user_id,reply_to,file_path,file_name,file_size,deleted")
    .eq("channel_id", activeChannelId)
    .eq("deleted", false)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    document.getElementById("messageList").innerHTML = `<div class="setup-warning">${escapeHTML(error.message)}</div>`;
    return;
  }

  const messages = rawMessages || [];
  const ids = [...new Set(messages.map(m => m.user_id))];
  const messageIds = messages.map(m => m.id);

  let profiles = [];
  let reactions = [];

  if (ids.length) {
    const { data } = await JC.sb
      .from("profiles")
      .select("id,display_name,username,avatar_url")
      .in("id", ids);
    profiles = data || [];
  }

  if (messageIds.length) {
    const { data } = await JC.sb
      .from("message_reactions")
      .select("message_id,user_id,emoji")
      .in("message_id", messageIds);
    reactions = data || [];
  }

  const profileMap = new Map(profiles.map(p => [p.id, p]));
  const grouped = new Map();
  reactions.forEach(r => {
    if (!grouped.has(r.message_id)) grouped.set(r.message_id, []);
    grouped.get(r.message_id).push(r);
  });

  activeMessages = messages.map(m => ({
    ...m,
    profiles: profileMap.get(m.user_id) || null,
    message_reactions: grouped.get(m.id) || []
  }));

  renderMessages(activeMessages);
}

function renderMessages(messages) {
  const box = document.getElementById("messageList");
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

  messages.forEach(message => box.appendChild(buildMessageElement(message)));
  box.scrollTop = box.scrollHeight;
}

function buildMessageElement(m) {
  const mine = m.user_id === JC.user.id;
  const name = m.profiles?.display_name || "User";
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const parent = m.reply_to ? activeMessages.find(x => x.id === m.reply_to) : null;

  const reactionsMap = {};
  (m.message_reactions || []).forEach(r => {
    reactionsMap[r.emoji] ??= { count: 0, me: false };
    reactionsMap[r.emoji].count++;
    if (r.user_id === JC.user.id) reactionsMap[r.emoji].me = true;
  });

  const reactionSummary = Object.entries(reactionsMap)
    .map(([emoji, value]) => `<button class="reaction ${value.me ? "mine" : ""}" data-react="${m.id}" data-emoji="${emoji}">${emoji} <small>${value.count}</small></button>`)
    .join("");

  const attachment = m.file_path
    ? `<button class="file-attachment" data-download="${escapeHTML(m.file_path)}">📎 ${escapeHTML(m.file_name || "File")} <small>${formatBytes(m.file_size)}</small></button>`
    : "";

  const row = document.createElement("article");
  row.className = `message-row ${mine ? "mine" : ""}`;
  row.dataset.messageId = m.id;
  row.innerHTML = `
    <div class="message-avatar">
      ${m.profiles?.avatar_url ? `<img src="${escapeHTML(m.profiles.avatar_url)}" alt="">` : escapeHTML(name[0]?.toUpperCase() || "U")}
    </div>
    <div class="message-content">
      <div class="message-meta">
        <strong>${escapeHTML(name)}</strong>
        <span>@${escapeHTML(m.profiles?.username || "user")} · ${time}</span>
      </div>
      ${parent ? `<div class="reply-quote"><b>↩ Reply to ${escapeHTML(parent.profiles?.display_name || "User")}</b><span>${escapeHTML(parent.content || "Attachment")}</span></div>` : ""}
      <p>${escapeHTML(m.content || "")}</p>
      ${attachment}
      <div class="message-actions">
        <button data-reply="${m.id}">↩ Reply</button>
        ${reactionChoices.map(emoji => `<button data-react="${m.id}" data-emoji="${emoji}">${emoji}</button>`).join("")}
      </div>
      <div class="reactions">${reactionSummary}</div>
    </div>
  `;
  return row;
}

document.addEventListener("click", async event => {
  const reply = event.target.closest("[data-reply]");
  if (reply) {
    document.getElementById("replyTo").value = reply.dataset.reply;
    document.getElementById("cancelReply").classList.remove("hidden");
    document.getElementById("messageInput").focus();
    return;
  }

  const react = event.target.closest("[data-react]");
  if (react) {
    await toggleReaction(react.dataset.react, react.dataset.emoji);
    return;
  }

  const download = event.target.closest("[data-download]");
  if (download) {
    const { data, error } = await JC.sb.storage
      .from("community-files")
      .createSignedUrl(download.dataset.download, 300);
    if (error) alert(error.message);
    else window.open(data.signedUrl, "_blank", "noopener");
  }
});

async function toggleReaction(messageId, emoji) {
  const { data: existing } = await JC.sb
    .from("message_reactions")
    .select("message_id")
    .eq("message_id", messageId)
    .eq("user_id", JC.user.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await JC.sb.from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", JC.user.id)
      .eq("emoji", emoji);
  } else {
    await JC.sb.from("message_reactions").insert({
      message_id: messageId,
      user_id: JC.user.id,
      emoji
    });
  }

  await fetchAndRenderMessages();
}

function clearReply() {
  document.getElementById("replyTo").value = "";
  document.getElementById("cancelReply").classList.add("hidden");
}

function currentChannelName() {
  return (document.getElementById("channelTitle")?.textContent || "general").replace(/^#\s*/, "");
}

function formatBytes(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}
