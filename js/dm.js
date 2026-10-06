let conversations = [];
let activeConversationId = null;
let activeOtherUser = null;

let dmSubscription = null;
let dmListSubscription = null;

let callChannel = null;
let peer = null;
let localStream = null;

let pendingOffer = null;
let pendingCandidates = [];

const rtcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    }
  ]
};


/* =========================================================
   START
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await JC.boot(false))) return;

  await loadConversations();
  await preparePeopleModal();

  document
    .getElementById("newDmBtn")
    ?.addEventListener("click", openPeopleModal);

  document
    .getElementById("emptyNewDmBtn")
    ?.addEventListener("click", openPeopleModal);

  document
    .getElementById("dmSearch")
    ?.addEventListener("input", renderConversationList);

  document
    .getElementById("peopleSearch")
    ?.addEventListener("input", renderPeople);

  document
    .getElementById("dmForm")
    ?.addEventListener("submit", sendDM);

  document
    .getElementById("startCallBtn")
    ?.addEventListener("click", startVoiceCall);

  document
    .getElementById("acceptCallBtn")
    ?.addEventListener("click", acceptIncomingCall);

  document
    .getElementById("declineCallBtn")
    ?.addEventListener("click", declineIncomingCall);

  document
    .getElementById("hangupBtn")
    ?.addEventListener("click", () => hangup(true));

  document
    .getElementById("muteCallBtn")
    ?.addEventListener("click", toggleMute);
});


/* =========================================================
   LOAD CONVERSATIONS
   ========================================================= */

async function loadConversations() {
  const { data, error } = await JC.sb
    .from("direct_conversations")
    .select(`
      id,
      created_at,
      direct_participants(
        user_id,
        profiles(
          id,
          username,
          display_name,
          avatar_url
        )
      )
    `)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    console.error("Conversation loading error:", error);
    showConversationError(error.message);
    return;
  }

  conversations = (data || [])
    .map(conversation => {
      const participants =
        conversation.direct_participants || [];

      const otherParticipant =
        participants.find(
          participant =>
            participant.user_id !== JC.user.id
        );

      if (!otherParticipant) {
        return null;
      }

      return {
        id: conversation.id,
        created_at: conversation.created_at,
        other:
          otherParticipant.profiles || {
            id: otherParticipant.user_id,
            display_name: "User",
            username: "user",
            avatar_url: null
          }
      };
    })
    .filter(Boolean);

  renderConversationList();
  await subscribeToConversationList();

  const wantedUser =
    new URLSearchParams(location.search).get("user");

  if (wantedUser) {
    const existing =
      conversations.find(
        conversation =>
          conversation.other.id === wantedUser
      );

    if (existing) {
      await openConversation(existing.id);
    } else {
      await createConversation(wantedUser);
    }
  }
}


/* =========================================================
   CONVERSATION LIST
   ========================================================= */

