const firebaseConfig = {
  apiKey: "AIzaSyAIwD3ieFkZh53Us_GCNz6nos-wetw-QAw",
  authDomain: "chatapppr-e8c2c.firebaseapp.com",
  databaseURL: "https://chatapppr-e8c2c-default-rtdb.firebaseio.com",
  projectId: "chatapppr-e8c2c",
  storageBucket: "chatapppr-e8c2c.firebasestorage.app",
  messagingSenderId: "103184004945",
  appId: "1:103184004945:web:666285ddf537dfa3b94570",
  measurementId: "G-Z2GMXKNK2T"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let myUserId = localStorage.getItem('whatsapp_private_myid');
if (!myUserId) {
  myUserId = "ID_" + Math.floor(1000 + Math.random() * 9000);
  localStorage.setItem('whatsapp_private_myid', myUserId);
}
document.getElementById("myIdDisplayList").innerText = myUserId;

// ================================================================
//   E2EE ENCRYPTION / DECRYPTION (WEB CRYPTO API)
// ================================================================
let e2eeEnabled = false;
async function generateChatKey(secretText) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(secretText), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("whatsapp_e2ee_salt"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function encryptText(plainText, secret) {
  try {
    const key = await generateChatKey(secret);
    const iv = crypto.subtle.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plainText));
    return {
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv))
    };
  } catch(e) { console.error('E2EE Encrypt Error:', e); return null; }
}

async function decryptText(encryptedObj, secret) {
  try {
    const key = await generateChatKey(secret);
    const iv = new Uint8Array(atob(encryptedObj.iv).split("").map(c => c.charCodeAt(0)));
    const ciphertext = new Uint8Array(atob(encryptedObj.ciphertext).split("").map(c => c.charCodeAt(0)));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch(e) { return "🔒 [رسالة مشفرة بـ E2EE]"; }
}

function toggleE2EE() {
  e2eeEnabled = !e2eeEnabled;
  const btn = document.getElementById('e2eeToggleBtn');
  btn.classList.toggle('active-search', e2eeEnabled);
  alert(e2eeEnabled ? '🔒 تم تفعيل التشفير التام (E2EE) لهذه المحادثة.' : '🔓 تم إيقاف التشفير التام.');
}

// ================================================================
//   THEMES & FONT SIZE
// ================================================================
function applyColorTheme(primary, dark, sent) {
  document.documentElement.style.setProperty('--primary-color', primary);
  document.documentElement.style.setProperty('--primary-dark', dark);
  document.documentElement.style.setProperty('--sent-msg', sent);
  localStorage.setItem('whatsapp_color_theme', JSON.stringify({ primary, dark, sent }));
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.style.backgroundColor === primary));
}
function loadSavedTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem('whatsapp_color_theme'));
    if (saved) applyColorTheme(saved.primary, saved.dark, saved.sent);
  } catch(e) {}
}

function changeFontSize(size) {
  document.body.className = 'font-' + size;
  localStorage.setItem('whatsapp_font_size', size);
  document.getElementById('fontSizeSelect').value = size;
}
function loadSavedFontSize() {
  const sz = localStorage.getItem('whatsapp_font_size') || 'medium';
  changeFontSize(sz);
}

loadSavedTheme();
loadSavedFontSize();

// ================================================================
//   QUICK REPLIES
// ================================================================
function getQuickReplies() {
  try { return JSON.parse(localStorage.getItem('whatsapp_quick_replies') || '["مرحباً 👋", "شكراً لك! 🙏", "أنا في الطريق 🚗", "تمام 👍", "اتصل بي 📞"]'); }
  catch(e) { return ["مرحباً 👋", "شكراً لك! 🙏", "أنا في الطريق 🚗"]; }
}
function renderQuickReplies() {
  const chipsDiv = document.getElementById('quickReplyChips');
  chipsDiv.innerHTML = '';
  getQuickReplies().forEach(text => {
    const chip = document.createElement('div');
    chip.className = 'qr-chip';
    chip.innerText = text;
    chip.onclick = () => {
      const input = document.getElementById('messageInput');
      input.value = text;
      input.focus();
    };
    chipsDiv.appendChild(chip);
  });
}
function addQuickReplyPrompt() {
  const text = prompt('أدخل رد سريع جديد:');
  if (!text || !text.trim()) return;
  const replies = getQuickReplies();
  replies.push(text.trim());
  localStorage.setItem('whatsapp_quick_replies', JSON.stringify(replies));
  renderQuickReplies();
}
renderQuickReplies();

// ================================================================
//   CHAT FOLDERS
// ================================================================
let currentFolderTab = 'all';
function setFolderTab(folder) {
  currentFolderTab = folder;
  document.querySelectorAll('.folder-chip').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  renderChatsList();
}
function getChatFolders() {
  try { return JSON.parse(localStorage.getItem('whatsapp_chat_folders') || '{}'); } catch(e) { return {}; }
}
function setChatFolder(id, folder) {
  const f = getChatFolders();
  if (folder) f[id] = folder; else delete f[id];
  localStorage.setItem('whatsapp_chat_folders', JSON.stringify(f));
  renderChatsList();
}

// ================================================================
//   PIN MESSAGES INSIDE CHAT
// ================================================================
let pinnedMsgKey = null;
function pinMessage(msgKey, data) {
  if (!currentRoomPath) return;
  const pinData = { key: msgKey, sender: data.sender, text: data.text || (data.image ? '📷 صورة' : (data.audio ? '🎤 رسالة صوتية' : '📎 مرفق')) };
  localStorage.setItem('whatsapp_pinned_' + currentRoomPath, JSON.stringify(pinData));
  renderPinnedMsgBar();
  alert('📌 تم تثبيت الرسالة أعلاه.');
}
function unpinCurrentMessage() {
  if (!currentRoomPath) return;
  localStorage.removeItem('whatsapp_pinned_' + currentRoomPath);
  renderPinnedMsgBar();
}
function renderPinnedMsgBar() {
  const bar = document.getElementById('pinnedMsgBar');
  if (!currentRoomPath) { bar.style.display = 'none'; return; }
  try {
    const pinData = JSON.parse(localStorage.getItem('whatsapp_pinned_' + currentRoomPath));
    if (pinData) {
      pinnedMsgKey = pinData.key;
      document.getElementById('pmText').innerText = (pinData.sender === myUserId ? 'أنت' : pinData.sender) + ': ' + pinData.text;
      bar.style.display = 'flex';
    } else {
      pinnedMsgKey = null;
      bar.style.display = 'none';
    }
  } catch(e) { bar.style.display = 'none'; }
}
function scrollToPinnedMsg() {
  if (!pinnedMsgKey || !msgElements[pinnedMsgKey]) { alert('⚠️ الرسالة المثبتة لم تُحمل بعد.'); return; }
  const el = msgElements[pinnedMsgKey];
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('highlight-pinned');
  void el.offsetWidth;
  el.classList.add('highlight-pinned');
}

// ================================================================
//   CONTACT SHARE MODAL
// ================================================================
function openContactShareModal() {
  renderContactShareList();
  document.getElementById('contactShareModal').style.display = 'flex';
}
function closeContactShareModal() { document.getElementById('contactShareModal').style.display = 'none'; }
function renderContactShareList() {
  const list = document.getElementById('contactShareList');
  const q = document.getElementById('contactSearchInput').value.trim().toLowerCase();
  list.innerHTML = '';
  const contacts = Object.values(getContacts());
  contacts.filter(c => !q || c.id.toLowerCase().includes(q)).forEach(c => {
    const row = document.createElement('div');
    row.className = 'forward-row';
    row.innerHTML = `<span>👤</span><span>${c.id}</span>`;
    row.onclick = () => { sendContactCard(c.id); closeContactShareModal(); };
    list.appendChild(row);
  });
  if (contacts.length === 0) list.innerHTML = '<p style="color:#67747a; font-size:12px; padding:10px;">لا توجد جهات اتصال محفوظة بعد.</p>';
}
function sendContactCard(contactId) {
  if (!chatRoomRef) { alert('⚠️ افتح محادثة أولاً.'); return; }
  const payload = { sender: myUserId, contactShare: contactId, timestamp: Date.now() };
  if (!isGroupChat()) payload.read = false;
  chatRoomRef.push(payload);
  playSendSound();
}
function sendCustomContactShare() {
  const id = document.getElementById('contactSearchInput').value.trim();
  if (!id) { alert('أدخل ID شخص.'); return; }
  sendContactCard(id);
  closeContactShareModal();
}

// ================================================================
//   SETTINGS & BACKUP & STATS
// ================================================================
function openSettingsModal() { document.getElementById('settingsModal').style.display = 'flex'; }
function closeSettingsModal() { document.getElementById('settingsModal').style.display = 'none'; }

