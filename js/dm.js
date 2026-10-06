let conversations = [];
let activeConversationId = null;
let activeOtherUser = null;
let dmSubscription = null;
let callChannel = null;
let peer = null;
let localStream = null;
let pendingOffer = null;
let pendingCandidates = [];
let callMode = null;

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await JC.boot(false))) return;

  await loadConversations();
  await preparePeopleModal();

  document.getElementById("newDmBtn")?.addEventListener("click", openPeopleModal);
  document.getElementById("emptyNewDmBtn")?.addEventListener("click", openPeopleModal);
  document.getElementById("dmSearch")?.addEventListener("input", renderConversationList);
  document.getElementById("peopleSearch")?.addEventListener("input", renderPeople);
  document.getElementById("dmForm")?.addEventListener("submit", sendDM);
  document.getElementById("startCallBtn")?.addEventListener("click", startVoiceCall);
  document.getElementById("acceptCallBtn")?.addEventListener("click", acceptIncomingCall);
  document.getElementById("declineCallBtn")?.addEventListener("click", declineIncomingCall);
  document.getElementById("hangupBtn")?.addEventListener("click", () => hangup(true));
  document.getElementById("muteCallBtn")?.addEventListener("click", toggleMute);
});

async function loadConversations() {
  const { data, error } = await JC.sb
    .from("dm_conversations")
    .select("id, user_a, user_b, created_at")
    .or(`user_a.eq.${JC.user.id},user_b.eq.${JC.user.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    showConversationError(error.message);
    return;
  }

  conversations = data || [];

  const otherIds = conversations.map(c =>
    c.user_a === JC.user.id ? c.user_b : c.user_a
  );

  if (!otherIds.length) {
    renderConversationList();
    return;
  }

  const { data: profiles } = await JC.sb
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", otherIds);

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  conversations = conversations.map(c => ({
    ...c,
    other: profileMap.get(c.user_a === JC.user.id ? c.user_b : c.user_a) || {
      id: c.user_a === JC.user.id ? c.user_b : c.user_a,
      display_name: "User",
      username: "user",
      avatar_url: null
    }
  }));

  renderConversationList();
  await subscribeToConversationList();

  const wanted = new URLSearchParams(location.search).get("user");
  if (wanted) {
    const match = conversations.find(c => c.other.id === wanted);
    if (match) await openConversation(match.id);
    else await createConversation(wanted);
  }
}

function renderConversationList() {
  const box = document.getElementById("conversationList");
  if (!box) return;

  const q = (document.getElementById("dmSearch")?.value || "").trim().toLowerCase();
  const filtered = conversations.filter(c =>
    !q ||
    c.other.display_name?.toLowerCase().includes(q) ||
    c.other.username?.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    box.innerHTML = `
      <div class="dm-no-conversations">
        <span>✉</span>
        <p>No conversations yet.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = filtered.map(c => {
    const avatar = c.other.avatar_url
      ? `<img src="${escapeHTML(c.other.avatar_url)}" alt="">`
      : `<span>${escapeHTML((c.other.display_name || "U")[0].toUpperCase())}</span>`;

    return `
      <button class="dm-conversation ${c.id === activeConversationId ? "active" : ""}" data-conversation="${c.id}">
        <div class="dm-list-avatar">${avatar}</div>
        <div class="dm-list-text">
          <strong>${escapeHTML(c.other.display_name || "User")}</strong>
          <small>@${escapeHTML(c.other.username || "user")}</small>
        </div>
      </button>
    `;
  }).join("");

  box.querySelectorAll("[data-conversation]").forEach(btn => {
    btn.addEventListener("click", () => openConversation(btn.dataset.conversation));
  });
}

async function preparePeopleModal() {
  const { data, error } = await JC.sb
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .neq("id", JC.user.id)
    .order("display_name", { ascending: true })
    .limit(200);

  window.jcPeople = error ? [] : (data || []);
  renderPeople();
}

function renderPeople() {
  const box = document.getElementById("peopleList");
  if (!box) return;

  const q = (document.getElementById("peopleSearch")?.value || "").toLowerCase();
  const list = (window.jcPeople || []).filter(p =>
    !q ||
    p.display_name?.toLowerCase().includes(q) ||
    p.username?.toLowerCase().includes(q)
  );

  box.innerHTML = list.map(p => {
    const avatar = p.avatar_url
      ? `<img src="${escapeHTML(p.avatar_url)}" alt="">`
      : `<span>${escapeHTML((p.display_name || "U")[0].toUpperCase())}</span>`;

    return `
      <button class="person-row" data-user="${p.id}">
        <div class="person-avatar">${avatar}</div>
        <div>
          <strong>${escapeHTML(p.display_name || "User")}</strong>
          <small>@${escapeHTML(p.username || "user")}</small>
        </div>
      </button>
    `;
  }).join("") || `<div class="dm-no-conversations"><span>⌕</span><p>No people found.</p></div>`;

  box.querySelectorAll("[data-user]").forEach(btn => {
    btn.addEventListener("click", () => createConversation(btn.dataset.user));
  });
}

function openPeopleModal() {
  document.getElementById("peopleSearch").value = "";
  renderPeople();
  openModal("newDmModal");
}

async function createConversation(otherUserId) {
  const { data, error } = await JC.sb.rpc("get_or_create_dm", {
    p_other_user: otherUserId
  });

  if (error) {
    alert(error.message);
    return;
  }

  closeModal("newDmModal");
  await loadConversations();
  await openConversation(data);
}

async function openConversation(id) {
  const conversation = conversations.find(c => c.id === id);
  if (!conversation) return;

  activeConversationId = id;
  activeOtherUser = conversation.other;

  renderConversationList();

  document.getElementById("dmEmpty")?.classList.add("hidden");
  document.getElementById("dmActive")?.classList.remove("hidden");

  const avatar = document.getElementById("dmAvatar");
  if (activeOtherUser.avatar_url) {
    avatar.innerHTML = `<img src="${escapeHTML(activeOtherUser.avatar_url)}" alt="">`;
  } else {
    avatar.textContent = (activeOtherUser.display_name || "U")[0].toUpperCase();
  }

  document.getElementById("dmName").textContent = activeOtherUser.display_name || "User";
  document.getElementById("dmUsername").textContent = `@${activeOtherUser.username || "user"}`;

  await loadDMMessages();
  await subscribeToDM();
  await setupCallChannel();
}

async function loadDMMessages() {
  const { data, error } = await JC.sb
    .from("direct_messages")
    .select("id, conversation_id, sender_id, content, created_at")
    .eq("conversation_id", activeConversationId)
    .order("created_at", { ascending: true })
    .limit(300);

  const box = document.getElementById("dmMessages");

  if (error) {
    box.innerHTML = `<div class="setup-warning">${escapeHTML(error.message)}</div>`;
    return;
  }

  box.innerHTML = "";

  if (!(data || []).length) {
    box.innerHTML = `<div class="chat-empty"><div>👋</div><h3>Start the conversation.</h3><p>Send the first message.</p></div>`;
    return;
  }

  data.forEach(appendDMMessage);
}

async function subscribeToDM() {
  if (dmSubscription) {
    await JC.sb.removeChannel(dmSubscription);
    dmSubscription = null;
  }

  dmSubscription = JC.sb
    .channel(`dm-messages-${activeConversationId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "direct_messages",
      filter: `conversation_id=eq.${activeConversationId}`
    }, payload => appendDMMessage(payload.new))
    .subscribe();
}

function appendDMMessage(message) {
  const box = document.getElementById("dmMessages");
  if (!box) return;

  if (box.querySelector(".chat-empty")) box.innerHTML = "";
  if (box.querySelector(`[data-dm-id="${message.id}"]`)) return;

  const mine = message.sender_id === JC.user.id;
  const row = document.createElement("div");
  row.className = `dm-message ${mine ? "mine" : ""}`;
  row.dataset.dmId = message.id;

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  row.innerHTML = `
    <div class="dm-bubble">
      <p>${escapeHTML(message.content)}</p>
      <small>${time}</small>
    </div>
  `;

  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

async function sendDM(event) {
  event.preventDefault();
  if (!activeConversationId) return;

  const input = document.getElementById("dmInput");
  const content = input.value.trim();
  if (!content) return;

  const { error } = await JC.sb.from("direct_messages").insert({
    conversation_id: activeConversationId,
    sender_id: JC.user.id,
    content
  });

  if (error) {
    alert(error.message);
    return;
  }

  input.value = "";
}

async function subscribeToConversationList() {
  const channel = JC.sb
    .channel(`dm-list-${JC.user.id}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "dm_conversations"
    }, async () => {
      await loadConversations();
    })
    .subscribe();
}