function renderConversationList() {
  const box =
    document.getElementById("conversationList");

  if (!box) return;

  const search =
    (
      document.getElementById("dmSearch")?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const filtered =
    conversations.filter(conversation => {
      const name =
        (
          conversation.other?.display_name ||
          ""
        ).toLowerCase();

      const username =
        (
          conversation.other?.username ||
          ""
        ).toLowerCase();

      return (
        !search ||
        name.includes(search) ||
        username.includes(search)
      );
    });

  if (!filtered.length) {
    box.innerHTML = `
      <div class="dm-no-conversations">
        <span>✉</span>
        <p>No conversations yet.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = filtered
    .map(conversation => {
      const other = conversation.other;

      let avatarHTML;

      if (other.avatar_url) {
        avatarHTML = `
          <img
            src="${escapeHTML(other.avatar_url)}"
            alt=""
            width="40"
            height="40"
            style="
              width:40px !important;
              height:40px !important;
              min-width:40px !important;
              max-width:40px !important;
              min-height:40px !important;
              max-height:40px !important;
              object-fit:cover !important;
              object-position:center !important;
              border-radius:50% !important;
              display:block !important;
            "
          >
        `;
      } else {
        avatarHTML = `
          <span>
            ${escapeHTML(
              (
                other.display_name || "U"
              )[0].toUpperCase()
            )}
          </span>
        `;
      }

      return `
        <button
          class="dm-conversation ${
            conversation.id === activeConversationId
              ? "active"
              : ""
          }"
          data-conversation="${conversation.id}"
        >
          <div class="dm-list-avatar">
            ${avatarHTML}
          </div>

          <div class="dm-list-text">
            <strong>
              ${escapeHTML(
                other.display_name || "User"
              )}
            </strong>

            <small>
              @${escapeHTML(
                other.username || "user"
              )}
            </small>
          </div>
        </button>
      `;
    })
    .join("");

  box
    .querySelectorAll("[data-conversation]")
    .forEach(button => {
      button.addEventListener("click", () => {
        openConversation(
          button.dataset.conversation
        );
      });
    });
}


/* =========================================================
   PEOPLE
   ========================================================= */

async function preparePeopleModal() {
  const {
    data,
    error
  } = await JC.sb
    .from("profiles")
    .select(
      "id,username,display_name,avatar_url"
    )
    .neq("id", JC.user.id)
    .order("display_name", {
      ascending: true
    })
    .limit(200);

  if (error) {
    console.error(
      "People loading error:",
      error
    );

    window.jcPeople = [];
    return;
  }

  window.jcPeople = data || [];

  renderPeople();
}


function renderPeople() {
  const box =
    document.getElementById("peopleList");

  if (!box) return;

  const search =
    (
      document.getElementById(
        "peopleSearch"
      )?.value || ""
    )
      .trim()
      .toLowerCase();

  const people =
    (window.jcPeople || []).filter(person => {
      const name =
        (
          person.display_name || ""
        ).toLowerCase();

      const username =
        (
          person.username || ""
        ).toLowerCase();

      return (
        !search ||
        name.includes(search) ||
        username.includes(search)
      );
    });

  if (!people.length) {
    box.innerHTML = `
      <div class="dm-no-conversations">
        <span>⌕</span>
        <p>No people found.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = people
    .map(person => {
      let avatarHTML;

      if (person.avatar_url) {
        avatarHTML = `
          <img
            src="${escapeHTML(
              person.avatar_url
            )}"
            alt=""
            width="38"
            height="38"
            style="
              width:38px !important;
              height:38px !important;
              min-width:38px !important;
              max-width:38px !important;
              min-height:38px !important;
              max-height:38px !important;
              object-fit:cover !important;
              object-position:center !important;
              border-radius:50% !important;
              display:block !important;
            "
          >
        `;
      } else {
        avatarHTML = `
          <span>
            ${escapeHTML(
              (
                person.display_name || "U"
              )[0].toUpperCase()
            )}
          </span>
        `;
      }

      return `
        <button
          class="person-row"
          data-user="${person.id}"
        >
          <div class="person-avatar">
            ${avatarHTML}
          </div>

          <div>
            <strong>
              ${escapeHTML(
                person.display_name || "User"
              )}
            </strong>

            <small>
              @${escapeHTML(
                person.username || "user"
              )}
            </small>
          </div>
        </button>
      `;
    })
    .join("");

  box
    .querySelectorAll("[data-user]")
    .forEach(button => {
      button.addEventListener("click", () => {
        createConversation(
          button.dataset.user
        );
      });
    });
}


function openPeopleModal() {
  const search =
    document.getElementById("peopleSearch");

  if (search) search.value = "";

  renderPeople();

  openModal("newDmModal");
}


/* =========================================================
   CREATE / OPEN CONVERSATION
   ========================================================= */

async function createConversation(
  otherUserId
) {
  if (!otherUserId) return;

  const {
    data,
    error
  } = await JC.sb.rpc(
    "get_or_create_dm",
    {
      p_other_user: otherUserId
    }
  );

  if (error) {
    console.error(
      "Create conversation error:",
      error
    );

    alert(error.message);
    return;
  }

  closeModal("newDmModal");

  await loadConversations();

  await openConversation(data);
}


async function openConversation(
  conversationId
) {
  const conversation =
    conversations.find(
      item =>
        item.id === conversationId
    );

  if (!conversation) return;

  activeConversationId =
    conversationId;

  activeOtherUser =
    conversation.other;

  renderConversationList();

  document
    .getElementById("dmEmpty")
    ?.classList.add("hidden");

  document
    .getElementById("dmActive")
    ?.classList.remove("hidden");

  paintActivePerson();

  await loadDMMessages();
  await subscribeToDM();
  await setupCallChannel();
}


/* =========================================================
   ACTIVE PERSON
   ========================================================= */

function paintActivePerson() {
  if (!activeOtherUser) return;

  const avatar =
    document.getElementById("dmAvatar");

  const name =
    activeOtherUser.display_name ||
    "User";

  if (activeOtherUser.avatar_url) {
    avatar.innerHTML = `
      <img
        src="${escapeHTML(
          activeOtherUser.avatar_url
        )}"
        alt=""
        width="46"
        height="46"
        style="
          width:46px !important;
          height:46px !important;
          min-width:46px !important;
          max-width:46px !important;
          min-height:46px !important;
          max-height:46px !important;
          object-fit:cover !important;
          object-position:center !important;
          border-radius:50% !important;
          display:block !important;
        "
      >
    `;
  } else {
    avatar.textContent =
      name[0]?.toUpperCase() || "U";
  }

  document.getElementById(
    "dmName"
  ).textContent = name;

  document.getElementById(
    "dmUsername"
  ).textContent =
    `@${activeOtherUser.username || "user"}`;
}


/* =========================================================
   LOAD MESSAGES
   ========================================================= */

async function loadDMMessages() {
  const {
    data,
    error
  } = await JC.sb
    .from("direct_messages")
    .select(
      "id,conversation_id,user_id,sender_id,content,created_at"
    )
    .eq(
      "conversation_id",
      activeConversationId
    )
    .order("created_at", {
      ascending: true
    })
    .limit(300);

  const box =
    document.getElementById(
      "dmMessages"
    );

  if (!box) return;

  if (error) {
    box.innerHTML = `
      <div class="setup-warning">
        ${escapeHTML(error.message)}
      </div>
    `;

    console.error(
      "Load messages error:",
      error
    );

    return;
  }

  box.innerHTML = "";

  if (!(data || []).length) {
    box.innerHTML = `
      <div class="chat-empty">
        <div>👋</div>
        <h3>Start the conversation.</h3>
        <p>Send the first message.</p>
      </div>
    `;

    return;
  }

  data.forEach(
    appendDMMessage
  );
}


/* =========================================================
   REALTIME MESSAGE SUBSCRIPTION
   ========================================================= */

async function subscribeToDM() {
  if (dmSubscription) {
    await JC.sb.removeChannel(
      dmSubscription
    );

    dmSubscription = null;
  }

  dmSubscription =
    JC.sb
      .channel(
        `dm-messages-${activeConversationId}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter:
            `conversation_id=eq.${activeConversationId}`
        },
        payload => {
          appendDMMessage(
            payload.new
          );
        }
      )
      .subscribe();
}


/* =========================================================
   RENDER MESSAGE
   ========================================================= */

function appendDMMessage(
  message
) {
  const box =
    document.getElementById(
      "dmMessages"
    );

  if (!box) return;

  if (
    box.querySelector(
      `[data-dm-id="${message.id}"]`
    )
  ) {
    return;
  }

  if (
    box.querySelector(".chat-empty")
  ) {
    box.innerHTML = "";
  }

  const senderId =
    message.user_id ||
    message.sender_id;

  const mine =
    senderId === JC.user.id;

  const row =
    document.createElement("div");

  row.className =
    `dm-message ${
      mine ? "mine" : ""
    }`;

  row.dataset.dmId =
    message.id;

  const time =
    new Date(
      message.created_at
    ).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

  row.innerHTML = `
    <div class="dm-bubble">

      <p>
        ${escapeHTML(
          message.content
        )}
      </p>

      <small>
        ${time}
      </small>

    </div>
  `;

  box.appendChild(row);

  box.scrollTop =
    box.scrollHeight;
}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

async function sendDM(event) {
  event.preventDefault();

  if (!activeConversationId) {
    return;
  }

  const input =
    document.getElementById(
      "dmInput"
    );

  if (!input) return;

  const content =
    input.value.trim();

  if (!content) return;

  const {
    error
  } = await JC.sb
    .from("direct_messages")
    .insert({
      conversation_id:
        activeConversationId,

      user_id:
        JC.user.id,

      sender_id:
        JC.user.id,

      content
    });

  if (error) {
    console.error(
      "Send message error:",
      error
    );

    alert(error.message);
    return;
  }

  input.value = "";
  input.focus();
}


/* =========================================================
   CONVERSATION REALTIME
   ========================================================= */

async function subscribeToConversationList() {
  if (dmListSubscription) {
    return;
  }

  dmListSubscription =
    JC.sb
      .channel(
        `dm-list-${JC.user.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_conversations"
        },
        async () => {
          await loadConversations();
        }
      )
      .subscribe();
}


/* =========================================================
   VOICE CALL SIGNALING
   ========================================================= */

async function setupCallChannel() {
  if (!activeConversationId) {
    return;
  }

  if (callChannel) {
    await JC.sb.removeChannel(
      callChannel
    );

    callChannel = null;
  }

  callChannel =
    JC.sb.channel(
      `voice-${activeConversationId}`
    );

  callChannel

    .on(
      "broadcast",
      {
        event: "call-offer"
      },
      async ({ payload }) => {
        if (
          payload.from ===
          JC.user.id
        ) {
          return;
        }

        pendingOffer =
          payload.offer;

        showIncomingCall();
      }
    )

    .on(
      "broadcast",
      {
        event: "call-answer"
      },
      async ({ payload }) => {
        if (
          payload.from ===
          JC.user.id
        ) {
          return;
        }

        if (!peer) {
          return;
        }

        try {
          await peer.setRemoteDescription(
            new RTCSessionDescription(
              payload.answer
            )
          );

          await flushCandidates();

          setCallStatus(
            "Connected"
          );
        } catch (error) {
          console.error(
            "Call answer error:",
            error
          );
        }
      }
    )

    .on(
      "broadcast",
      {
        event: "ice-candidate"
      },
      async ({ payload }) => {
        if (
          payload.from ===
          JC.user.id
        ) {
          return;
        }

        if (!payload.candidate) {
          return;
        }

        if (
          !peer ||
          !peer.remoteDescription
        ) {
          pendingCandidates.push(
            payload.candidate
          );

          return;
        }

        try {
          await peer.addIceCandidate(
            new RTCIceCandidate(
              payload.candidate
            )
          );
        } catch (error) {
          console.error(
            "ICE error:",
            error
          );
        }
      }
    )

    .on(
      "broadcast",
      {
        event: "hangup"
      },
      ({ payload }) => {
        if (
          payload.from ===
          JC.user.id
        ) {
          return;
        }

        hangup(false);
      }
    )

    .subscribe();
}


/* =========================================================
   START CALL
   ========================================================= */

async function startVoiceCall() {
  if (!activeConversationId) {
    return;
  }

  try {
    await setupCallChannel();
    await createPeerConnection();

    localStream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: false
        });

    localStream
      .getTracks()
      .forEach(track => {
        peer.addTrack(
          track,
          localStream
        );
      });

    const offer =
      await peer.createOffer();

    await peer.setLocalDescription(
      offer
    );

    showActiveCall(
      "Calling..."
    );

    await callChannel.send({
      type: "broadcast",
      event: "call-offer",
      payload: {
        from: JC.user.id,
        offer: peer.localDescription
      }
    });

  } catch (error) {
    console.error(
      "Start call error:",
      error
    );

    alert(
      "Couldn't start the call. Check your microphone permission."
    );

    await hangup(false);
  }
}