function exportBackupData() {
  const backup = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('whatsapp_')) backup[k] = localStorage.getItem(k);
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `whatsapp_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  alert('✅ تم تصدير النسخة الاحتياطية بنجاح.');
}

function importBackupData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      let count = 0;
      Object.entries(data).forEach(([k, v]) => {
        if (k.startsWith('whatsapp_')) { localStorage.setItem(k, v); count++; }
      });
      alert(`✅ تم استيراد ${count} عنصر بنجاح! جارٍ تحديث الصفحة...`);
      location.reload();
    } catch(err) { alert('❌ خطأ في ملف النسخة الاحتياطية.'); }
  };
  reader.readAsText(file);
}

function openStatsModal() {
  const contacts = Object.keys(getContacts());
  const groups = Object.keys(getMyGroups());
  let msgCount = Object.keys(msgElements).length;
  let sizeKb = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('whatsapp_')) sizeKb += (localStorage.getItem(k).length * 2) / 1024;
  }
  
  document.getElementById('statsContent').innerHTML = `
    <div class="stat-card">عدد جهات الاتصال: <b>${contacts.length}</b></div>
    <div class="stat-card">عدد المجموعات: <b>${groups.length}</b></div>
    <div class="stat-card">الرسائل المحملة حالياً: <b>${msgCount}</b></div>
    <div class="stat-card">حجم البيانات المحلية: <b>${sizeKb.toFixed(1)} KB</b></div>
  `;
  document.getElementById('statsModal').style.display = 'flex';
}
function closeStatsModal() { document.getElementById('statsModal').style.display = 'none'; }

function openSecurityRulesModal() {
  const rules = `{
"rules": {
  "private_chats": {
    "$roomId": {
      ".read": "true",
      ".write": "true"
    }
  },
  "groups": {
    "$groupId": {
      ".read": "true",
      ".write": "true"
    }
  },
  "presence": {
    "$userId": {
      ".read": "true",
      ".write": "true"
    }
  },
  "profiles": {
    "$userId": {
      ".read": "true",
      ".write": "true"
    }
  },
  "statuses": {
    "$userId": {
      ".read": "true",
      ".write": "true"
    }
  },
  "calls": {
    "$userId": {
      ".read": "true",
      ".write": "true"
    }
  }
}
}`;
  document.getElementById('firebaseRulesText').value = rules;
  document.getElementById('securityRulesModal').style.display = 'flex';
}
function closeSecurityRulesModal() { document.getElementById('securityRulesModal').style.display = 'none'; }
function copyFirebaseRules() {
  const txt = document.getElementById('firebaseRulesText');
  txt.select();
  navigator.clipboard.writeText(txt.value);
  alert('📋 تم نسخ قواعد أمان Firebase للمحافظة.');
}

// ================================================================
//   WEB SPEECH API (VOICE DICTATION & AUDIO TRANSCRIPTION)
// ================================================================
let speechRecognizer = null;
function toggleVoiceDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { alert('⚠️ متصفحك لا يدعم Web Speech API.'); return; }
  const btn = document.getElementById('sttDictateBtn');
  if (speechRecognizer) {
    speechRecognizer.stop(); speechRecognizer = null;
    btn.classList.remove('active');
    return;
  }
  speechRecognizer = new SpeechRecognition();
  speechRecognizer.lang = 'ar-SA';
  speechRecognizer.continuous = false;
  speechRecognizer.interimResults = true;
  speechRecognizer.onstart = () => btn.classList.add('active');
  speechRecognizer.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('messageInput').value = transcript;
  };
  speechRecognizer.onerror = () => { btn.classList.remove('active'); speechRecognizer = null; };
  speechRecognizer.onend = () => { btn.classList.remove('active'); speechRecognizer = null; };
  speechRecognizer.start();
}

function transcribeAudioMsg(msgKey, audioUrl, containerEl) {
  let box = containerEl.querySelector('.stt-box');
  if (box) { box.remove(); return; }
  box = document.createElement('div');
  box.className = 'stt-box';
  box.innerText = '🎙️ جارٍ الاستماع والتحويل لنص...';
  containerEl.appendChild(box);

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { box.innerText = '⚠️ متصفحك لا يدعم تحويل الصوت لنص تلقائياً.'; return; }
  
  const audio = new Audio(audioUrl);
  const recognition = new SpeechRecognition();
  recognition.lang = 'ar-SA';
  recognition.continuous = true;
  recognition.interimResults = true;
  let fullText = '';
  recognition.onresult = (e) => {
    fullText = Array.from(e.results).map(r => r[0].transcript).join('');
    box.innerText = '📝 النص: ' + fullText;
  };
  recognition.onend = () => {
    if (!fullText) box.innerText = '📝 (لم يتم التعرف على كلمات واضحة)';
  };
  audio.play();
  recognition.start();
  audio.onended = () => recognition.stop();
}

// ================================================================
//   AVATAR
// ================================================================
function getMyAvatar() { return localStorage.getItem('whatsapp_avatar_' + myUserId) || null; }
function setMyAvatarLocal(dataUrl) { localStorage.setItem('whatsapp_avatar_' + myUserId, dataUrl); }
function renderMyAvatarBtn() {
  const el = document.getElementById('myAvatarBtn');
  const av = getMyAvatar();
  el.innerHTML = av ? `<img class="avatar-img" src="${av}">` : '<i class="fa-solid fa-user"></i>';
}
function handleAvatarSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 300 * 1024) { alert("⚠️ الصورة كبيرة جداً (الحد 300KB)."); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    setMyAvatarLocal(e.target.result);
    db.ref('profiles/' + myUserId + '/avatar').set(e.target.result);
    renderMyAvatarBtn();
    renderChatsList();
  };
  reader.readAsDataURL(file);
}
const avatarCache = {};
function fetchAvatar(userId, cb) {
  if (avatarCache[userId] !== undefined) { cb(avatarCache[userId]); return; }
  db.ref('profiles/' + userId + '/avatar').once('value', (snap) => {
    const val = snap.val() || null;
    avatarCache[userId] = val;
    cb(val);
  });
}
renderMyAvatarBtn();

// ================================================================
//   RIPPLE EFFECT
// ================================================================
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.call-btn, .icon-btn, .input-box button, #newChatFab, .new-chat-bar button, .modal-box button');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.className = 'ripple-effect';
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  const prevPos = getComputedStyle(btn).position;
  if (prevPos === 'static') btn.style.position = 'relative';
  btn.style.overflow = 'hidden';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 550);
});

// ================================================================
//   DISPLAY NAME / PROFILE
// ================================================================
function getMyDisplayName() { return localStorage.getItem('whatsapp_display_name_' + myUserId) || ''; }
function openProfileModal() {
  document.getElementById('displayNameInput').value = getMyDisplayName();
  const av = getMyAvatar();
  document.getElementById('profileAvatarPreview').innerHTML = av ? `<img src="${av}">` : '<i class="fa-solid fa-user"></i>';
  document.getElementById('profileModal').style.display = 'flex';
}
function closeProfileModal() { document.getElementById('profileModal').style.display = 'none'; }
function saveProfileName() {
  const name = document.getElementById('displayNameInput').value.trim();
  localStorage.setItem('whatsapp_display_name_' + myUserId, name);
  db.ref('profiles/' + myUserId + '/displayName').set(name || null);
  closeProfileModal();
  renderChatsList();
}
const profileCache = {};
function fetchDisplayName(userId, cb) {
  if (profileCache[userId] !== undefined) { cb(profileCache[userId]); return; }
  db.ref('profiles/' + userId + '/displayName').once('value', (snap) => {
    const val = snap.val() || null;
    profileCache[userId] = val;
    cb(val);
  });
}

// ================================================================
//   BLOCK USER
// ================================================================
function getBlockedSet() { try { return new Set(JSON.parse(localStorage.getItem('whatsapp_blocked') || '[]')); } catch(e){ return new Set(); } }
function saveBlockedSet(s) { localStorage.setItem('whatsapp_blocked', JSON.stringify([...s])); }
function isUserBlocked(id) { return getBlockedSet().has(id); }
function toggleBlockUser() {
  if (!targetUserId) return;
  const s = getBlockedSet();
  if (s.has(targetUserId)) {
    s.delete(targetUserId);
    alert(`✅ تم إلغاء حظر ${targetUserId}`);
  } else {
    if (!confirm(`🚫 حظر ${targetUserId}؟ لن تصلك رسائله أو مكالماته.`)) return;
    s.add(targetUserId);
    alert(`🚫 تم حظر ${targetUserId}`);
  }
  saveBlockedSet(s);
  updateBlockBtnState();
}
function updateBlockBtnState() {
  const btn = document.getElementById('blockToggleBtn');
  if (!targetUserId) { btn.style.display = 'none'; return; }
  btn.style.display = 'flex';
  btn.classList.toggle('active-search', isUserBlocked(targetUserId));
}

// ================================================================
//   EDIT MESSAGE
// ================================================================
function editMessage(key, oldText) {
  const newText = prompt('تعديل الرسالة:', oldText || '');
  if (newText === null) return;
  const trimmed = newText.trim();
  if (!trimmed) return;
  chatRoomRef.child(key).update({ text: trimmed, edited: true });
}

// ================================================================
//   DISAPPEARING MESSAGES
// ================================================================
function getDisappearSetting(roomPath) {
  if (!roomPath) return 0;
  return parseInt(localStorage.getItem('whatsapp_disappear_' + roomPath) || '0', 10);
}
function openDisappearModal() {
  if (!currentRoomPath) { alert('⚠️ افتح محادثة أولاً.'); return; }
  document.getElementById('disappearSelect').value = String(getDisappearSetting(currentRoomPath));
  document.getElementById('disappearModal').style.display = 'flex';
}
function closeDisappearModal() { document.getElementById('disappearModal').style.display = 'none'; }
function saveDisappearSetting() {
  const val = document.getElementById('disappearSelect').value;
  localStorage.setItem('whatsapp_disappear_' + currentRoomPath, val);
  closeDisappearModal();
  alert(val === '0' ? '✅ تم إيقاف الرسائل المؤقتة.' : '✅ الرسائل الجديدة ستختفي تلقائياً.');
}
setInterval(() => {
  if (!chatRoomRef) return;
  Object.entries(msgElements).forEach(([key, el]) => {});
}, 30000);
function sweepExpiredOnDisplay(data, key) {
  if (data.expiresAt && Date.now() > data.expiresAt) {
    chatRoomRef.child(key).remove();
    return true;
  }
  if (data.expiresAt) {
    setTimeout(() => { chatRoomRef.child(key).remove(); }, Math.max(0, data.expiresAt - Date.now()));
  }
  return false;
}

// ================================================================
//   FORWARD MESSAGE
// ================================================================
let forwardingData = null;
function openForwardModal(data) {
  forwardingData = data;
  const list = document.getElementById('forwardList');
  list.innerHTML = '';
  const contacts = Object.values(getContacts());
  const groups = Object.values(getMyGroups());
  [...contacts, ...groups].forEach(item => {
    const isGroup = item.type === 'group';
    const row = document.createElement('div');
    row.className = 'forward-row';
    row.innerHTML = `<span>${isGroup ? '<i class="fa-solid fa-users"></i>' : '<i class="fa-solid fa-user"></i>'}</span><span>${isGroup ? item.name : item.id}</span>`;
    row.onclick = () => {
      const path = isGroup ? ('groups/' + item.id + '/messages') : ('private_chats/' + getRoomId(myUserId, item.id));
      const payload = { sender: myUserId, timestamp: Date.now() };
      if (forwardingData.text) payload.text = forwardingData.text;
      if (forwardingData.image) payload.image = forwardingData.image;
      if (forwardingData.audio) payload.audio = forwardingData.audio;
      if (forwardingData.doc) payload.doc = forwardingData.doc;
      if (forwardingData.location) payload.location = forwardingData.location;
      if (forwardingData.contactShare) payload.contactShare = forwardingData.contactShare;
      if (!isGroup) payload.read = false;
      db.ref(path).push(payload);
      closeForwardModal();
      alert('✅ تم التوجيه.');
    };
    list.appendChild(row);
  });
  if (contacts.length + groups.length === 0) list.innerHTML = '<p style="color:#67747a; font-size:13px;">لا توجد محادثات لإعادة التوجيه إليها.</p>';
  document.getElementById('forwardModal').style.display = 'flex';
}
function closeForwardModal() { document.getElementById('forwardModal').style.display = 'none'; forwardingData = null; }

// ================================================================
//   UNREAD BADGES
// ================================================================
function getUnreadMap() { try { return JSON.parse(localStorage.getItem('whatsapp_unread') || '{}'); } catch(e){ return {}; } }
function saveUnreadMap(m) { localStorage.setItem('whatsapp_unread', JSON.stringify(m)); }
function incrementUnread(id) {
  const m = getUnreadMap();
  m[id] = (m[id] || 0) + 1;
  saveUnreadMap(m);
}
function clearUnread(id) {
  const m = getUnreadMap();
  if (m[id]) { delete m[id]; saveUnreadMap(m); }
}

// ================================================================
//   PIN / ARCHIVE
// ================================================================
let showingArchive = false;
function toggleArchiveView() {
  showingArchive = !showingArchive;
  document.getElementById('archiveToggleBtn').classList.toggle('active-search', showingArchive);
  renderChatsList();
}
function togglePin(id, isGroup) {
  if (isGroup) { const g = getMyGroups(); g[id].pinned = !g[id].pinned; saveMyGroups(g); }
  else { const c = getContacts(); c[id].pinned = !c[id].pinned; saveContacts(c); }
  renderChatsList();
}
function toggleArchive(id, isGroup) {
  if (isGroup) { const g = getMyGroups(); g[id].archived = !g[id].archived; saveMyGroups(g); }
  else { const c = getContacts(); c[id].archived = !c[id].archived; saveContacts(c); }
  renderChatsList();
}
function openChatRowSheet(id, isGroup, label) {
  const sheet = document.getElementById('chatRowSheetContent');
  sheet.innerHTML = '';
  const currentF = getChatFolders()[id] || '';
  const items = [
    ['📌 تثبيت/إلغاء تثبيت', () => togglePin(id, isGroup)],
    ['🗄️ أرشفة/إلغاء أرشفة', () => toggleArchive(id, isGroup)],
    [`📁 نقل إلى مجلد (${currentF === 'fav' ? 'مفضلة' : currentF === 'work' ? 'عمل' : currentF === 'family' ? 'عائلة' : 'بدون'})`, () => promptSetFolder(id)]
  ];
  if (!isGroup) {
    items.push(['🚫 حظر/إلغاء حظر', () => { const s = getBlockedSet(); s.has(id) ? s.delete(id) : s.add(id); saveBlockedSet(s); }]);
  }
  items.forEach(([label2, fn]) => {
    const el = document.createElement('div');
    el.className = 'sheet-item';
    el.innerText = label2;
    el.onclick = () => { fn(); closeChatRowSheet(); };
    sheet.appendChild(el);
  });
  document.getElementById('chatRowSheetOverlay').style.display = 'flex';
}
function promptSetFolder(id) {
  const f = prompt('اختر المجلد (1: المفضلة, 2: عمل, 3: عائلة, 0: إزالة):', '1');
  if (f === '1') setChatFolder(id, 'fav');
  else if (f === '2') setChatFolder(id, 'work');
  else if (f === '3') setChatFolder(id, 'family');
  else if (f === '0') setChatFolder(id, null);
}
function closeChatRowSheet() { document.getElementById('chatRowSheetOverlay').style.display = 'none'; }

// ================================================================
//   LANGUAGE TOGGLE (AR/EN)
// ================================================================
const EN_LABELS = {
  chats: 'Chats', newChat: 'New chat', newGroup: 'New group', typeMessage: 'Type a message...'
};
function toggleLanguage() {
  const isEn = document.body.classList.toggle('lang-en');
  localStorage.setItem('whatsapp_lang', isEn ? 'en' : 'ar');
  document.getElementById('newChatIdInput').placeholder = isEn ? '📱 Start a new chat by ID...' : '📱 ابدأ محادثة جديدة بإدخال ID...';
  document.getElementById('messageInput').placeholder = isEn ? EN_LABELS.typeMessage : 'اكتب رسالة...';
  document.querySelector('.list-header h2').innerText = isEn ? '💬 ' + EN_LABELS.chats : '💬 المحادثات';
}
if (localStorage.getItem('whatsapp_lang') === 'en') { document.addEventListener('DOMContentLoaded', toggleLanguage); }

// ================================================================
//   APP LOCK (PIN)
// ================================================================
let pinBuffer = '';
let pinMode = 'unlock';
let pendingNewPin = '';

function getSavedPin() { return localStorage.getItem('whatsapp_app_pin'); }
function buildPinPad() {
  const pad = document.getElementById('pinPad');
  pad.innerHTML = '';
  ['1','2','3','4','5','6','7','8','9','⌫','0','✓'].forEach(k => {
    const btn = document.createElement('button');
    btn.innerText = k;
    btn.onclick = () => handlePinKey(k);
    pad.appendChild(btn);
  });
}
function handlePinKey(k) {
  if (k === '⌫') { pinBuffer = pinBuffer.slice(0, -1); updatePinDots(); return; }
  if (k === '✓') { submitPin(); return; }
  if (pinBuffer.length < 4) { pinBuffer += k; updatePinDots(); }
  if (pinBuffer.length === 4) submitPin();
}
function updatePinDots() {
  document.querySelectorAll('#pinDots span').forEach((dot, i) => dot.classList.toggle('filled', i < pinBuffer.length));
}
function submitPin() {
  const savedPin = getSavedPin();
  if (pinMode === 'unlock') {
    if (pinBuffer === savedPin) { hideLockScreen(); }
    else { showPinError('رمز غير صحيح'); }
  } else if (pinMode === 'setup') {
    pendingNewPin = pinBuffer;
    pinMode = 'confirm';
    pinBuffer = ''; updatePinDots();
    document.getElementById('lockTitle').innerText = 'أعد إدخال الرمز للتأكيد';
  } else if (pinMode === 'confirm') {
    if (pinBuffer === pendingNewPin) {
      localStorage.setItem('whatsapp_app_pin', pinBuffer);
      alert('✅ تم ضبط رمز القفل.');
      hideLockScreen();
    } else {
      showPinError('الرمزان غير متطابقين، حاول مجدداً');
      pinMode = 'setup'; pendingNewPin = '';
      document.getElementById('lockTitle').innerText = 'أدخل رمز جديد';
    }
  }
}
function showPinError(msg) {
  document.getElementById('lockError').innerText = msg;
  pinBuffer = ''; updatePinDots();
  setTimeout(() => { document.getElementById('lockError').innerText = ''; }, 1800);
}
function showLockScreenForUnlock() {
  pinMode = 'unlock'; pinBuffer = '';
  document.getElementById('lockTitle').innerText = 'أدخل رمز القفل';
  document.getElementById('lockForgotBtn').style.display = 'block';
  updatePinDots();
  document.getElementById('lockScreen').style.display = 'flex';
}
function showLockScreenForSetup() {
  pinMode = 'setup'; pinBuffer = ''; pendingNewPin = '';
  document.getElementById('lockTitle').innerText = 'أدخل رمز جديد';
  document.getElementById('lockForgotBtn').style.display = 'none';
  updatePinDots();
  document.getElementById('lockScreen').style.display = 'flex';
}
function hideLockScreen() { document.getElementById('lockScreen').style.display = 'none'; pinBuffer = ''; }
function forgotPin() {
  if (confirm('⚠️ إعادة تعيين الرمز ستزيل القفل الحالي (بياناتك لن تُحذف). متابعة؟')) {
    localStorage.removeItem('whatsapp_app_pin');
    hideLockScreen();
  }
}
function openLockSettings() {
  const has = !!getSavedPin();
  document.getElementById('lockSettingsDesc').innerText = has ? 'القفل مفعّل حالياً. يمكنك تغييره أو إزالته.' : 'اضبط رمز PIN من 4 أرقام لحماية التطبيق.';
  document.getElementById('lockSettingsActionBtn').innerText = has ? 'تغيير الرمز' : 'ضبط رمز';
  document.getElementById('lockSettingsModal').style.display = 'flex';
  const modalBox = document.getElementById('lockSettingsModal').querySelector('.modal-box');
  let removeBtn = document.getElementById('lockRemoveBtn');
  if (has && !removeBtn) {
    removeBtn = document.createElement('button');
    removeBtn.id = 'lockRemoveBtn';
    removeBtn.className = 'modal-cancel';
    removeBtn.style.background = '#e53935';
    removeBtn.innerText = 'إزالة القفل';
    removeBtn.onclick = () => { localStorage.removeItem('whatsapp_app_pin'); closeLockSettingsModal(); alert('تم إزالة القفل.'); };
    modalBox.querySelector('.modal-actions').prepend(removeBtn);
  } else if (!has && removeBtn) { removeBtn.remove(); }
}
function closeLockSettingsModal() { document.getElementById('lockSettingsModal').style.display = 'none'; }
function startSetPin() { closeLockSettingsModal(); showLockScreenForSetup(); }

buildPinPad();
if (getSavedPin()) showLockScreenForUnlock();

// ================================================================
//   STATUS (24h disappearing)
// ================================================================
const STATUS_TTL = 24 * 60 * 60 * 1000;
function openAddStatusModal() { document.getElementById('addStatusModal').style.display = 'flex'; }
function closeAddStatusModal() {
  document.getElementById('addStatusModal').style.display = 'none';
  document.getElementById('statusTextInput').value = '';
  document.getElementById('statusImageInput').value = '';
}
function publishStatus() {
  const text = document.getElementById('statusTextInput').value.trim();
  const file = document.getElementById('statusImageInput').files[0];
  if (!text && !file) { alert('⚠️ اكتب نصاً أو اختر صورة.'); return; }
  const push = (imageData) => {
    db.ref('statuses/' + myUserId).push({ text, image: imageData || null, timestamp: Date.now() });
    closeAddStatusModal();
    renderStatusStrip();
  };
  if (file) {
    if (file.size > 400 * 1024) { alert('⚠️ الصورة كبيرة جداً (الحد 400KB).'); return; }
    const reader = new FileReader();
    reader.onload = (e) => push(e.target.result);
    reader.readAsDataURL(file);
  } else { push(null); }
}

function getStatusPeople() {
  const contacts = Object.keys(getContacts());
  return [...new Set([myUserId, ...contacts])];
}

let currentStatusQueue = [];
let currentStatusIdx = 0;
let statusTimer = null;

function renderStatusStrip() {
  const strip = document.getElementById('statusStrip');
  strip.innerHTML = '';
  const people = getStatusPeople();
  let pending = people.length;
  const results = {};
  if (pending === 0) { strip.style.display = 'none'; return; }
  people.forEach(pid => {
    db.ref('statuses/' + pid).once('value', (snap) => {
      const val = snap.val() || {};
      const fresh = Object.entries(val).filter(([k,v]) => Date.now() - v.timestamp < STATUS_TTL);
      results[pid] = fresh;
      pending--;
      if (pending === 0) buildStatusStripUI(results);
    });
  });
}

function buildStatusStripUI(results) {
  const strip = document.getElementById('statusStrip');
  strip.innerHTML = '';
  strip.style.display = 'flex';

  const myItems = results[myUserId] || [];
  const myItem = document.createElement('div');
  myItem.className = 'status-item';
  myItem.onclick = () => myItems.length ? openStatusViewer(myUserId, myItems) : openAddStatusModal();
  const av = getMyAvatar();
  myItem.innerHTML = `
    <div class="status-ring ${myItems.length ? '' : 'seen'}" style="position:relative;">
      ${av ? `<img class="status-avatar" src="${av}">` : `<div class="status-avatar-fallback">أنا</div>`}
      <div class="status-add-badge">+</div>
    </div>
    <span class="status-label">حالتي</span>
  `;
  strip.appendChild(myItem);

  Object.entries(results).forEach(([pid, items]) => {
    if (pid === myUserId || items.length === 0) return;
    const el = document.createElement('div');
    el.className = 'status-item';
    el.onclick = () => openStatusViewer(pid, items);
    fetchAvatar(pid, (av2) => {
      const ring = el.querySelector('.status-ring');
      if (av2) ring.querySelector('.status-avatar-fallback')?.replaceWith(Object.assign(document.createElement('img'), { className: 'status-avatar', src: av2 }));
    });
    const initials = pid.replace(/[^A-Za-z0-9]/g, '').slice(-2).toUpperCase() || 'ID';
    el.innerHTML = `
      <div class="status-ring">
        <div class="status-avatar-fallback">${initials}</div>
      </div>
      <span class="status-label">${pid}</span>
    `;
    strip.appendChild(el);
  });
}

function openStatusViewer(senderId, items) {
  currentStatusQueue = items.map(([k,v]) => ({ key: k, ...v, sender: senderId }));
  currentStatusIdx = 0;
  document.getElementById('statusViewerOverlay').style.display = 'flex';
  showCurrentStatus();
}
function showCurrentStatus() {
  if (currentStatusIdx >= currentStatusQueue.length) { closeStatusViewer(); return; }
  const s = currentStatusQueue[currentStatusIdx];
  document.getElementById('svSenderName').innerText = s.sender === myUserId ? 'أنت' : s.sender;
  document.getElementById('svTime').innerText = formatTime(s.timestamp);
  const content = document.getElementById('svContent');
  content.innerHTML = '';
  if (s.image) { const img = document.createElement('img'); img.src = s.image; content.appendChild(img); }
  if (s.text) { const p = document.createElement('div'); p.innerText = s.text; p.style.marginTop = s.image ? '10px' : '0'; content.appendChild(p); }

  const fill = document.getElementById('svProgressFill');
  fill.style.width = '0%';
  clearTimeout(statusTimer);
  let start = Date.now();
  const duration = 4000;
  function tick() {
    const pct = Math.min(100, ((Date.now() - start) / duration) * 100);
    fill.style.width = pct + '%';
    if (pct < 100) statusTimer = setTimeout(tick, 50);
    else { currentStatusIdx++; showCurrentStatus(); }
  }
  tick();
}
function closeStatusViewer() {
  clearTimeout(statusTimer);
  document.getElementById('statusViewerOverlay').style.display = 'none';
}

// ================================================================
//   PWA SERVICE WORKER
// ================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  });
}

let targetUserId = null;
let currentGroupId = null;
let chatRoomRef = null;
let presenceRef = null;
let typingRef = null;
let isMuted = false;
let darkMode = false;
let pendingImageData = null;
let typingTimeout = null;
let replyingTo = null;
const shownDateSeps = new Set();
const msgElements = {};

function resetMessagesBox() {
  const box = document.getElementById("messagesBox");
  box.innerHTML = '<button id="loadOlderBtn" style="display:none;" onclick="loadOlderMessages()"><i class="fa-solid fa-arrow-up"></i> تحميل رسائل أقدم</button>';
  shownDateSeps.clear();
  Object.keys(msgElements).forEach(k => delete msgElements[k]);
}

function loadOlderMessages() {
  if (!currentRoomPath || oldestLoadedTs === null) return;
  const btn = document.getElementById('loadOlderBtn');
  btn.innerText = 'جارٍ التحميل...';
  db.ref(currentRoomPath).orderByChild('timestamp').endBefore(oldestLoadedTs).limitToLast(30).once('value', (snap) => {
    const vals = snap.val() || {};
    const entries = Object.entries(vals).sort((a,b) => a[1].timestamp - b[1].timestamp);
    const hidden = getHiddenSet(isGroupChat() ? ('group_' + currentGroupId) : getRoomId(myUserId, targetUserId));
    entries.forEach(([key, data]) => {
      if (hidden.has(key) || msgElements[key]) return;
      if (data.timestamp < oldestLoadedTs) oldestLoadedTs = data.timestamp;
      displayMessage(data, key, isGroupChat(), true);
    });
    btn.innerText = '⬆️ تحميل رسائل أقدم';
    if (entries.length === 0) btn.style.display = 'none';
  });
}

// ================================================================
//   OFFLINE QUEUE
// ================================================================
function getOfflineQueue() { try { return JSON.parse(localStorage.getItem('whatsapp_offline_queue') || '[]'); } catch(e){ return []; } }
function saveOfflineQueue(q) { localStorage.setItem('whatsapp_offline_queue', JSON.stringify(q)); }
function queueOfflineMessage(roomPath, payload) {
  const q = getOfflineQueue();
  q.push({ roomPath, payload });
  saveOfflineQueue(q);
}
function flushOfflineQueue() {
  const q = getOfflineQueue();
  if (q.length === 0) return;
  const remaining = [];
  q.forEach(item => {
    if (item.roomPath === currentRoomPath) db.ref(item.roomPath).push(item.payload);
    else remaining.push(item);
  });
  saveOfflineQueue(remaining);
}
function updateOfflineBanner() {
  document.getElementById('offlineBanner').style.display = navigator.onLine ? 'none' : 'block';
}
window.addEventListener('online', () => { updateOfflineBanner(); flushOfflineQueue(); });
window.addEventListener('offline', updateOfflineBanner);

// ================================================================
//   IMAGE COMPRESSION
// ================================================================
function compressImage(file, maxDim, quality, cb) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      cb(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ================================================================
//   EMOJI PICKER
// ================================================================
const EMOJI_LIST = ['😀','😂','😍','😘','😢','😡','👍','👎','🙏','🔥','🎉','❤️','💔','😴','🤔','😎','👏','🙌','💪','✅','⚠️','🎈','🌹','☕','🍕','⚽','🎵','📷','😊','😅','🥳','😭'];
function toggleEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  const show = picker.style.display !== 'grid';
  if (show) {
    picker.innerHTML = '';
    EMOJI_LIST.forEach(em => {
      const btn = document.createElement('button');
      btn.innerText = em;
      btn.onclick = () => insertEmoji(em);
      picker.appendChild(btn);
    });
    picker.style.display = 'grid';
    document.getElementById('mentionDropdown').style.display = 'none';
  } else picker.style.display = 'none';
}
function insertEmoji(em) {
  const input = document.getElementById('messageInput');
  input.value += em;
  input.focus();
}

// ================================================================
//   @MENTIONS
// ================================================================
function handleMessageInput() {
  notifyTyping();
  if (!isGroupChat() || !currentGroupMeta) { document.getElementById('mentionDropdown').style.display = 'none'; return; }
  const input = document.getElementById('messageInput');
  const val = input.value;
  const atIdx = val.lastIndexOf('@');
  if (atIdx === -1 || / /.test(val.slice(atIdx))) { document.getElementById('mentionDropdown').style.display = 'none'; return; }
  const query = val.slice(atIdx + 1).toLowerCase();
  const members = (currentGroupMeta.members || []).filter(m => m !== myUserId && m.toLowerCase().includes(query));
  const dropdown = document.getElementById('mentionDropdown');
  if (members.length === 0) { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = '';
  members.forEach(m => {
    const item = document.createElement('div');
    item.className = 'mention-item';
    item.innerText = '@' + m;
    item.onclick = () => {
      input.value = val.slice(0, atIdx) + '@' + m + ' ';
      dropdown.style.display = 'none';
      input.focus();
    };
    dropdown.appendChild(item);
  });
  dropdown.style.display = 'block';
  document.getElementById('emojiPicker').style.display = 'none';
}
function highlightMentions(text) {
  return text.replace(/@([A-Za-z0-9_]+)/g, '<span class="mention-tag">@$1</span>');
}

// ================================================================
//   LOCATION SHARING
// ================================================================
function sendLocation() {
  if (!targetUserId && !currentGroupId) { alert('⚠️ افتح محادثة أولاً.'); return; }
  if (!navigator.geolocation) { alert('⚠️ المتصفح لا يدعم مشاركة الموقع.'); return; }
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    const payload = { sender: myUserId, location: { lat: latitude, lng: longitude }, timestamp: Date.now() };
    if (!isGroupChat()) payload.read = false;
    if (navigator.onLine) chatRoomRef.push(payload); else queueOfflineMessage(currentRoomPath, payload);
    playSendSound();
  }, () => alert('❌ تعذر الوصول للموقع.'));
}

// ================================================================
//   GESTURES & ACTION SHEET
// ================================================================
function attachMessageGestures(wrap, msgKey, data, isSent) {
  let startX = 0, currentX = 0, swiping = false;
  let pressTimer = null;

  wrap.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX; swiping = true;
    pressTimer = setTimeout(() => { swiping = false; openActionSheet(msgKey, data, isSent); }, 500);
  }, { passive: true });
  wrap.addEventListener('touchmove', (e) => {
    if (!swiping) return;
    currentX = e.touches[0].clientX - startX;
    if (Math.abs(currentX) > 10) clearTimeout(pressTimer);
    const dx = Math.max(-60, Math.min(60, currentX));
    if ((isSent && dx < 0) || (!isSent && dx > 0)) {
      wrap.style.transform = `translateX(${dx}px)`;
    }
  }, { passive: true });
  wrap.addEventListener('touchend', () => {
    clearTimeout(pressTimer);
    const dx = currentX;
    wrap.style.transform = '';
    if (swiping && Math.abs(dx) > 45) {
      setReply(msgKey, data.sender, data.text || (data.image ? '📷 صورة' : (data.audio ? '🎤 رسالة صوتية' : (data.location ? '📍 موقع' : ''))));
    }
    currentX = 0;
  });
  wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); openActionSheet(msgKey, data, isSent); });
}

function openActionSheet(msgKey, data, isSent) {
  const sheet = document.getElementById('actionSheetContent');
  sheet.innerHTML = '';

  const reactRow = document.createElement('div');
  reactRow.className = 'sheet-emojis';
  ['❤️', '😂', '😮', '👍', '🙏'].forEach(em => {
    const b = document.createElement('button');
    b.innerText = em;
    b.onclick = () => {
      const path = isGroupChat() ? ('groups_reactions/' + currentGroupId + '/' + msgKey) : ('private_chats_reactions/' + getRoomId(myUserId, targetUserId) + '/' + msgKey);
      db.ref(path).child(myUserId).set(em);
      closeActionSheet();
    };
    reactRow.appendChild(b);
  });
  sheet.appendChild(reactRow);

  const pinItem = document.createElement('div');
  pinItem.className = 'sheet-item';
  pinItem.innerHTML = '📌 تثبيت الرسالة';
  pinItem.onclick = () => { pinMessage(msgKey, data); closeActionSheet(); };
  sheet.appendChild(pinItem);

  const replyItem = document.createElement('div');
  replyItem.className = 'sheet-item';
  replyItem.innerHTML = '↩️ رد';
  replyItem.onclick = () => { setReply(msgKey, data.sender, data.text || (data.image ? '📷 صورة' : (data.audio ? '🎤 رسالة صوتية' : ''))); closeActionSheet(); };
  sheet.appendChild(replyItem);

  const fwdItem = document.createElement('div');
  fwdItem.className = 'sheet-item';
  fwdItem.innerHTML = '↪️ إعادة توجيه';
  fwdItem.onclick = () => { closeActionSheet(); openForwardModal(data); };
  sheet.appendChild(fwdItem);

  if (isSent && data.text && !data.image && !data.audio) {
    const editItem = document.createElement('div');
    editItem.className = 'sheet-item';
    editItem.innerHTML = '✏️ تعديل';
    editItem.onclick = () => { closeActionSheet(); editMessage(msgKey, data.text); };
    sheet.appendChild(editItem);
  }

  const delItem = document.createElement('div');
  delItem.className = 'sheet-item danger';
  delItem.innerHTML = '🗑 حذف';
  delItem.onclick = () => { deleteMessage(msgKey, isSent); closeActionSheet(); };
  sheet.appendChild(delItem);

  document.getElementById('actionSheetOverlay').style.display = 'flex';
}
function closeActionSheet() { document.getElementById('actionSheetOverlay').style.display = 'none'; }

// ================================================================
//   PULL TO REFRESH
// ================================================================
(function setupPullToRefresh() {
  const scroll = document.getElementById('chatsScroll');
  const spinner = document.getElementById('pullRefreshSpinner');
  let startY = 0, pulling = false;
  scroll.addEventListener('touchstart', (e) => {
    if (scroll.scrollTop === 0) { startY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });
  scroll.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 60) spinner.classList.add('active');
  }, { passive: true });
  scroll.addEventListener('touchend', () => {
    if (pulling && spinner.classList.contains('active')) {
      renderChatsList();
      setTimeout(() => spinner.classList.remove('active'), 500);
    }
    pulling = false;
  });
})();

function requestNotifyPermission() {
  if (!("Notification" in window)) { alert("⚠️ المتصفح لا يدعم الإشعارات."); return; }
  Notification.requestPermission().then(p => {
    alert(p === "granted" ? "✅ تم تفعيل الإشعارات." : "⚠️ لم يتم منح إذن الإشعارات.");
  });
}
function notifyNewMessage(fromId, text) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible" && (targetUserId || currentGroupId)) return;
  try { new Notification("💬 " + fromId, { body: text || "رسالة جديدة" }); } catch (e) {}
}

function getContacts() { try { return JSON.parse(localStorage.getItem('whatsapp_private_contacts') || '{}'); } catch(e){ return {}; } }
function saveContacts(c) { localStorage.setItem('whatsapp_private_contacts', JSON.stringify(c)); }
function upsertContact(id, lastText, ts) {
  const contacts = getContacts();
  contacts[id] = { id, lastText: lastText !== undefined ? lastText : (contacts[id]?.lastText || ''), ts: ts || Date.now(), type: 'dm' };
  saveContacts(contacts);
  renderChatsList();
}

function getMyGroups() { try { return JSON.parse(localStorage.getItem('whatsapp_private_groups') || '{}'); } catch(e){ return {}; } }
function saveMyGroups(g) { localStorage.setItem('whatsapp_private_groups', JSON.stringify(g)); }
function upsertGroupLocal(id, name, lastText, ts) {
  const groups = getMyGroups();
  groups[id] = { id, name: name || groups[id]?.name || id, lastText: lastText !== undefined ? lastText : (groups[id]?.lastText || ''), ts: ts || Date.now(), type: 'group' };
  saveMyGroups(groups);
  renderChatsList();
}

function getHiddenSet(roomId) {
  try { return new Set(JSON.parse(localStorage.getItem('whatsapp_hidden_' + roomId) || '[]')); } catch(e){ return new Set(); }
}
function addHidden(roomId, key) {
  const s = getHiddenSet(roomId);
  s.add(key);
  localStorage.setItem('whatsapp_hidden_' + roomId, JSON.stringify([...s]));
}

const presenceWatchers = {};

function renderChatsList() {
  const contacts = getContacts();
  const groups = getMyGroups();
  const scroll = document.getElementById('chatsScroll');
  const folders = getChatFolders();
  let items = [...Object.values(contacts), ...Object.values(groups)];
  
  items = items.filter(it => !!it.archived === showingArchive);
  if (currentFolderTab !== 'all') {
    items = items.filter(it => folders[it.id] === currentFolderTab);
  }
  items.sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0) || (b.ts||0) - (a.ts||0));

  if (typeof renderStatusStrip === 'function' && !showingArchive) renderStatusStrip();
  document.querySelector('.status-strip').style.display = showingArchive ? 'none' : 'flex';

  const unreadMap = getUnreadMap();

  if (items.length === 0) {
    scroll.innerHTML = `<div class="empty-chats">${showingArchive ? 'لا توجد محادثات مؤرشفة.' : 'لا توجد محادثات في هذا المجلد.<br>أدخل ID أي شخص أعلاه لبدء محادثة 👆'}</div>`;
    return;
  }

  scroll.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'chat-row';
    const isGroup = item.type === 'group';
    row.onclick = () => isGroup ? openGroup(item.id) : openChat(item.id);
    let pressTimer;
    row.addEventListener('touchstart', () => { pressTimer = setTimeout(() => openChatRowSheet(item.id, isGroup), 500); }, { passive: true });
    row.addEventListener('touchend', () => clearTimeout(pressTimer));
    row.addEventListener('touchmove', () => clearTimeout(pressTimer));
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); openChatRowSheet(item.id, isGroup); });

    const label = isGroup ? item.name : item.id;
    const initials = (label || '').replace(/[^A-Za-z0-9\u0600-\u06FF]/g, '').slice(-2).toUpperCase() || (isGroup ? 'GR' : 'ID');
    const unreadCount = unreadMap[item.id] || 0;
    const folderTag = folders[item.id] ? `<span style="font-size:10px; opacity:0.7; margin-right:4px;">[${folders[item.id] === 'fav' ? '⭐' : folders[item.id] === 'work' ? '💼' : '🏠'}]</span>` : '';

    row.innerHTML = `
      <div class="chat-avatar ${isGroup ? 'group-avatar' : ''}">${isGroup ? '<i class="fa-solid fa-users"></i>' : initials}${!isGroup ? `<span class="online-badge" id="badge_${item.id}"></span>` : ''}</div>
      <div class="chat-info">
        <div class="row1">
          <span class="name">${item.pinned ? '<span class="pin-icon">📌</span>' : ''}${folderTag}${isGroup ? '👥 ' : ''}<span class="name-text">${label}</span></span>
          <span class="time">${item.ts ? new Date(item.ts).toLocaleTimeString('ar', {hour:'2-digit', minute:'2-digit'}) : ''}</span>
        </div>
        <div class="row1">
          <div class="preview">${item.lastText || 'لا توجد رسائل بعد'}</div>
          ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
        </div>
      </div>
    `;
    scroll.appendChild(row);

    if (!isGroup) {
      fetchAvatar(item.id, (av) => {
        if (av) {
          const avatarDiv = row.querySelector('.chat-avatar');
          const badge = avatarDiv.querySelector('.online-badge');
          avatarDiv.innerHTML = `<img class="avatar-img" src="${av}">`;
          if (badge) avatarDiv.appendChild(badge);
        }
      });
      fetchDisplayName(item.id, (dn) => {
        if (dn) row.querySelector('.name-text').innerText = dn;
      });
    }

    if (!isGroup && !presenceWatchers[item.id]) {
      presenceWatchers[item.id] = db.ref('presence/' + item.id);
      presenceWatchers[item.id].on('value', (snap) => {
        const val = snap.val();
        const online = !!(val && val.online);
        const badge = document.getElementById('badge_' + item.id);
        if (badge) badge.classList.toggle('online', online);
      });
    }
  });

  attachUnreadWatchers();
}

// ================================================================
//   GLOBAL UNREAD WATCHERS
// ================================================================
const unreadWatchers = {};
function attachUnreadWatchers() {
  const contacts = getContacts();
  const groups = getMyGroups();
  Object.keys(contacts).forEach(id => {
    const roomPath = 'private_chats/' + getRoomId(myUserId, id);
    attachSingleUnreadWatcher(roomPath, id);
  });
  Object.keys(groups).forEach(id => {
    const roomPath = 'groups/' + id + '/messages';
    attachSingleUnreadWatcher(roomPath, id);
  });
}
function attachSingleUnreadWatcher(roomPath, chatId) {
  if (unreadWatchers[roomPath]) return;
  unreadWatchers[roomPath] = true;
  let firstFire = true;
  db.ref(roomPath).limitToLast(1).on('value', (snap) => {
    if (firstFire) { firstFire = false; return; }
    const vals = snap.val();
    if (!vals) return;
    const [key, data] = Object.entries(vals)[0];
    if (data.sender === myUserId) return;
    const isCurrentlyOpen = (currentRoomPath === roomPath);
    if (!isCurrentlyOpen) {
      incrementUnread(chatId);
      renderChatsList();
    }
  });
}

function startChatFromList() {
  const input = document.getElementById('newChatIdInput');
  const id = input.value.trim();
  if (!id) { alert('⚠️ الرجاء إدخال ID.'); return; }
  if (id === myUserId) { alert('⛔ لا يمكنك التواصل مع نفسك!'); return; }
  input.value = '';
  upsertContact(id, '', Date.now());
  openChat(id);
}

function goBackToList() {
  if (chatRoomRef) chatRoomRef.off();
  if (presenceRef) presenceRef.off();
  if (typingRef) typingRef.off();
  targetUserId = null;
  currentGroupId = null;
  currentRoomPath = null;
  clearReply();
  document.getElementById('searchBar').style.display = 'none';
  document.getElementById('membersToggleBtn').style.display = 'none';
  document.getElementById('chatRoomScreen').style.display = 'none';
  const listScreen = document.getElementById('chatsListScreen');
  listScreen.style.display = 'flex';
  listScreen.classList.remove('slide-in'); void listScreen.offsetWidth; listScreen.classList.add('slide-in');
  renderChatsList();
}

let pendingGroupAvatar = null;
function handleGroupAvatarSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  compressImage(file, 200, 0.7, (dataUrl) => {
    pendingGroupAvatar = dataUrl;
    document.getElementById('groupAvatarPreview').innerHTML = `<img src="${dataUrl}">`;
  });
}
function openGroupModal() { document.getElementById('groupModal').style.display = 'flex'; }
function closeGroupModal() {
  document.getElementById('groupModal').style.display = 'none';
  document.getElementById('groupNameInput').value = '';
  document.getElementById('groupMembersInput').value = '';
  document.getElementById('groupAvatarPreview').innerHTML = '<i class="fa-solid fa-camera"></i>';
  pendingGroupAvatar = null;
}
function createGroup() {
  const name = document.getElementById('groupNameInput').value.trim();
  const membersRaw = document.getElementById('groupMembersInput').value.trim();
  if (!name) { alert('⚠️ أدخل اسم المجموعة.'); return; }
  const members = membersRaw.split(',').map(s => s.trim()).filter(Boolean);
  members.push(myUserId);
  const uniqueMembers = [...new Set(members)];
  if (uniqueMembers.length < 2) { alert('⚠️ أضف عضو واحد على الأقل غيرك.'); return; }

  const groupId = 'GRP_' + Math.random().toString(36).slice(2, 9).toUpperCase();
  db.ref('groups/' + groupId + '/meta').set({ name, avatar: pendingGroupAvatar || null, members: uniqueMembers, admin: myUserId, createdBy: myUserId, createdAt: Date.now() });
  uniqueMembers.forEach(m => db.ref('user_groups/' + m + '/' + groupId).set(true));

  upsertGroupLocal(groupId, name, '', Date.now());
  closeGroupModal();
  openGroup(groupId);
}

db.ref('user_groups/' + myUserId).on('child_added', (snap) => {
  const groupId = snap.key;
  if (getMyGroups()[groupId]) return;
  db.ref('groups/' + groupId + '/meta').once('value', (metaSnap) => {
    const meta = metaSnap.val();
    if (meta) upsertGroupLocal(groupId, meta.name, '', Date.now());
  });
});

let currentGroupMeta = null;
let oldestLoadedTs = null;
let currentRoomPath = null;

function openGroup(groupId) {
  currentGroupId = groupId;
  targetUserId = null;
  clearUnread(groupId);

  db.ref('groups/' + groupId + '/meta').once('value', (snap) => {
    const meta = snap.val() || {};
    currentGroupMeta = meta;
    document.getElementById('chatRoomTitle').innerHTML = (meta.avatar ? `<img class="peer-avatar-small" src="${meta.avatar}" style="vertical-align:middle;margin-left:6px;">` : '<i class="fa-solid fa-users"></i> ') + (meta.name || groupId);
  });

  document.getElementById('chatsListScreen').style.display = 'none';
  const roomScreenG = document.getElementById('chatRoomScreen');
  roomScreenG.style.display = 'flex';
  roomScreenG.classList.remove('slide-in'); void roomScreenG.offsetWidth; roomScreenG.classList.add('slide-in');
  document.getElementById('callButtonsGroup').style.display = 'none';
  document.getElementById('groupCallButtonsGroup').style.display = 'flex';
  document.getElementById('blockToggleBtn').style.display = 'none';
  document.getElementById('membersToggleBtn').style.display = 'flex';
  document.getElementById('peerStatusText').innerText = '👥 محادثة جماعية';
  document.getElementById('peerStatusDot').classList.remove('online');

  resetMessagesBox();
  clearReply();

  if (chatRoomRef) chatRoomRef.off();
  if (presenceRef) presenceRef.off();
  if (typingRef) typingRef.off();

  currentRoomPath = 'groups/' + groupId + '/messages';
  chatRoomRef = db.ref(currentRoomPath);
  renderPinnedMsgBar();
  const hidden = getHiddenSet('group_' + groupId);
  oldestLoadedTs = null;
  chatRoomRef.limitToLast(50).on('child_added', (snapshot) => {
    const data = snapshot.val();
    if (hidden.has(snapshot.key)) return;
    if (sweepExpiredOnDisplay(data, snapshot.key)) return;
    if (oldestLoadedTs === null || (data.timestamp || 0) < oldestLoadedTs) oldestLoadedTs = data.timestamp || Date.now();
    displayMessage(data, snapshot.key, true);
    if (data.sender !== myUserId) {
      playReceiveSound();
      notifyNewMessage(data.sender, data.text || (data.image ? '📷 صورة' : (data.audio ? '🎤 رسالة صوتية' : '')));
    }
    const preview = (data.sender === myUserId ? 'أنت: ' : data.sender + ': ') + (data.image ? '📷 صورة' : (data.audio ? '🎤 رسالة صوتية' : data.text));
    upsertGroupLocal(groupId, undefined, preview, data.timestamp || Date.now());
  });
  chatRoomRef.on('child_removed', (snapshot) => { removeMessageFromDom(snapshot.key); });
  attachGroupCallListener(groupId);
  document.getElementById('loadOlderBtn').style.display = 'block';
  flushOfflineQueue();
}

function openMembersModal() {
  if (!currentGroupId) return;
  db.ref('groups/' + currentGroupId + '/meta').once('value', (snap) => {
    currentGroupMeta = snap.val() || {};
    renderMembersList();
    document.getElementById('membersModal').style.display = 'flex';
  });
}
function closeMembersModal() { document.getElementById('membersModal').style.display = 'none'; }
function renderMembersList() {
  const list = document.getElementById('membersList');
  const members = (currentGroupMeta && currentGroupMeta.members) || [];
  const admin = currentGroupMeta && currentGroupMeta.admin;
  list.innerHTML = '';
  members.forEach(m => {
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `<span class="member-name">${m === myUserId ? 'أنت' : m} ${m === admin ? '<span class="admin-tag">أدمن</span>' : ''}</span>`;
    if (myUserId === admin && m !== admin) {
      const btn = document.createElement('button');
      btn.innerText = 'إزالة';
      btn.onclick = () => removeGroupMember(m);
      row.appendChild(btn);
    }
    list.appendChild(row);
  });
}
function addGroupMember() {
  const input = document.getElementById('addMemberInput');
  const id = input.value.trim();
  if (!id) return;
  const members = [...new Set([...(currentGroupMeta.members || []), id])];
  db.ref('groups/' + currentGroupId + '/meta/members').set(members).then(() => {
    db.ref('user_groups/' + id + '/' + currentGroupId).set(true);
    currentGroupMeta.members = members;
    renderMembersList();
    input.value = '';
  });
}
function removeGroupMember(id) {
  if (!confirm(`إزالة ${id} من المجموعة؟`)) return;
  const members = (currentGroupMeta.members || []).filter(m => m !== id);
  db.ref('groups/' + currentGroupId + '/meta/members').set(members).then(() => {
    db.ref('user_groups/' + id + '/' + currentGroupId).remove();
    currentGroupMeta.members = members;
    renderMembersList();
  });
}

function isGroupChat() { return !!currentGroupId; }
function getRoomId(userA, userB) { return [userA, userB].sort().join("_"); }

function openChat(peerId) {
  if (!peerId) return;
  if (peerId === myUserId) { alert("⛔ لا يمكنك التواصل مع نفسك!"); return; }
  if (isUserBlocked(peerId) && !confirm(`⚠️ ${peerId} محظور. فتح المحادثة على أي حال؟`)) return;

  targetUserId = peerId;
  currentGroupId = null;
  upsertContact(peerId, undefined, Date.now());
  clearUnread(peerId);

  document.getElementById('chatsListScreen').style.display = 'none';
  const roomScreen = document.getElementById('chatRoomScreen');
  roomScreen.style.display = 'flex';
  roomScreen.classList.remove('slide-in'); void roomScreen.offsetWidth; roomScreen.classList.add('slide-in');
  document.getElementById('callButtonsGroup').style.display = 'flex';
  document.getElementById('groupCallButtonsGroup').style.display = 'none';
  document.getElementById('membersToggleBtn').style.display = 'none';
  document.getElementById('chatRoomTitle').innerText = peerId;
  updateBlockBtnState();
  fetchAvatar(peerId, (av) => {
    if (av) document.getElementById('chatRoomTitle').innerHTML = `<img class="peer-avatar-small" src="${av}" style="vertical-align:middle;margin-left:6px;">${peerId}`;
  });
  fetchDisplayName(peerId, (dn) => {
    if (dn) {
      const av = avatarCache[peerId];
      document.getElementById('chatRoomTitle').innerHTML = (av ? `<img class="peer-avatar-small" src="${av}" style="vertical-align:middle;margin-left:6px;">` : '') + dn;
    }
  });

  const roomId = getRoomId(myUserId, targetUserId);

  resetMessagesBox();
  clearReply();

  if (chatRoomRef) chatRoomRef.off();
  if (presenceRef) presenceRef.off();
  if (typingRef) typingRef.off();

  currentRoomPath = "private_chats/" + roomId;
  chatRoomRef = db.ref(currentRoomPath);
  renderPinnedMsgBar();
  const hidden = getHiddenSet(roomId);
  oldestLoadedTs = null;
  chatRoomRef.limitToLast(50).on("child_added", (snapshot) => {
    const data = snapshot.val();
    if (hidden.has(snapshot.key)) return;
    if (isUserBlocked(data.sender)) return;
    if (sweepExpiredOnDisplay(data, snapshot.key)) return;
    if (oldestLoadedTs === null || (data.timestamp || 0) < oldestLoadedTs) oldestLoadedTs = data.timestamp || Date.now();
    displayMessage(data, snapshot.key, false);
    if (data.sender !== myUserId) {
      playReceiveSound();
      notifyNewMessage(data.sender, data.text || (data.image ? '📷 صورة' : (data.audio ? '🎤 رسالة صوتية' : '')));
      chatRoomRef.child(snapshot.key).child('read').set(true);
    }
    const preview = data.image ? '📷 صورة' : (data.audio ? '🎤 رسالة صوتية' : data.text);
    upsertContact(targetUserId, preview, data.timestamp || Date.now());
  });
  chatRoomRef.on("child_changed", (snapshot) => {
    const data = snapshot.val();
    updateTickForMessage(snapshot.key, data.read);
  });
  chatRoomRef.on("child_removed", (snapshot) => { removeMessageFromDom(snapshot.key); });
  document.getElementById('loadOlderBtn').style.display = 'block';
  flushOfflineQueue();

  presenceRef = db.ref("presence/" + targetUserId);
  presenceRef.on("value", (snap) => {
    const val = snap.val();
    const online = !!(val && val.online);
    document.getElementById("peerStatusDot").classList.toggle("online", online);
    document.getElementById("peerStatusText").innerHTML = online
      ? `🟢 ${targetUserId} متصل الآن`
      : `⚪ ${targetUserId} غير متصل • آخر ظهور: ${val?.lastSeen ? new Date(val.lastSeen).toLocaleString('ar') : 'غير معروف'}`;
  });

  typingRef = db.ref("typing/" + roomId + "/" + targetUserId);
  typingRef.on("value", (snap) => {
    const isTyping = !!snap.val();
    document.getElementById("typingName").innerText = targetUserId;
    document.getElementById("typingIndicator").style.display = isTyping ? "flex" : "none";
  });
}

function toggleTheme() {
  darkMode = !darkMode;
  if (darkMode) {
    document.body.style.background = '#e5ddd5';
    document.querySelector('.chat-container').style.background = '#ffffff';
    document.querySelector('.header').style.background = '#075e54';
    document.querySelector('.header').style.borderBottom = '1px solid #128c7e';
    document.querySelector('.header-title h2').style.color = '#ffffff';
    document.querySelector('.messages-box').style.background = '#e5ddd5';
    document.querySelectorAll('.message.sent').forEach(el => { el.style.background = '#dcf8c6'; el.style.color = '#111b21'; });
    document.querySelectorAll('.message.received').forEach(el => { el.style.background = '#ffffff'; el.style.color = '#111b21'; });
    document.querySelector('.input-area').style.background = '#ffffff';
    document.querySelector('.input-box input[type=text]').style.background = '#f0f2f5';
    document.querySelector('.input-box input[type=text]').style.color = '#111b21';
    document.getElementById('themeToggleBtn').innerHTML = '<i class="fa-solid fa-sun"></i>';
  } else {
    document.body.style.background = '#0b1419';
    document.querySelector('.chat-container').style.background = '#111b21';
    document.querySelector('.header').style.background = '#1f2c33';
    document.querySelector('.header').style.borderBottom = '1px solid #2a3b44';
    document.querySelector('.header-title h2').style.color = '#e9edef';
    document.querySelector('.messages-box').style.background = '#0b1419';
    document.querySelectorAll('.message.sent').forEach(el => { el.style.background = '#005c4b'; el.style.color = '#e9edef'; });
    document.querySelectorAll('.message.received').forEach(el => { el.style.background = '#1f2c33'; el.style.color = '#e9edef'; });
    document.querySelector('.input-area').style.background = '#1f2c33';
    document.querySelector('.input-box input[type=text]').style.background = '#2a3b44';
    document.querySelector('.input-box input[type=text]').style.color = '#e9edef';
    document.getElementById('themeToggleBtn').innerHTML = '<i class="fa-solid fa-moon"></i>';
  }
}

function toggleMute() {
  isMuted = !isMuted;
  document.getElementById('muteBtn').innerHTML = isMuted ? '<i class="fa-solid fa-bell-slash"></i> مكتوم' : '<i class="fa-solid fa-microphone-slash"></i> كتم';
  document.getElementById('muteBtn').style.background = isMuted ? '#e53935' : '#546e7a';
}
let audioCtx = null;
function beep(freq, duration) {
  if (isMuted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain); gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}
const playReceiveSound = () => beep(800, 0.12);
const playSendSound = () => beep(550, 0.08);

const myPresenceRef = db.ref("presence/" + myUserId);
myPresenceRef.set({ online: true, lastSeen: Date.now() });
myPresenceRef.onDisconnect().set({ online: false, lastSeen: Date.now() });
window.addEventListener("beforeunload", () => { myPresenceRef.set({ online: false, lastSeen: Date.now() }); });

function notifyTyping() {
  if (!targetUserId) return;
  const roomId = getRoomId(myUserId, targetUserId);
  const myTypingRef = db.ref("typing/" + roomId + "/" + myUserId);
  myTypingRef.set(true);
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => myTypingRef.set(false), 2000);
}

function setReply(key, sender, text) {
  replyingTo = { key, sender, text: text || '' };
  document.getElementById('rpSenderLabel').innerText = sender === myUserId ? 'أنت' : sender;
  document.getElementById('rpTextLabel').innerText = text ? (text.length > 60 ? text.slice(0,60) + '…' : text) : '📎 مرفق';
  document.getElementById('replyPreviewBar').style.display = 'flex';
  document.getElementById('messageInput').focus();
}
function clearReply() {
  replyingTo = null;
  document.getElementById('replyPreviewBar').style.display = 'none';
}

async function sendMessage() {
  if (!targetUserId && !currentGroupId) { alert("⚠️ افتح محادثة أولاً."); return; }
  if (targetUserId && isUserBlocked(targetUserId)) { alert('🚫 هذا المستخدم محظور. قم بإلغاء الحظر أولاً.'); return; }
  const input = document.getElementById("messageInput");
  let text = input.value.trim();
  if (text === "" && !pendingImageData && !pendingDocData) return;

  let encryptedPayloadData = null;
  if (e2eeEnabled && text !== "") {
    const secret = isGroupChat() ? currentGroupId : getRoomId(myUserId, targetUserId);
    encryptedPayloadData = await encryptText(text, secret);
  }

  const payload = { sender: myUserId, timestamp: Date.now() };
  if (encryptedPayloadData) {
    payload.encryptedData = encryptedPayloadData;
    payload.text = "🔒 [رسالة مشفرة بـ E2EE]";
  } else {
    payload.text = text;
  }

  if (pendingImageData) payload.image = pendingImageData;
  if (pendingDocData) payload.doc = pendingDocData;
  if (!isGroupChat()) payload.read = false;
  if (replyingTo) payload.replyTo = { sender: replyingTo.sender, text: replyingTo.text };
  const disapMs = getDisappearSetting(currentRoomPath);
  if (disapMs > 0) payload.expiresAt = Date.now() + disapMs;

  if (navigator.onLine) chatRoomRef.push(payload);
  else { queueOfflineMessage(currentRoomPath, payload); updateOfflineBanner(); }
  playSendSound();
  input.value = "";
  cancelImage();
  clearReply();
  document.getElementById('mentionDropdown').style.display = 'none';
  document.getElementById('emojiPicker').style.display = 'none';

  if (!isGroupChat()) {
    const roomId = getRoomId(myUserId, targetUserId);
    db.ref("typing/" + roomId + "/" + myUserId).set(false);
  }
}
function handleKeyPress(e) { if (e.key === "Enter") sendMessage(); }

let pendingDocData = null;
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.type.startsWith('image/')) {
    pendingDocData = null;
    compressImage(file, 900, 0.75, (dataUrl) => {
      pendingImageData = dataUrl;
      document.getElementById("imgPreviewThumb").src = pendingImageData;
      document.getElementById("imgPreviewBar").style.display = "flex";
    });
  } else {
    if (file.size > 700 * 1024) { alert('⚠️ الملف كبير جداً (الحد 700KB).'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      pendingDocData = { name: file.name, size: file.size, data: e.target.result };
      pendingImageData = null;
      document.getElementById("imgPreviewThumb").src = '';
      document.getElementById("imgPreviewBar").querySelector('span').innerText = '📄 ' + file.name;
      document.getElementById("imgPreviewBar").style.display = "flex";
    };
    reader.readAsDataURL(file);
  }
}
function cancelImage() {
  pendingImageData = null;
  pendingDocData = null;
  document.getElementById("fileInput").value = "";
  document.getElementById("imgPreviewBar").querySelector('span').innerText = '🖼️ صورة جاهزة للإرسال';
  document.getElementById("imgPreviewBar").style.display = "none";
}

let mediaRecorder = null, recordedChunks = [], recordingStream = null, recTimerInterval = null, recSeconds = 0;

async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') { stopAndSendRecording(); return; }
  if (!targetUserId && !currentGroupId) { alert("⚠️ افتح محادثة أولاً."); return; }
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    
    const options = { audioBitsPerSecond: 24000 };
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options.mimeType = 'audio/webm;codecs=opus';
    
    mediaRecorder = new MediaRecorder(recordingStream, options);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.start(500);
    document.getElementById('micBtn').classList.add('recording');
    document.getElementById('recordingBar').style.display = 'flex';
    recSeconds = 0; updateRecTimer();
    recTimerInterval = setInterval(() => { recSeconds++; updateRecTimer(); }, 1000);
  } catch (err) { alert("❌ تعذر الوصول للميكروفون: " + err.message); }
}
function updateRecTimer() {
  const m = Math.floor(recSeconds / 60);
  const s = (recSeconds % 60).toString().padStart(2, '0');
  const approxKb = Math.round(recSeconds * 3);
  document.getElementById('recTimer').innerText = `🎙️ جارٍ التسجيل... ${m}:${s} (~${approxKb} KB)`;
}
function stopRecordingInternal(onStopped) {
  if (!mediaRecorder) return;
  mediaRecorder.onstop = () => {
    if (recordingStream) recordingStream.getTracks().forEach(t => t.stop());
    clearInterval(recTimerInterval);
    document.getElementById('micBtn').classList.remove('recording');
    document.getElementById('recordingBar').style.display = 'none';
    onStopped();
  };
  mediaRecorder.stop();
}
function cancelRecording() { stopRecordingInternal(() => { recordedChunks = []; mediaRecorder = null; }); }
function stopAndSendRecording() {
  stopRecordingInternal(() => {
    if (recordedChunks.length === 0) { mediaRecorder = null; return; }
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
    if (blob.size > 700 * 1024) { alert("⚠️ الرسالة الصوتية طويلة جداً (الحد 700KB)."); mediaRecorder = null; return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const payload = { sender: myUserId, audio: e.target.result, timestamp: Date.now() };
      if (!isGroupChat()) payload.read = false;
      if (replyingTo) payload.replyTo = { sender: replyingTo.sender, text: replyingTo.text };
      chatRoomRef.push(payload);
      playSendSound();
      clearReply();
    };
    reader.readAsDataURL(blob);
    mediaRecorder = null;
  });
}

function deleteMessage(key, isMine) {
  const roomKey = isGroupChat() ? ('group_' + currentGroupId) : getRoomId(myUserId, targetUserId);
  if (isMine) {
    if (confirm("🗑️ حذف هذه الرسالة عند الجميع؟")) chatRoomRef.child(key).remove();
  } else {
    if (confirm("🗑️ حذف هذه الرسالة عندك فقط؟")) { addHidden(roomKey, key); removeMessageFromDom(key); }
  }
}
function removeMessageFromDom(key) {
  const el = msgElements[key];
  if (el) { el.remove(); delete msgElements[key]; }
}
function updateTickForMessage(key, read) {
  const el = msgElements[key];
  if (!el) return;
  const tick = el.querySelector('.tick');
  if (tick) { tick.innerText = read ? '✓✓' : '✓'; tick.classList.toggle('read', !!read); }
}

function toggleSearchBar() {
  const bar = document.getElementById('searchBar');
  const btn = document.getElementById('searchToggleBtn');
  const show = bar.style.display !== 'flex';
  bar.style.display = show ? 'flex' : 'none';
  btn.classList.toggle('active-search', show);
  if (show) { document.getElementById('searchInput').focus(); } else { document.getElementById('searchInput').value=''; performSearch(); }
}
function performSearch() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  let count = 0;
  Object.entries(msgElements).forEach(([key, el]) => {
    const text = (el.dataset.text || '').toLowerCase();
    const match = !q || text.includes(q);
    el.classList.toggle('dimmed', !!q && !match);
    if (q && match) count++;
  });
  document.getElementById('searchCount').innerText = q ? `${count} نتيجة` : '';
}

function formatTime(ts) { return new Date(ts).toLocaleTimeString('ar', { hour:'2-digit', minute:'2-digit' }); }
function formatDateLabel(ts) {
  const d = new Date(ts); const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
  const sameDay = (a,b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "اليوم";
  if (sameDay(d, yesterday)) return "أمس";
  return d.toLocaleDateString('ar', { year:'numeric', month:'long', day:'numeric' });
}
const urlRegex = /(https?:\/\/[^\s]+)/g;
function linkifyText(text) { return text.replace(urlRegex, url => `<a class="chat-link" href="${url}" target="_blank" rel="noopener">${url}</a>`); }
function extractFirstUrl(text) { const match = text.match(urlRegex); return match ? match[0] : null; }

async function displayMessage(data, msgKey, inGroup, prepend) {
  const messagesBox = document.getElementById("messagesBox");
  const dayLabel = formatDateLabel(data.timestamp || Date.now());
  if (!prepend && !shownDateSeps.has(dayLabel)) {
    shownDateSeps.add(dayLabel);
    const sep = document.createElement("div");
    sep.className = "date-sep";
    sep.innerText = dayLabel;
    messagesBox.appendChild(sep);
  }

  const isSent = data.sender === myUserId;
  const wrap = document.createElement("div");
  wrap.className = "msg-wrap " + (isSent ? "sent-wrap" : "received-wrap");
  
  let textToDisplay = data.text || '';

  if (data.encryptedData) {
    const secret = isGroupChat() ? currentGroupId : getRoomId(myUserId, targetUserId);
    textToDisplay = await decryptText(data.encryptedData, secret);
  }
  wrap.dataset.text = textToDisplay;

  if (inGroup && !isSent) {
    const lbl = document.createElement('div');
    lbl.className = 'msg-sender-label';
    lbl.innerText = data.sender;
    wrap.appendChild(lbl);
  }

  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", isSent ? "sent" : "received");

  if (data.replyTo) {
    const rq = document.createElement('div');
    rq.className = 'reply-quote';
    rq.innerHTML = `<span class="rq-sender">${data.replyTo.sender === myUserId ? 'أنت' : data.replyTo.sender}</span>${(data.replyTo.text || '📎 مرفق').slice(0,80)}`;
    msgDiv.appendChild(rq);
  }

  if (textToDisplay) {
    const textSpan = document.createElement('span');
    textSpan.innerHTML = (data.encryptedData ? '🔒 ' : '') + (inGroup ? highlightMentions(linkifyText(textToDisplay)) : linkifyText(textToDisplay));
    msgDiv.appendChild(textSpan);
    if (data.edited) {
      const ed = document.createElement('span');
      ed.className = 'edited-label';
      ed.innerText = '(معدّل)';
      msgDiv.appendChild(ed);
    }
    const url = extractFirstUrl(textToDisplay);
    if (url) {
      const preview = document.createElement("div");
      preview.className = "link-preview";
      preview.innerText = "🔗 " + url;
      msgDiv.appendChild(preview);
    }
  }
  if (data.image) {
    const img = document.createElement("img");
    img.src = data.image; img.className = "chat-img";
    img.onclick = () => window.open(data.image, "_blank");
    msgDiv.appendChild(img);
  }
  if (data.doc) {
    const a = document.createElement('a');
    a.className = 'doc-card';
    a.href = data.doc.data; a.download = data.doc.name;
    a.innerHTML = `<span class="doc-icon">📄</span><div class="doc-info"><span class="doc-name">${data.doc.name}</span><span class="doc-size">${Math.round(data.doc.size/1024)} KB</span></div>`;
    msgDiv.appendChild(a);
  }
  if (data.audio) {
    const audioContainer = document.createElement("div");
    const audio = document.createElement("audio");
    audio.src = data.audio; audio.controls = true; audio.className = "chat-audio";
    audioContainer.appendChild(audio);

    const sttBtn = document.createElement("button");
    sttBtn.className = "stt-btn";
    sttBtn.innerHTML = "📝 تحويل لنص";
    sttBtn.onclick = () => transcribeAudioMsg(msgKey, data.audio, audioContainer);
    audioContainer.appendChild(sttBtn);

    msgDiv.appendChild(audioContainer);
  }
  if (data.location) {
    const loc = document.createElement('div');
    loc.className = 'location-msg';
    const mapUrl = `https://www.google.com/maps?q=${data.location.lat},${data.location.lng}`;
    loc.innerHTML = `📍 <a href="${mapUrl}" target="_blank" rel="noopener">مشاركة موقع - افتح الخريطة</a>`;
    msgDiv.appendChild(loc);
  }
  if (data.contactShare) {
    const cs = document.createElement('div');
    cs.className = 'doc-card';
    cs.style.cursor = 'pointer';
    cs.innerHTML = `<span class="doc-icon"><i class="fa-solid fa-address-card"></i></span><div class="doc-info"><span class="doc-name">${data.contactShare}</span><span class="doc-size">جهة اتصال - اضغط لبدء محادثة</span></div>`;
    cs.onclick = () => { goBackToList(); setTimeout(() => openChat(data.contactShare), 200); };
    msgDiv.appendChild(cs);
  }

  wrap.appendChild(msgDiv);

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.innerHTML = `<span>${formatTime(data.timestamp || Date.now())}</span>`;
  if (isSent && !inGroup) {
    const tick = document.createElement('span');
    tick.className = 'tick' + (data.read ? ' read' : '');
    tick.innerText = data.read ? '✓✓' : '✓';
    meta.appendChild(tick);
  }
  wrap.appendChild(meta);

  if (msgKey) {
    const reactionsRoomPath = inGroup ? ('groups_reactions/' + currentGroupId + '/' + msgKey) : ('private_chats_reactions/' + getRoomId(myUserId, targetUserId) + '/' + msgKey);
    const reactionsRef = db.ref(reactionsRoomPath);
    const reactionsShown = document.createElement("div");
    reactionsShown.className = "reactions-shown";
    wrap.appendChild(reactionsShown);
    reactionsRef.on("value", (snap) => {
      const vals = snap.val() || {};
      reactionsShown.innerHTML = Object.values(vals).join(" ");
    });
  }

  attachMessageGestures(wrap, msgKey, data, isSent);

  if (prepend) {
    const loadBtn = document.getElementById('loadOlderBtn');
    loadBtn.insertAdjacentElement('afterend', wrap);
  } else {
    messagesBox.appendChild(wrap);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }
  msgElements[msgKey] = wrap;
}

