let voiceChannel = null;
let localStream = null;
let voicePeers = new Map();
let voiceUsers = new Map();

window.addEventListener("jaszcweb:voice", async event => {
  await openVoiceChannel(event.detail.id);
});

async function openVoiceChannel(channelId) {
  if (voiceChannel) await leaveVoice(true);
  cleanupVoicePeers();

  const { data: channel } = await JC.sb
    .from("channels")
    .select("*")
    .eq("id", channelId)
    .single();
  if (!channel) return;

  const panel = document.getElementById("voicePanel");
  panel.innerHTML = `
    <div class="voice-shell">
      <div>
        <div class="eyebrow">VOICE CHANNEL</div>
        <h2>🔊 ${escapeHTML(channel.name)}</h2>
        <p>${escapeHTML(channel.topic || "Hang out and talk.")}</p>
      </div>
      <div id="voiceParticipants" class="voice-participants"></div>
      <div class="voice-actions">
        <button class="btn primary" id="joinVoiceBtn">Join voice</button>
        <button class="btn danger hidden" id="leaveVoiceBtn">Leave voice</button>
        <button class="btn secondary hidden" id="muteVoiceBtn">Mute</button>
      </div>
      <div id="voiceStatus" class="voice-status">Not connected.</div>
    </div>
  `;

  document.getElementById("joinVoiceBtn").onclick = () => joinVoice(channelId);
  document.getElementById("leaveVoiceBtn").onclick = () => leaveVoice(false);
  document.getElementById("muteVoiceBtn").onclick = toggleMute;
}

async function joinVoice(channelId) {
  if (voiceChannel) return;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    alert("Microphone permission is required for voice chat.");
    return;
  }

  voiceChannel = JC.sb.channel(`voice:${channelId}`, {
    config: { presence: { key: JC.user.id } }
  });

  voiceChannel
    .on("presence", { event: "sync" }, syncVoiceParticipants)
    .on("presence", { event: "join" }, syncVoiceParticipants)
    .on("presence", { event: "leave" }, syncVoiceParticipants)
    .on("broadcast", { event: "signal" }, handleSignal);

  voiceChannel.subscribe(async status => {
    if (status !== "SUBSCRIBED") return;
    await voiceChannel.track({ user_id: JC.user.id, name: JC.profile?.display_name || "User" });
    document.getElementById("joinVoiceBtn")?.classList.add("hidden");
    document.getElementById("leaveVoiceBtn")?.classList.remove("hidden");
    document.getElementById("muteVoiceBtn")?.classList.remove("hidden");
    document.getElementById("voiceStatus").textContent = "Connected.";
    syncVoiceParticipants();
  });
}

function syncVoiceParticipants() {
  if (!voiceChannel) return;

  const state = voiceChannel.presenceState();
  const current = new Set();
  voiceUsers.clear();

  Object.values(state).flat().forEach(p => {
    if (p.user_id && p.user_id !== JC.user.id) {
      current.add(p.user_id);
      voiceUsers.set(p.user_id, p);
      if (JC.user.id < p.user_id) ensurePeer(p.user_id, p.name, true);
    }
  });

  for (const id of voicePeers.keys()) {
    if (!current.has(id)) {
      voicePeers.get(id).pc.close();
      voicePeers.delete(id);
      document.getElementById(`audio-${id}`)?.remove();
    }
  }

  const box = document.getElementById("voiceParticipants");
  if (!box) return;

  box.innerHTML = `
    <div class="voice-me">🟢 ${escapeHTML(JC.profile?.display_name || "You")} (you)</div>
    ${Array.from(voiceUsers.entries()).map(([id, p]) => `<div class="voice-user">🟢 ${escapeHTML(p.name || "User")}</div>`).join("")}
  `;
}

async function ensurePeer(peerId, peerName, initiator = false) {
  if (voicePeers.has(peerId)) return voicePeers.get(peerId);

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  localStream?.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = event => {
    if (event.candidate) sendVoiceSignal(peerId, { type: "ice", candidate: event.candidate });
  };

  pc.ontrack = event => {
    let audio = document.getElementById(`audio-${peerId}`);
    if (!audio) {
      audio = document.createElement("audio");
      audio.id = `audio-${peerId}`;
      audio.autoplay = true;
      audio.playsInline = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = event.streams[0];
  };

  const peer = { pc, name: peerName };
  voicePeers.set(peerId, peer);

  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendVoiceSignal(peerId, { type: "offer", sdp: offer });
  }

  return peer;
}

async function handleSignal({ payload }) {
  const from = payload?.from;
  if (!from || from === JC.user.id || (payload.to && payload.to !== JC.user.id)) return;

  const signal = payload.data;
  const peer = await ensurePeer(from, payload.name || "User", false);
  if (signal.type === "offer") {
    await peer.pc.setRemoteDescription(signal.sdp);
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    await sendVoiceSignal(from, { type: "answer", sdp: answer });
  } else if (signal.type === "answer") {
    await peer.pc.setRemoteDescription(signal.sdp);
  } else if (signal.type === "ice" && signal.candidate) {
    try { await peer.pc.addIceCandidate(signal.candidate); } catch {}
  }
}

async function sendVoiceSignal(target, data) {
  if (!voiceChannel) return;
  await voiceChannel.send({
    type: "broadcast",
    event: "signal",
    payload: {
      from: JC.user.id,
      name: JC.profile?.display_name || "User",
      to: target,
      data
    }
  });
}

function cleanupVoicePeers() {
  voicePeers.forEach(({ pc }) => pc.close());
  voicePeers.clear();
  document.querySelectorAll("audio[id^='audio-']").forEach(el => el.remove());
}

async function leaveVoice(silent = false) {
  if (voiceChannel) {
    try { await voiceChannel.untrack(); } catch {}
    await JC.sb.removeChannel(voiceChannel);
    voiceChannel = null;
  }

  localStream?.getTracks().forEach(track => track.stop());
  localStream = null;
  cleanupVoicePeers();

  if (!silent) {
    document.getElementById("joinVoiceBtn")?.classList.remove("hidden");
    document.getElementById("leaveVoiceBtn")?.classList.add("hidden");
    document.getElementById("muteVoiceBtn")?.classList.add("hidden");
    document.getElementById("voiceStatus").textContent = "Disconnected.";
  }
}

function toggleMute() {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  document.getElementById("muteVoiceBtn").textContent = track.enabled ? "Mute" : "Unmute";
}
