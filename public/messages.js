import{createKeyBundle,unlockPrivateKey,encryptMessage,decryptMessage}from"./crypto.js";
const $=id=>document.getElementById(id);
const tokenKey="tc_social_access_token";
let user=null,privateKey=null,activeId=null,activePeople=[],poll=null,searchTimer=null,olderCursor=null,hasOlder=false,olderMessages=[];const migrationAttempted=new Set();
const shell=$("messages-shell"),list=$("conversation-list"),stream=$("message-stream"),head=$("conversation-head"),composer=$("message-compose"),input=$("message-input"),sendButton=composer.querySelector("button");
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function token(){return localStorage.getItem(tokenKey)||""}
async function api(path,options={}){const response=await fetch(path,{...options,headers:{accept:"application/json",...(options.body?{"content-type":"application/json"}:{}),authorization:"Bearer "+token(),...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok){const e=new Error(data.message||data.error||"Request failed");e.code=data.error;e.status=response.status;throw e}return data}
function signIn(){const state=crypto.randomUUID(),bytes=new Uint8Array(48);crypto.getRandomValues(bytes);const verifier=btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");sessionStorage.setItem("tc_social_oauth_state",state);sessionStorage.setItem("tc_social_oauth_verifier",verifier);sessionStorage.setItem("tc_social_oauth_slot","0");sessionStorage.setItem("tc_social_oauth_return","/messages");crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)).then(hash=>{const challenge=btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");return fetch("/api/auth/config").then(r=>r.json()).then(config=>{if(!config.client_id)throw new Error("Social sign-in is not configured.");const url=new URL("https://accounts.theegget.com/oauth/authorize");Object.entries({client_id:config.client_id,redirect_uri:location.origin+"/auth/callback",response_type:"code",scope:"profile",state,code_challenge:challenge,code_challenge_method:"S256"}).forEach(([k,v])=>url.searchParams.set(k,v));location.assign(url)})}).catch(e=>alert(e.message))}
const rememberDb=()=>new Promise((resolve,reject)=>{const request=indexedDB.open("tc-social-encryption",1);request.onupgradeneeded=()=>request.result.createObjectStore("sessions");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
async function getRememberedKey(){try{const db=await rememberDb();const value=await new Promise((resolve,reject)=>{const request=db.transaction("sessions","readonly").objectStore("sessions").get("private-key");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});db.close();if(!value||value.expiresAt<=Date.now()){await clearRememberedKey();return null}return value.key}catch{return null}}
async function rememberKey(key){const db=await rememberDb();await new Promise((resolve,reject)=>{const request=db.transaction("sessions","readwrite").objectStore("sessions").put({key,expiresAt:Date.now()+30*24*60*60*1000},"private-key");request.onsuccess=resolve;request.onerror=()=>reject(request.error)});db.close()}
async function clearRememberedKey(){try{const db=await rememberDb();await new Promise((resolve,reject)=>{const request=db.transaction("sessions","readwrite").objectStore("sessions").delete("private-key");request.onsuccess=resolve;request.onerror=()=>reject(request.error)});db.close()}catch{}}
async function unlock(){
 const remembered=await getRememberedKey();
 if(remembered){privateKey=remembered;return}
 const getBundle=()=>api("/api/keys/self",{method:"GET"});
 let data=await getBundle();
 const modal=$("key-modal"),form=$("key-form"),field=$("key-passphrase"),button=$("key-unlock-button"),errorBox=$("key-error");
 modal.hidden=false;
 $("key-title").textContent=data.key_bundle?"Unlock encrypted messages":"Set up encrypted messages";
 $("key-description").textContent=data.key_bundle?"Enter the recovery passphrase you already use in TC Chat. Your passphrase stays on this device.":"Create a recovery passphrase with at least 12 characters. Keep it safe: it protects access to your encrypted messages.";
 field.autocomplete=data.key_bundle?"current-password":"new-password";
 field.placeholder=data.key_bundle?"Your existing TC Chat recovery passphrase":"Create a recovery passphrase";
 return new Promise((resolve,reject)=>{
  const submitUnlock=async event=>{
   event.preventDefault();
   if(button.disabled)return;
   errorBox.textContent="";
   const pass=field.value;
   if(pass.length<12){errorBox.textContent="Use at least 12 characters.";field.focus();return}
   button.disabled=true;
   button.textContent=data.key_bundle?"Unlocking…":"Setting up…";
   try{
    if(data.key_bundle){
     privateKey=await unlockPrivateKey(data.key_bundle,pass);
    }else{
     const bundle=await createKeyBundle(pass);
     try{
      await api("/api/keys/self",{method:"POST",body:JSON.stringify(bundle)});
      privateKey=await unlockPrivateKey(bundle,pass);
     }catch(saveError){
      if(saveError.code!=="key_bundle_exists"&&saveError.status!==409)throw saveError;
      data=await getBundle();
      if(!data.key_bundle)throw saveError;
      $("key-title").textContent="Unlock encrypted messages";
      $("key-description").textContent="An encryption key already exists for this account. Enter the recovery passphrase you originally created in TC Chat.";
      field.placeholder="Your existing TC Chat recovery passphrase";
      field.autocomplete="current-password";
      privateKey=await unlockPrivateKey(data.key_bundle,pass);
     }
    }
    if($("remember-encryption").checked)await rememberKey(privateKey);else await clearRememberedKey();
    modal.hidden=true;
    field.value="";
    resolve();
   }catch(failure){
    privateKey=null;
    errorBox.textContent=failure.message||"The recovery key could not be unlocked. Check the passphrase and try again.";
    field.focus();
   }finally{
    button.disabled=false;
    button.textContent="Unlock messages";
   }
  };button.addEventListener("click",submitUnlock);form.addEventListener("submit",event=>{event.preventDefault();submitUnlock(event)});field.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();submitUnlock(event)}});
 });
}
function conversationName(c){const other=(c.participants||[]).find(p=>String(p.id)!==String(user.id));return c.type==="group"?(c.title||"Group conversation"):(other?.username?"@"+other.username:"Conversation")}
async function migrateLegacyHistory(cid,people){const keyData=await api("/api/keys?user_ids="+encodeURIComponent(people.map(p=>p.id).join(",")));if(keyData.keys.length!==people.length)return;let before="",beforeId="";for(;;){const query=before?"&before="+encodeURIComponent(before)+"&before_id="+encodeURIComponent(beforeId):"";const pageData=await api("/api/conversations/"+cid+"/messages?limit=80"+query);const page=pageData.messages||[];for(const message of page){if(message.encrypted_payload||typeof message.body!=="string"||!message.body)continue;const payload=await encryptMessage(message.body,cid,keyData.keys);await api("/api/conversations/"+cid+"/messages/"+message.id+"/encrypt",{method:"POST",body:JSON.stringify({encrypted_payload:payload})})}if(page.length<80)break;before=page[0].created_at;beforeId=page[0].id}}
async function loadConversations(){const data=await api("/api/conversations");list.innerHTML="";for(const c of data.conversations){const row=document.createElement("button");row.className="conversation-item"+(c.id===activeId?" active":"");row.innerHTML='<span class="conversation-avatar">'+esc(conversationName(c).replace(/^@/,"").slice(0,1).toUpperCase())+'</span><span class="conversation-meta"><strong>'+esc(conversationName(c))+'</strong><small>'+esc(c.last_message||"No messages yet")+'</small></span>';row.onclick=()=>openConversation(c.id);list.append(row)}if(!data.conversations.length)list.innerHTML='<div class="message-empty">No conversations yet.</div>';return data.conversations}
async function openConversation(id){activeId=id;composer.hidden=false;olderCursor=null;hasOlder=false;olderMessages=[];shell.dataset.open="true";$("back-to-list").style.display="";await loadConversations();await loadMessages();if(poll)clearInterval(poll);poll=setInterval(()=>loadMessages(true).catch(()=>{}),5000)}
async function decodeMessages(items){const decoded=[];for(const m of items){let body="";try{if(m.encrypted_payload)body=await decryptMessage(m.encrypted_payload,activeId,user.id,privateKey);else body=(m.body||"")+"\n\n(Legacy message — not yet encrypted; all participants must set up encryption.)"}catch{body="Unable to decrypt on this device."}decoded.push({...m,plain:body})}return decoded}
function renderMessage(m){return '<article class="message-bubble'+(String(m.sender_id)===String(user.id)?" mine":"")+'">'+esc(m.plain)+'<div class="message-time">'+esc(new Date(m.created_at).toLocaleString())+'</div></article>'}
async function loadMessages(quiet=false){if(!activeId)return;let data=await api("/api/conversations/"+activeId+"/messages?limit=80");activePeople=data.conversation?await (async()=>{const c=(await api("/api/conversations")).conversations.find(x=>x.id===activeId);return c?.participants||[]})():[];if(!migrationAttempted.has(activeId)){migrationAttempted.add(activeId);try{await migrateLegacyHistory(activeId,activePeople);data=await api("/api/conversations/"+activeId+"/messages?limit=80")}catch{}}head.querySelector("div").innerHTML="<strong>"+esc(conversationName({type:data.conversation?.type,title:data.conversation?.title,participants:activePeople}))+"</strong><small><i data-lucide=\"lock\"></i> End-to-end encrypted</small>";window.lucide?.createIcons();input.disabled=false;sendButton.disabled=false;const page=data.messages||[];if(!olderMessages.length){hasOlder=page.length===80;olderCursor=page.length?{created_at:page[0].created_at,id:page[0].id}:null}else if(!olderCursor&&page.length){olderCursor={created_at:page[0].created_at,id:page[0].id}}const messages=await decodeMessages(page);const oldHeight=stream.scrollHeight;stream.innerHTML=(hasOlder?'<button class="new-message" id="load-older" style="align-self:center;margin:0 auto 8px">Load older messages</button>':"")+[...olderMessages,...messages].map(renderMessage).join("")||'<div class="message-empty">No messages yet. Send the first one.</div>';const olderButton=$("load-older");if(olderButton)olderButton.onclick=loadOlder;if(!quiet||stream.scrollHeight!==oldHeight)stream.scrollTop=stream.scrollHeight}
async function loadOlder(){if(!activeId||!hasOlder||!olderCursor)return;const button=$("load-older");if(button){button.disabled=true;button.textContent="Loading…"}try{const query="&before="+encodeURIComponent(olderCursor.created_at)+"&before_id="+encodeURIComponent(olderCursor.id);const data=await api("/api/conversations/"+activeId+"/messages?limit=80"+query);const page=data.messages||[];if(!page.length){hasOlder=false;button?.remove();return}const decoded=await decodeMessages(page);olderMessages=[...decoded,...olderMessages];olderCursor={created_at:page[0].created_at,id:page[0].id};hasOlder=page.length===80;const previousHeight=stream.scrollHeight,previousTop=stream.scrollTop;stream.querySelector("#load-older")?.remove();stream.insertAdjacentHTML("afterbegin",decoded.map(renderMessage).join(""));if(hasOlder){const olderButton=document.createElement("button");olderButton.id="load-older";olderButton.className="new-message";olderButton.textContent="Load older messages";olderButton.style.alignSelf="center";olderButton.style.margin="0 auto 8px";olderButton.onclick=loadOlder;stream.prepend(olderButton)}stream.scrollTop=stream.scrollHeight-previousHeight+previousTop}catch(error){if(button){button.disabled=false;button.textContent="Load older messages"}alert(error.message)}}
$("message-compose").onsubmit=async e=>{e.preventDefault();const text=input.value.trim();if(!text||!activeId)return;sendButton.disabled=true;try{const keys=await api("/api/keys?user_ids="+encodeURIComponent(activePeople.map(p=>p.id).join(",")));if(keys.keys.length!==activePeople.length)throw new Error("Every participant must finish encryption setup before messaging.");const payload=await encryptMessage(text,activeId,keys.keys);await api("/api/conversations/"+activeId+"/messages",{method:"POST",body:JSON.stringify({encrypted_payload:payload})});input.value="";await loadMessages();await loadConversations()}catch(error){alert(error.message)}finally{sendButton.disabled=false}};
$("new-message").onclick=()=>{$("directory-search").focus();$("directory-search").placeholder="Search by username to start a DM"};
$("directory-search").addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(searchDirectory,250)});
async function searchDirectory(){const q=$("directory-search").value.trim(),box=$("directory-results");if(q.length<2){box.innerHTML="";return}try{const data=await api("/api/directory?q="+encodeURIComponent(q));box.innerHTML=(data.users||[]).map(person=>'<div class="directory-result"><span>@'+esc(person.username)+'</span><button data-user="'+esc(person.id)+'">Message</button></div>').join("")||'<small>No users found.</small>';box.querySelectorAll("[data-user]").forEach(button=>button.onclick=async()=>{try{const result=await api("/api/conversations",{method:"POST",body:JSON.stringify({participant_ids:[button.dataset.user]})});$("directory-search").value="";box.innerHTML="";await openConversation(result.conversation_id)}catch(error){alert(error.message)}})}catch(error){box.textContent=error.message}}
$("back-to-list").onclick=()=>{shell.dataset.open="";activeId=null;composer.hidden=true;olderCursor=null;hasOlder=false;olderMessages=[];if(poll)clearInterval(poll);input.disabled=true;sendButton.disabled=true;stream.innerHTML='<div class="message-empty"><h2>Your messages</h2><p>Choose a conversation or start a new one.</p></div>'};
async function start(){if(!token()){stream.innerHTML='<div class="message-empty"><h2>Sign in required</h2><p>Sign in with your TC Account to access encrypted messages.</p><button class="new-message" id="sign-in">Sign in with TC</button></div>';$("sign-in").onclick=signIn;return}try{const data=await api("/api/messages/me");user=data.user;await unlock();await loadConversations();const target=new URLSearchParams(location.search).get("to");if(target){const directory=await api("/api/directory?q="+encodeURIComponent(target));const match=(directory.users||[]).find(person=>String(person.username).toLowerCase()===target.toLowerCase());if(match){const result=await api("/api/conversations",{method:"POST",body:JSON.stringify({participant_ids:[match.id]})});await openConversation(result.conversation_id)}else{stream.innerHTML='<div class="message-empty"><h2>Cannot start this DM yet</h2><p>That account could not be found, or it has restricted messages.</p></div>'}}else if(location.hash.startsWith("#conversation="))await openConversation(location.hash.slice(13))}catch(error){stream.innerHTML='<div class="message-empty"><h2>Messages unavailable</h2><p>'+esc(error.message)+'</p><a href="/">Return to Social</a></div>'}}
start();