function clearChat() {
  if (!chatRoomRef) { alert("⚠️ لا توجد محادثة لمسحها."); return; }
  if (confirm("🗑️ هل أنت متأكد من مسح جميع رسائل هذه المحادثة؟")) {
    chatRoomRef.remove();
    resetMessagesBox();
  }
}

let localStream = null, peerConnection = null;
const iceServers = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

const incomingCallsRef = db.ref("calls/" + myUserId);
incomingCallsRef.on("value", async (snapshot) => {
  const data = snapshot.val();
  if (!data) return;
  if (data.offer && !peerConnection) {
    const accept = confirm(`📞 مكالمة ${data.isVideo ? 'فيديو' : 'صوتية'} واردة من ${data.callerId}. هل تريد الرد؟`);
    if (!accept) { incomingCallsRef.remove(); return; }
    openChat(data.callerId);
    const isVideo = data.isVideo;
    showCallUI(isVideo);
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
      if (isVideo) document.getElementById("localVideo").srcObject = localStream;
      peerConnection = new RTCPeerConnection(iceServers);
      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
      peerConnection.ontrack = (event) => { document.getElementById("remoteVideo").srcObject = event.streams[0]; };
      peerConnection.onicecandidate = (event) => { if (event.candidate) db.ref(`calls/${targetUserId}/candidates`).push(JSON.stringify(event.candidate)); };
      await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.offer)));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await db.ref(`calls/${targetUserId}/answer`).set(JSON.stringify(answer));
    } catch (err) { alert("❌ فشل الوصول للكاميرا/الميكروفون: " + err.message); endCall(); }
  }
  if (data.answer && peerConnection && !peerConnection.remoteDescription) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.answer)));
  }
});
db.ref(`calls/${myUserId}/candidates`).on("child_added", async (snapshot) => {
  if (peerConnection && snapshot.val()) await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(snapshot.val())));
});

