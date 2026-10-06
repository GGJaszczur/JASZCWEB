let communityChannels = [];

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("channelList")) return;
  if (!(await JC.boot(true))) return;
  await loadCommunityShell();
});

async function loadCommunityShell() {
  document.getElementById("communityName").textContent = JC.community.name;
  document.documentElement.style.setProperty("--accent", JC.community.accent_color || "#c8ff38");
  document.documentElement.style.setProperty("--community-banner", JC.community.banner_color || "#111318");
  await loadChannels();
  await loadInviteForCurrentCommunity();
  watchCommunityPresence();
  document.getElementById("addChannelBtn")?.addEventListener("click", () => openModal("channelModal"));
  document.getElementById("addVoiceChannelBtn")?.addEventListener("click", () => { document.getElementById("channelType").value="voice"; openModal("channelModal"); });
  document.getElementById("channelSettings")?.addEventListener("click", () => location.href = `settings.html?community=${encodeURIComponent(JC.community.id)}`);
  document.getElementById("memberPageBtn")?.addEventListener("click", () => location.href = `members.html?community=${encodeURIComponent(JC.community.id)}`);
  document.getElementById("inviteBtn")?.addEventListener("click", () => openModal("inviteModal"));
  document.getElementById("copyInvite")?.addEventListener("click", async () => { await navigator.clipboard.writeText(document.getElementById("inviteCode").textContent); });
  document.getElementById("createChannelSubmit")?.addEventListener("click", createChannel);
}

async function loadChannels() {
  const { data, error } = await JC.sb.from("channels").select("*").eq("community_id", JC.community.id).order("position", {ascending:true});
  if (error) { document.getElementById("channelList").innerHTML=`<div class="setup-warning">${escapeHTML(error.message)}</div>`; return; }
  communityChannels = data || [];
  const text = communityChannels.filter(c => c.type === "text");
  const voice = communityChannels.filter(c => c.type === "voice");
  const list = document.getElementById("channelList"), vlist = document.getElementById("voiceChannelList");
  list.innerHTML = text.map((c,i)=>`<button class="channel-link ${i===0?'active':''}" data-channel="${c.id}"><span>#</span>${escapeHTML(c.name)}</button>`).join("") || `<div class="channel-empty">No text channels.</div>`;
  vlist.innerHTML = voice.map(c=>`<button class="channel-link voice" data-voice="${c.id}"><span>🔊</span>${escapeHTML(c.name)}</button>`).join("") || `<div class="channel-empty">No voice channels.</div>`;
  list.querySelectorAll("[data-channel]").forEach(btn=>btn.addEventListener("click",()=>{list.querySelectorAll(".channel-link").forEach(x=>x.classList.remove("active"));btn.classList.add("active");document.getElementById("voicePanel").classList.add("hidden");document.getElementById("messageForm").classList.remove("hidden");window.dispatchEvent(new CustomEvent("jaszcweb:channel",{detail:{id:btn.dataset.channel}}));}));
  vlist.querySelectorAll("[data-voice]").forEach(btn=>btn.addEventListener("click",()=>{list.querySelectorAll(".channel-link").forEach(x=>x.classList.remove("active"));document.getElementById("messageForm").classList.add("hidden");document.getElementById("messageList").innerHTML="";document.getElementById("voicePanel").classList.remove("hidden");window.dispatchEvent(new CustomEvent("jaszcweb:voice",{detail:{id:btn.dataset.voice}}));}));
  if(text[0]) window.dispatchEvent(new CustomEvent("jaszcweb:channel",{detail:{id:text[0].id}}));
}

async function createChannel() {
  const msg = document.getElementById("channelMsg"); msg.textContent="Creating..."; msg.classList.remove("error");
  const raw = document.getElementById("channelName").value.trim().toLowerCase();
  const name = raw.replace(/[^a-z0-9-]+/g,"-").replace(/^-|-$/g,"");
  const type = document.getElementById("channelType").value;
  const topic = document.getElementById("channelTopicInput").value.trim();
  if(!name){msg.textContent="Enter a channel name.";msg.classList.add("error");return;}
  const {data:last}=await JC.sb.from("channels").select("position").eq("community_id",JC.community.id).order("position",{ascending:false}).limit(1).maybeSingle();
  const {error}=await JC.sb.from("channels").insert({community_id:JC.community.id,name,position:(last?.position??-1)+1,type,topic});
  if(error){msg.textContent=error.message;msg.classList.add("error");return;}
  closeModal("channelModal"); document.getElementById("channelName").value=""; document.getElementById("channelTopicInput").value=""; await loadChannels();
}

async function loadInviteForCurrentCommunity(){
  const {data}=await JC.sb.from("community_invites").select("code").eq("community_id",JC.community.id).eq("active",true).limit(1).maybeSingle();
  if(data?.code){document.getElementById("inviteCode").textContent=data.code;}
}

let communityPresenceChannel = null;
async function watchCommunityPresence(){
  if(communityPresenceChannel) await JC.sb.removeChannel(communityPresenceChannel);
  communityPresenceChannel = JC.sb.channel(`presence:community:${JC.community.id}`,{config:{presence:{key:JC.user.id}}});
  const paint=()=>{const state=communityPresenceChannel.presenceState();const count=Object.keys(state).length;document.getElementById("onlineCount").textContent=`${count} online`;};
  communityPresenceChannel.on("presence",{event:"sync"},paint).on("presence",{event:"join",},paint).on("presence",{event:"leave"},paint).subscribe(async status=>{if(status==="SUBSCRIBED"){await communityPresenceChannel.track({user_id:JC.user.id,name:JC.profile?.display_name});paint();}});
}