/* =========================================================
   ACCEPT CALL
   ========================================================= */

async function acceptIncomingCall() {
  if (!pendingOffer) {
    return;
  }

  closeModal(
    "incomingCallModal"
  );

  try {
    await setupCallChannel();
    await createPeerConnection();

    localStream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: false
        });

    localStream
      .getTracks()
      .forEach(track => {
        peer.addTrack(
          track,
          localStream
        );
      });

    await peer.setRemoteDescription(
      new RTCSessionDescription(
        pendingOffer
      )
    );

    await flushCandidates();

    const answer =
      await peer.createAnswer();

    await peer.setLocalDescription(
      answer
    );

    showActiveCall(
      "Connected"
    );

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
    console.error(
      "Accept call error:",
      error
    );

    alert(
      "Couldn't answer the call. Check your microphone permission."
    );

    await hangup(false);
  }
}


/* =========================================================
   WEBRTC
   ========================================================= */

async function createPeerConnection() {
  peer =
    new RTCPeerConnection(
      rtcConfig
    );

  peer.ontrack =
    event => {
      const remoteAudio =
        document.getElementById(
          "remoteAudio"
        );

      if (!remoteAudio) {
        return;
      }

      remoteAudio.srcObject =
        event.streams[0];

      remoteAudio
        .play()
        .catch(() => {});
    };

  peer.onicecandidate =
    async event => {
      if (
        !event.candidate ||
        !callChannel
      ) {
        return;
      }

      await callChannel.send({
        type: "broadcast",
        event: "ice-candidate",
        payload: {
          from: JC.user.id,
          candidate:
            event.candidate
        }
      });
    };

  peer.onconnectionstatechange =
    () => {
      if (!peer) return;

      const state =
        peer.connectionState;

      if (state === "connecting") {
        setCallStatus(
          "Connecting..."
        );
      }

      if (state === "connected") {
        setCallStatus(
          "Connected"
        );
      }

      if (state === "disconnected") {
        setCallStatus(
          "Disconnected"
        );
      }

      if (state === "failed") {
        setCallStatus(
          "Connection failed"
        );
      }
    };
}