async function startCall(isVideo) {
  if (!targetUserId) { alert("⚠️ افتح محادثة فردية أولاً (المكالمات غير متاحة للمجموعات)."); return; }
  showCallUI(isVideo);
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
    if (isVideo) document.getElementById("localVideo").srcObject = localStream;
    peerConnection = new RTCPeerConnection(iceServers);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = (event) => { document.getElementById("remoteVideo").srcObject = event.streams[0]; };
    peerConnection.onicecandidate = (event) => { if (event.candidate) db.ref(`calls/${targetUserId}/candidates`).push(JSON.stringify(event.candidate)); };
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await db.ref(`calls/${targetUserId}`).remove();
    await db.ref(`calls/${targetUserId}`).set({ callerId: myUserId, offer: JSON.stringify(offer), isVideo });
  } catch (err) { alert("❌ تعذر إجراء المكالمة: " + err.message); endCall(); }
}
function showCallUI(isVideo) {
  document.getElementById("voiceCallBtn").style.display = "none";
  document.getElementById("videoCallBtn").style.display = "none";
  document.getElementById("endCallBtn").style.display = "flex";
  document.getElementById("screenShareBtn").style.display = isVideo ? "flex" : "none";
  if (isVideo) { document.getElementById("video-container").style.display = "flex"; document.getElementById("call-status").style.display = "none"; }
  else { document.getElementById("video-container").style.display = "none"; document.getElementById("call-status").style.display = "block"; document.getElementById("call-status").innerHTML = "🎙️ جارٍ الاتصال الصوتي..."; }
}
function endCall() {
  if (localStream) { localStream.getTracks().forEach(track => track.stop()); localStream = null; }
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  if (myUserId) db.ref(`calls/${myUserId}`).remove();
  if (targetUserId) db.ref(`calls/${targetUserId}`).remove();
  document.getElementById("video-container").style.display = "none";
  document.getElementById("call-status").style.display = "none";
  document.getElementById("voiceCallBtn").style.display = "flex";
  document.getElementById("videoCallBtn").style.display = "flex";
  document.getElementById("endCallBtn").style.display = "none";
  document.getElementById("screenShareBtn").style.display = "none";
}