/* =========================================================
   VOICE CALLS — WebRTC + Supabase Realtime signaling
   ========================================================= */

async function setupCallChannel() {
  if (!activeConversationId) return;

  if (callChannel) {
    await JC.sb.removeChannel(callChannel);
    callChannel = null;
  }

  callChannel = JC.sb.channel(`voice-${activeConversationId}`);

  callChannel
    .on("broadcast", { event: "call-offer" }, async ({ payload }) => {
      if (payload.from === JC.user.id) return;

      pendingOffer = payload.offer;
      showIncomingCall();
    })
    .on("broadcast", { event: "call-answer" }, async ({ payload }) => {
      if (payload.from === JC.user.id || !peer) return;

      await peer.setRemoteDescription(new RTCSessionDescription(payload.answer));
      await flushCandidates();
      setCallStatus("Connected");
    })
    .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
      if (payload.from === JC.user.id || !payload.candidate) return;

      if (!peer?.remoteDescription) {
        pendingCandidates.push(payload.candidate);
        return;
      }

      try {
        await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (error) {
        console.error("ICE candidate error", error);
      }
    })
    .on("broadcast", { event: "hangup" }, ({ payload }) => {
      if (payload.from === JC.user.id) return;
      hangup(false);
    })
    .subscribe();
}