/* =========================================================
   ICE
   ========================================================= */

async function flushCandidates() {
  if (
    !peer ||
    !peer.remoteDescription
  ) {
    return;
  }

  for (
    const candidate
    of pendingCandidates
  ) {
    try {
      await peer.addIceCandidate(
        new RTCIceCandidate(
          candidate
        )
      );
    } catch (error) {
      console.error(
        "ICE candidate error:",
        error
      );
    }
  }

  pendingCandidates = [];
}


/* =========================================================
   INCOMING CALL
   ========================================================= */

function showIncomingCall() {
  const name =
    activeOtherUser?.display_name ||
    "Someone";

  const username =
    activeOtherUser?.username ||
    "user";

  const avatar =
    document.getElementById(
      "incomingCallAvatar"
    );

  if (avatar) {

    if (
      activeOtherUser?.avatar_url
    ) {

      avatar.innerHTML = `
        <img
          src="${escapeHTML(
            activeOtherUser.avatar_url
          )}"
          alt=""
          width="64"
          height="64"
          style="
            width:64px !important;
            height:64px !important;
            min-width:64px !important;
            max-width:64px !important;
            min-height:64px !important;
            max-height:64px !important;
            object-fit:cover !important;
            border-radius:50% !important;
            display:block !important;
          "
        >
      `;

    } else {

      avatar.textContent =
        name[0]?.toUpperCase() ||
        "U";

    }
  }

  document.getElementById(
    "incomingCallName"
  ).textContent =
    `${name} is calling`;

  document.getElementById(
    "incomingCallUsername"
  ).textContent =
    `@${username}`;

  openModal(
    "incomingCallModal"
  );
}