// ================================================================
//   SCREEN SHARE
// ================================================================
let screenStream = null;
let cameraTrackBackup = null;
async function toggleScreenShare() {
  if (!peerConnection) return;
  const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
  if (!sender) { alert('⚠️ متاح فقط أثناء مكالمة فيديو نشطة.'); return; }
  if (screenStream) {
    if (cameraTrackBackup) sender.replaceTrack(cameraTrackBackup);
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
    document.getElementById('screenShareBtn').innerText = '🖥️ مشاركة الشاشة';
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    cameraTrackBackup = sender.track;
    const screenTrack = screenStream.getVideoTracks()[0];
    sender.replaceTrack(screenTrack);
    document.getElementById('localVideo').srcObject = screenStream;
    document.getElementById('screenShareBtn').innerText = '🖥️ إيقاف المشاركة';
    screenTrack.onended = () => toggleScreenShare();
  } catch (err) { }
}

// ================================================================
//   GROUP CALLS
// ================================================================
function pairKey(a, b) { return [a, b].sort().join('__'); }
const groupPeerConnections = {};
let groupLocalStream = null;
let groupCallListenerAttached = null;

function attachGroupCallListener(groupId) {
  if (groupCallListenerAttached === groupId) return;
  groupCallListenerAttached = groupId;
  db.ref('group_calls/' + groupId).on('child_added', async (snap) => {
    const key = snap.key;
    if (!key.includes(myUserId)) return;
    const otherId = key.split('__').find(id => id !== myUserId);
    if (!otherId || groupPeerConnections[otherId]) return;
    const data = snap.val();
    if (!data || !data.offer || data.from === myUserId) return;
    if (!confirm(`📞 مكالمة جماعية جارية في المجموعة. الانضمام؟`)) return;
    if (!groupLocalStream) {
      try { groupLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { alert('❌ تعذر الوصول للميكروفون.'); return; }
      showGroupCallUI();
    }
    answerGroupPeer(groupId, otherId, key, data);
  });
}

function createGroupPeerConnection(groupId, otherId, key) {
  const pc = new RTCPeerConnection(iceServers);
  groupPeerConnections[otherId] = pc;
  groupLocalStream.getTracks().forEach(t => pc.addTrack(t, groupLocalStream));
  pc.ontrack = (event) => playRemoteGroupAudio(otherId, event.streams[0]);
  pc.onicecandidate = (event) => {
    if (event.candidate) db.ref(`group_calls/${groupId}/${key}/candidates_${myUserId}`).push(JSON.stringify(event.candidate));
  };
  db.ref(`group_calls/${groupId}/${key}/candidates_${otherId}`).on('child_added', (s) => {
    if (s.val()) pc.addIceCandidate(new RTCIceCandidate(JSON.parse(s.val())));
  });
  return pc;
}

async function initiateGroupPeer(groupId, otherId) {
  const key = pairKey(myUserId, otherId);
  const pc = createGroupPeerConnection(groupId, otherId, key);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await db.ref(`group_calls/${groupId}/${key}`).set({ offer: JSON.stringify(offer), from: myUserId });
  db.ref(`group_calls/${groupId}/${key}/answer`).on('value', async (snap) => {
    if (snap.val() && pc.signalingState !== 'stable' && !pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(snap.val())));
    }
  });
}