async function startVoiceCall() {
  if (!activeConversationId) return;

  try {
    await setupCallChannel();
    await createPeerConnection();

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    callMode = "outgoing";
    showActiveCall("Calling...");

    await callChannel.send({
      type: "broadcast",
      event: "call-offer",
      payload: {
        from: JC.user.id,
        offer: peer.localDescription
      }
    });
  } catch (error) {
    console.error(error);
    alert("Couldn't start the call. Check microphone permissions.");
    await hangup(false);
  }
}

async function acceptIncomingCall() {
  if (!pendingOffer) return;

  closeModal("incomingCallModal");

  try {
    await setupCallChannel();
    await createPeerConnection();

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

    await peer.setRemoteDescription(new RTCSessionDescription(pendingOffer));
    await flushCandidates();

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    callMode = "incoming";
    showActiveCall("Connected");

    await callChannel.send({
      type: "broadcast",
      event: "call-answer",
      payload: {
        from: JC.user.id,
        answer: peer.localDescription
      }
    });

    pendingOffer = null;
  } catch (error) {
    console.error(error);
    alert("Couldn't answer the call. Check microphone permissions.");
    await hangup(false);
  }
}

function createPeerConnection() {
  peer = new RTCPeerConnection(rtcConfig);

  peer.ontrack = event => {
    const audio = document.getElementById("remoteAudio");
    audio.srcObject = event.streams[0];
    audio.play().catch(() => {});
  };

  peer.onicecandidate = async event => {
    if (!event.candidate || !callChannel) return;

    await callChannel.send({
      type: "broadcast",
      event: "ice-candidate",
      payload: {
        from: JC.user.id,
        candidate: event.candidate
      }
    });
  };

  peer.onconnectionstatechange = () => {
    const state = peer?.connectionState;

    if (state === "connected") {
      setCallStatus("Connected");
    }

    if (["failed", "disconnected", "closed"].includes(state)) {
      setCallStatus("Disconnected");
    }
  };
}

async function flushCandidates() {
  if (!peer?.remoteDescription) return;

  for (const candidate of pendingCandidates) {
    try {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error("ICE queue error", error);
    }
  }

  pendingCandidates = [];
}

function showIncomingCall() {
  const name = activeOtherUser?.display_name || "Someone";
  const username = activeOtherUser?.username || "user";

  document.getElementById("incomingCallName").textContent = `${name} is calling`;
  document.getElementById("incomingCallUsername").textContent = `@${username}`;
  document.getElementById("incomingCallAvatar").textContent = name[0]?.toUpperCase() || "U";

  openModal("incomingCallModal");
}

function declineIncomingCall() {
  closeModal("incomingCallModal");
  pendingOffer = null;
}

function showActiveCall(status) {
  document.getElementById("activeCallBar")?.classList.remove("hidden");
  setCallStatus(status);
}

function setCallStatus(status) {
  const el = document.getElementById("callStatus");
  if (el) el.textContent = status;
}

function toggleMute() {
  if (!localStream) return;

  const track = localStream.getAudioTracks()[0];
  if (!track) return;

  track.enabled = !track.enabled;

  document.getElementById("muteCallBtn").textContent =
    track.enabled ? "🎙" : "🔇";
}

async function hangup(notify = true) {
  if (notify && callChannel) {
    await callChannel.send({
      type: "broadcast",
      event: "hangup",
      payload: { from: JC.user.id }
    });
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  if (peer) {
    peer.ontrack = null;
    peer.onicecandidate = null;
    peer.close();
    peer = null;
  }

  const audio = document.getElementById("remoteAudio");
  if (audio) audio.srcObject = null;

  pendingOffer = null;
  pendingCandidates = [];
  callMode = null;

  document.getElementById("activeCallBar")?.classList.add("hidden");
  document.getElementById("muteCallBtn").textContent = "🎙";
}

async function showConversationError(message) {
  const box = document.getElementById("conversationList");
  if (box) box.innerHTML = `<div class="setup-warning">${escapeHTML(message)}</div>`;
}
