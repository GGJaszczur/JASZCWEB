let activeChannelId=null, messageSubscription=null, activeMessages=[];
const reactionChoices=["❤️","👍","😂","🔥","🎉"];

document.addEventListener("jaszcweb:channel", async e=>{activeChannelId=e.detail.id;await loadActiveChannel();});

document.getElementById("attachBtn")?.addEventListener("click",()=>document.getElementById("fileInput").click());
document.getElementById("cancelReply")?.addEventListener("click",clearReply);
document.getElementById("fileInput")?.addEventListener("change",()=>{const f=document.getElementById("fileInput").files[0];if(f)document.getElementById("messageInput").placeholder=`Attach: ${f.name}`;});

document.getElementById("messageForm")?.addEventListener("submit", async e=>{
 e.preventDefault(); if(!activeChannelId)return;
 const input=document.getElementById("messageInput"), fileInput=document.getElementById("fileInput");
 let content=input.value.trim(), file=fileInput.files[0]||null;
 if(!content && !file)return;
 let filePath=null,fileName=null,fileSize=null;
 if(file){if(file.size>50*1024*1024){alert("Maximum file size is 50 MB.");return;} const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");fileName=file.name;fileSize=file.size;filePath=`${JC.community.id}/${JC.user.id}/${crypto.randomUUID()}-${clean}`; const {error}=await JC.sb.storage.from("community-files").upload(filePath,file,{cacheControl:"3600",upsert:false,contentType:file.type||"application/octet-stream"});if(error){alert(error.message);return;}}
 const replyTo=document.getElementById("replyTo").value||null;
 const {error}=await JC.sb.from("messages").insert({channel_id:activeChannelId,user_id:JC.user.id,content:content||`📎 ${fileName}`,reply_to:replyTo,file_path:filePath,file_name:fileName,file_size:fileSize});
 if(error){alert(error.message);return;} input.value=""; fileInput.value="";clearReply(); input.placeholder=`Message #${document.getElementById("channelTitle").textContent.replace("# ","")}`;
});

async function loadActiveChannel(){
 if(!activeChannelId)return; if(messageSubscription){await JC.sb.removeChannel(messageSubscription);messageSubscription=null;}
 const {data:channel}=await JC.sb.from("channels").select("*").eq("id",activeChannelId).single();if(!channel)return;
 document.getElementById("channelTitle").textContent=`# ${channel.name}`;document.getElementById("channelTopic").textContent=channel.topic||"";
 const {data:messages,error}=await JC.sb.from("messages").select("id,content,created_at,user_id,reply_to,file_path,file_name,file_size,profiles(display_name,username,avatar_url),message_reactions(emoji,user_id)").eq("channel_id",activeChannelId).eq("deleted",false).order("created_at",{ascending:true}).limit(300);
 if(error){document.getElementById("messageList").innerHTML=`<div class="setup-warning">${escapeHTML(error.message)}</div>`;return;}
 activeMessages=messages||[];renderMessages(activeMessages);
 messageSubscription=JC.sb.channel(`chat:${activeChannelId}`).on("postgres_changes",{event:"*",schema:"public",table:"messages",filter:`channel_id=eq.${activeChannelId}`},async()=>{await loadActiveChannel();}).subscribe();
}

function renderMessages(messages){const box=document.getElementById("messageList");box.innerHTML="";if(!messages.length){box.innerHTML=`<div class="chat-empty"><div>👋</div><h3>This channel is empty.</h3><p>Be the first person to say something.</p></div>`;return;}messages.forEach(appendMessage);box.scrollTop=box.scrollHeight;}

function appendMessage(m){const box=document.getElementById("messageList");const existing=box.querySelector(`[data-message-id="${m.id}"]`);if(existing)existing.remove();const mine=m.user_id===JC.user.id,name=m.profiles?.display_name||"User",time=new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});let reply="";if(m.reply_to){const parent=activeMessages.find(x=>x.id===m.reply_to);if(parent)reply=`<div class="reply-quote"><b>↩ Reply to ${escapeHTML(parent.profiles?.display_name||"User")}</b><span>${escapeHTML(parent.content||"Attachment")}</span></div>`;}
 let reactionsMap={};(m.message_reactions||[]).forEach(r=>{reactionsMap[r.emoji]??={count:0,me:false};reactionsMap[r.emoji].count++;if(r.user_id===JC.user.id)reactionsMap[r.emoji].me=true;});const reactions=Object.entries(reactionsMap).map(([emoji,v])=>`<button class="reaction ${v.me?'mine':''}" data-react="${m.id}" data-emoji="${emoji}">${emoji} <small>${v.count}</small></button>`).join("");
 const attachment=m.file_path?`<button class="file-attachment" data-download="${escapeHTML(m.file_path)}">📎 ${escapeHTML(m.file_name||"File")} <small>${formatBytes(m.file_size)}</small></button>`:"";
 const row=document.createElement("article");row.className=`message-row ${mine?'mine':''}`;row.dataset.messageId=m.id;row.innerHTML=`<div class="message-avatar">${m.profiles?.avatar_url?`<img src="${escapeHTML(m.profiles.avatar_url)}" alt="">`:escapeHTML(name[0]?.toUpperCase()||"U")}</div><div class="message-content"><div class="message-meta"><strong>${escapeHTML(name)}</strong><span>@${escapeHTML(m.profiles?.username||"user")} · ${time}</span></div>${reply}<p>${escapeHTML(m.content||"")}</p>${attachment}<div class="message-actions"><button data-reply="${m.id}">↩ Reply</button>${reactionChoices.map(e=>`<button data-react="${m.id}" data-emoji="${e}">${e}</button>`).join("")}</div><div class="reactions">${reactions}</div></div>`;box.appendChild(row);
}

document.addEventListener("click",async e=>{const reply=e.target.closest("[data-reply]");if(reply){document.getElementById("replyTo").value=reply.dataset.reply;document.getElementById("cancelReply").classList.remove("hidden");document.getElementById("messageInput").focus();return;}const react=e.target.closest("[data-react]");if(react){await toggleReaction(react.dataset.react,react.dataset.emoji);return;}const dl=e.target.closest("[data-download]");if(dl){const {data,error}=await JC.sb.storage.from("community-files").createSignedUrl(dl.dataset.download,300);if(error)alert(error.message);else window.open(data.signedUrl,"_blank");}});

async function toggleReaction(messageId,emoji){const {data:existing}=await JC.sb.from("message_reactions").select("message_id").eq("message_id",messageId).eq("user_id",JC.user.id).eq("emoji",emoji).maybeSingle();if(existing){await JC.sb.from("message_reactions").delete().eq("message_id",messageId).eq("user_id",JC.user.id).eq("emoji",emoji);}else{await JC.sb.from("message_reactions").insert({message_id:messageId,user_id:JC.user.id,emoji});}await loadActiveChannel();}
function clearReply(){document.getElementById("replyTo").value="";document.getElementById("cancelReply").classList.add("hidden");}
function formatBytes(bytes){if(!bytes)return"";const units=["B","KB","MB","GB"];let i=0,n=bytes;while(n>=1024&&i<units.length-1){n/=1024;i++;}return`${n.toFixed(i?1:0)} ${units[i]}`;}