async function answerGroupPeer(groupId, otherId, key, data) {
  const pc = createGroupPeerConnection(groupId, otherId, key);
  await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.offer)));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await db.ref(`group_calls/${groupId}/${key}/answer`).set(JSON.stringify(answer));
}

function playRemoteGroupAudio(otherId, stream) {
  let audio = document.getElementById('group_audio_' + otherId);
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'group_audio_' + otherId;
    audio.autoplay = true;
    document.body.appendChild(audio);
  }
  audio.srcObject = stream;
}

async function startGroupCall() {
  if (!currentGroupId || !currentGroupMeta) { alert('⚠️ افتح مجموعة أولاً.'); return; }
  try {
    groupLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) { alert('❌ تعذر الوصول للميكروفون.'); return; }
  showGroupCallUI();
  const members = (currentGroupMeta.members || []).filter(m => m !== myUserId);
  members.forEach(m => initiateGroupPeer(currentGroupId, m));
}
function showGroupCallUI() {
  document.getElementById('groupVoiceCallBtn').style.display = 'none';
  document.getElementById('groupEndCallBtn').style.display = 'flex';
}
function endGroupCall() {
  Object.values(groupPeerConnections).forEach(pc => pc.close());
  Object.keys(groupPeerConnections).forEach(k => {
    delete groupPeerConnections[k];
    const audio = document.getElementById('group_audio_' + k);
    if (audio) audio.remove();
  });
  if (groupLocalStream) { groupLocalStream.getTracks().forEach(t => t.stop()); groupLocalStream = null; }
  if (currentGroupId) db.ref('group_calls/' + currentGroupId).once('value', (snap) => {
    snap.forEach(child => { if (child.key.includes(myUserId)) db.ref('group_calls/' + currentGroupId + '/' + child.key).remove(); });
  });
  document.getElementById('groupVoiceCallBtn').style.display = 'flex';
  document.getElementById('groupEndCallBtn').style.display = 'none';
}

(function autoConnectFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const peer = params.get('peer');
  if (peer) setTimeout(() => openChat(peer), 400);
})();

renderChatsList();
updateOfflineBanner();
console.log(`🔐 واتساب خاص جاهز - معرفك: ${myUserId}`);