function declineIncomingCall() {
  closeModal(
    "incomingCallModal"
  );

  pendingOffer = null;
}


/* =========================================================
   CALL UI
   ========================================================= */

function showActiveCall(
  status
) {
  document
    .getElementById(
      "activeCallBar"
    )
    ?.classList.remove(
      "hidden"
    );

  setCallStatus(
    status
  );
}


function setCallStatus(
  status
) {
  const element =
    document.getElementById(
      "callStatus"
    );

  if (element) {
    element.textContent =
      status;
  }
}


/* =========================================================
   MUTE
   ========================================================= */

function toggleMute() {
  if (!localStream) {
    return;
  }

  const track =
    localStream.getAudioTracks()[0];

  if (!track) {
    return;
  }

  track.enabled =
    !track.enabled;

  const button =
    document.getElementById(
      "muteCallBtn"
    );

  if (button) {
    button.textContent =
      track.enabled
        ? "🎙"
        : "🔇";
  }
}


/* =========================================================
   HANG UP
   ========================================================= */

async function hangup(
  notify = true
) {
  if (
    notify &&
    callChannel
  ) {

    try {
      await callChannel.send({
        type: "broadcast",
        event: "hangup",
        payload: {
          from: JC.user.id
        }
      });
    } catch (error) {
      console.error(
        "Hangup error:",
        error
      );
    }
  }

  if (localStream) {
    localStream
      .getTracks()
      .forEach(
        track =>
          track.stop()
      );

    localStream = null;
  }

  if (peer) {
    peer.ontrack = null;
    peer.onicecandidate = null;
    peer.close();
    peer = null;
  }

  const remoteAudio =
    document.getElementById(
      "remoteAudio"
    );

  if (remoteAudio) {
    remoteAudio.srcObject =
      null;
  }

  pendingOffer = null;
  pendingCandidates = [];

  document
    .getElementById(
      "activeCallBar"
    )
    ?.classList.add(
      "hidden"
    );

  const muteButton =
    document.getElementById(
      "muteCallBtn"
    );

  if (muteButton) {
    muteButton.textContent =
      "🎙";
  }
}


/* =========================================================
   ERROR
   ========================================================= */

function showConversationError(
  message
) {
  const box =
    document.getElementById(
      "conversationList"
    );

  if (!box) return;

  box.innerHTML = `
    <div class="setup-warning">
      ${escapeHTML(message)}
    </div>
  `;
}
