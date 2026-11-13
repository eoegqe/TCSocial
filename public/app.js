const feed=document.querySelector("#feed");
const pageTitle=document.querySelector("#page-title");
document.querySelector("#year").textContent=new Date().getFullYear();
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const initials=value=>String(value||"TC").trim().slice(0,1).toUpperCase();
const safeMediaUrl=value=>{if(typeof value!=="string"||!value.trim())return "";try{const url=new URL(value.trim(),location.origin);return ["https:","http:"].includes(url.protocol)?url.href:""}catch{return ""}};
const avatar=(url,name)=>{const safe=safeMediaUrl(url);return safe?'<img class="avatar" src="'+escapeHtml(safe)+'" alt="">':'<span class="avatar">'+escapeHtml(initials(name))+'</span>'};
const time=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?"":date.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})};
async function api(path){const token=sessionStorage.getItem("tc_social_access_token");const response=await fetch(path,{headers:{accept:"application/json",...(token?{authorization:"Bearer "+token}:{})},credentials:"same-origin"});const data=await response.json().catch(()=>({}));if(!response.ok){const error=new Error("Request failed");error.status=response.status;error.code=data.error;error.confidence=data.confidence;throw error}return data}

const OAUTH_REDIRECT_URI=location.origin+"/auth/callback";
const bytesToBase64Url=bytes=>{let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")};
async function sha256(value){return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))))}
function randomToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return bytesToBase64Url(bytes)}
async function beginSignIn(){try{const config=await api("/api/auth/config");if(!config.client_id)throw new Error("TC Social's OAuth client ID has not been configured yet.");const state=randomToken(),verifier=randomToken(),challenge=await sha256(verifier);sessionStorage.setItem("tc_social_oauth_state",state);sessionStorage.setItem("tc_social_oauth_verifier",verifier);const authorize=new URL("https://accounts.theegget.com/oauth/authorize");for(const [key,value] of Object.entries({client_id:config.client_id,redirect_uri:OAUTH_REDIRECT_URI,response_type:"code",scope:"profile",state,code_challenge:challenge,code_challenge_method:"S256"}))authorize.searchParams.set(key,value);location.assign(authorize.toString())}catch(error){showAuthError(error.message)}}
async function updateSignInState(user){
 const wrapper=document.querySelector(".account-menu-wrap");
 if(!wrapper)return;
 let header=wrapper.querySelector("[data-tc-header-account]");
 const dropdown=wrapper.querySelector("[data-account-dropdown]");
 if(!user||!user.preferred_username){
  if(header?.tagName==="BUTTON")header.outerHTML='<a class="sign-in" href="#" data-tc-signin data-tc-header-account>Sign in with TC</a>';
  header=wrapper.querySelector("[data-tc-header-account]");
  if(header){header.href="#";header.className="sign-in";header.textContent="Sign in with TC";header.removeAttribute("title");header.setAttribute("aria-label","Sign in with TC")}
  if(dropdown)dropdown.hidden=true;
  return;
 }
 const username=String(user.preferred_username);
 let picture=user.picture||user.profile_picture||"";
 let displayName=user.display_name||user.name||username;
 try{const profile=await api("/api/profile/"+encodeURIComponent(username));picture=profile.profile?.profile_picture||picture;displayName=profile.profile?.display_name||displayName}catch{}
 const safe=safeMediaUrl(picture);
 if(header?.tagName!=="BUTTON"){
  if(header)header.outerHTML='<button class="account-avatar-link" type="button" data-tc-header-account aria-expanded="false" aria-label="Open account menu"></button>';
  header=wrapper.querySelector("[data-tc-header-account]");
 }
 header.className="account-avatar-link";
 header.removeAttribute("href");
 header.removeAttribute("data-tc-signin");
 header.title="@"+username;
 header.setAttribute("aria-label","Open account menu for @"+username);
 header.setAttribute("aria-expanded","false");
 header.innerHTML=safe?'<img class="account-avatar" src="'+escapeHtml(safe)+'" alt="">':'<span class="account-avatar account-avatar-fallback">'+escapeHtml(initials(displayName))+'</span>';
 if(dropdown){dropdown.querySelector("[data-view-account-page]").href="/@"+encodeURIComponent(username);dropdown.hidden=true}
}
async function restoreSignIn(){const token=sessionStorage.getItem("tc_social_access_token");if(!token)return;try{const response=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+token,accept:"application/json"}});if(!response.ok)throw new Error("expired");const user=await response.json();sessionStorage.setItem("tc_social_user",JSON.stringify(user));updateSignInState(user)}catch{sessionStorage.removeItem("tc_social_access_token");sessionStorage.removeItem("tc_social_user");updateSignInState(null)}}
function showToast(message){const toast=document.querySelector("#toast");if(!toast)return;toast.textContent=message;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2600)}
function showAuthError(message){const modal=document.querySelector("#auth-modal");modal.hidden=false;const description=modal.querySelector("p");if(description)description.textContent=message}
async function completeSignIn(){const params=new URLSearchParams(location.search),code=params.get("code"),state=params.get("state"),expected=sessionStorage.getItem("tc_social_oauth_state"),verifier=sessionStorage.getItem("tc_social_oauth_verifier");if(params.has("error"))throw new Error(params.get("error")==="access_denied"?"You cancelled TC Social sign-in.":"TC Accounts could not authorize this sign-in.");if(!code||!state||!expected||state!==expected||!verifier)throw new Error("The sign-in response could not be verified. Please try again.");const config=await api("/api/auth/config");if(!config.client_id)throw new Error("TC Social's OAuth client ID has not been configured yet.");const response=await fetch("https://accounts.theegget.com/oauth/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},body:new URLSearchParams({grant_type:"authorization_code",code,client_id:config.client_id,redirect_uri:OAUTH_REDIRECT_URI,code_verifier:verifier})});const data=await response.json().catch(()=>({}));if(!response.ok||!data.access_token)throw new Error(data.error_description||data.error||"TC Accounts could not complete sign-in.");sessionStorage.setItem("tc_social_access_token",data.access_token);const userResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+data.access_token,accept:"application/json"}});const user=await userResponse.json().catch(()=>({}));if(!userResponse.ok||!user.sub)throw new Error("TC Accounts issued a token but could not confirm the account identity.");sessionStorage.setItem("tc_social_user",JSON.stringify(user));updateSignInState(user);sessionStorage.removeItem("tc_social_oauth_state");sessionStorage.removeItem("tc_social_oauth_verifier");history.replaceState({},"","/");location.assign("/")}

function renderPost(post){
 const name=post.display_name||"@"+post.username;
 const mediaUrl=safeMediaUrl(post.media_url);
 const media=mediaUrl?(/\.(mp4|webm|ogg)(?:$|\?)/i.test(mediaUrl)?'<video class="post-media" controls preload="metadata" src="'+escapeHtml(mediaUrl)+'"></video>':'<img class="post-media" loading="lazy" src="'+escapeHtml(mediaUrl)+'" alt="Post media">'):"";
 return '<article class="post"><div class="post-head">'+avatar(post.profile_picture,name)+'<div class="post-author"><a href="/@'+encodeURIComponent(post.username)+'">'+escapeHtml(name)+'</a><small>@'+escapeHtml(post.username)+' · '+escapeHtml(time(post.created_at))+'</small></div></div>'+(post.content?'<p class="post-content">'+escapeHtml(post.content)+'</p>':"")+media+'<div class="post-actions"><button class="post-action" data-auth-action="react">React</button><button class="post-action" data-auth-action="comment">Comment</button></div></article>';
}
function renderBotBlockedError(){
 const messages=["sorry clanker You can\u0027t access this action yeah I\u0027ll just call you that until you verify","clanker... You in fact do not have access","look at the sign. We are anti-bot\u0027s"];
 const message=messages[Math.floor(Math.random()*messages.length)];
 feed.innerHTML='<section class="error-shell"><div class="error-card"><p class="error-code bot-error-code">Action blocked</p><h2 class="error-title">Action blocked</h2><p class="error-message">'+escapeHtml(message)+'</p><a class="error-home" href="/">Back to TC Social</a></div></section>';
}
function renderRequestError(error){if(error?.code==="bot_detected"&&error?.confidence==="high"){renderBotBlockedError();return}renderError(error?.status||500)}
function renderError(status){
 const current=location.pathname;
 const previous=()=>{const ref=document.referrer;if(ref&&new URL(ref).origin===location.origin)return ref;return "/"};
 let title="Something went wrong",message="We couldn't complete that request.",code=status;
 if(status===403||status===404){
  const key="tc_error_"+status+"_"+current;
  const attempt=Number(sessionStorage.getItem(key)||0)+1;
  sessionStorage.setItem(key,String(attempt));
  const messages=status===403?["Looks like you don't have access to that page.","I already told you you don't have access.","Buddy. Are you blind? You don't have access.","Seriously? This page isn't for you.","Okay, I think you've made your point. You STILL don't have access."]:["Uh oh! We couldn't find that page.","Yeah... still can't find it.","Are you sure you typed that correctly?","I'm starting to think this page doesn't exist.","Buddy, THERE IS NO PAGE HERE."];
  title=status===403?"403 · Forbidden":"404 · Not Found";
  if(attempt>5){message="Alright, let's get you out of here.";setTimeout(()=>location.replace(previous()),1800)}else message=messages[Math.min(attempt-1,4)];
 }else if(status===500){
  const key="tc_error_500";
  const attempt=Number(sessionStorage.getItem(key)||0)+1;
  sessionStorage.setItem(key,String(attempt));
  title="500 · Internal Server Error";
  message=attempt===1?"Well, that wasn't supposed to happen. Something went wrong on our end.":"Looks like Theegget might need to fix the servers again.";
 }
 feed.innerHTML='<section class="error-shell"><div class="error-card"><p class="error-code">'+escapeHtml(code)+'</p><h2 class="error-title">'+escapeHtml(title)+'</h2><p class="error-message">'+escapeHtml(message)+'</p><a class="error-home" href="/">Back to TC Social</a></div></section>';
}
async function loadHome(){
 pageTitle.textContent=location.pathname==="/explore"?"Explore":"Home";
 try{
  const data=await api("/api/feed");
  const posts=data.posts||[];
  const signedIn=Boolean(sessionStorage.getItem("tc_social_access_token"));
  let composer="";
  if(signedIn){
   let identities=[];
   try{identities=(await api("/api/identities")).identities||[]}catch{}
   const options=identities.map(item=>'<option value="'+escapeHtml(item.id)+'">'+escapeHtml(item.display_name+' (@'+item.username+')')+'</option>').join("");
   composer='<button class="compose-toggle" id="compose-toggle" type="button" aria-expanded="false" aria-controls="post-composer">+ Post</button><form id="post-composer" class="post-composer" hidden><label for="post-identity">Post as</label><select id="post-identity" name="identity_id">'+options+'</select><label for="post-content">Create a post</label><textarea id="post-content" name="content" maxlength="2000" rows="3" placeholder="What would you like to share?" required></textarea><div class="composer-footer"><span id="post-character-count">0 / 2,000</span><button class="publish-post" type="submit">Post</button></div><p class="composer-error" id="post-composer-error" role="alert"></p></form>';
  }
  feed.innerHTML=composer+(posts.length?posts.map(renderPost).join(""):'<section class="empty-card"><strong>Nothing here yet.</strong><p>Posts will appear here as the TC Social community grows.</p></section>');
 }catch(error){renderRequestError(error)}
}

function closeProfileEditor(){const modal=document.querySelector("#profile-editor-modal");if(modal)modal.remove()}
async function resizeProfilePhoto(file){
 if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Choose a PNG, JPEG, or WebP photo.");
 if(file.size>12*1024*1024)throw new Error("Choose an image smaller than 12 MB.");
 const bitmap=await createImageBitmap(file);
 const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement("canvas");
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const context=canvas.getContext("2d");context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 let blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",.82));
 if(!blob)blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.82));
 if(blob.size>400000)blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.65));
 if(!blob||blob.size>400000)throw new Error("This photo is too large after resizing. Choose another image.");
 return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Could not read the selected photo."));reader.readAsDataURL(blob)});
}
function openProfileEditor(profile){
 closeProfileEditor();
 const modal=document.createElement("div");
 modal.id="profile-editor-modal";
 modal.className="modal";
 modal.innerHTML='<div class="modal-backdrop" data-editor-close></div><section class="modal-card profile-editor-card" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title"><button class="modal-close" type="button" data-editor-close aria-label="Close">×</button><span class="eyebrow">CREATOR SETTINGS</span><h2 id="profile-editor-title">Edit Creator page</h2><form id="profile-editor-form"><label for="edit-display-name">Display name</label><input id="edit-display-name" name="display_name" maxlength="80" placeholder="Your display name"><label for="edit-bio">Bio</label><textarea id="edit-bio" name="bio" maxlength="500" rows="4" placeholder="Tell people about yourself"></textarea><label for="edit-profile-picture">Profile photo</label><input id="edit-profile-picture" name="profile_picture_file" type="file" accept="image/png,image/jpeg,image/webp"><div class="profile-photo-preview" id="profile-photo-preview"></div><button type="button" class="post-action" id="remove-profile-picture">Remove photo</button><p class="editor-hint">Choose a PNG, JPEG, or WebP image. It will be resized before upload.</p><p class="editor-error" id="profile-editor-error" role="alert"></p><div class="editor-actions"><button type="button" class="post-action" data-editor-close>Cancel</button><button type="submit" class="editor-save">Save changes</button></div></form></section>';
 document.body.append(modal);
 modal.querySelector('[name="display_name"]').value=profile.display_name||"";
 modal.querySelector('[name="bio"]').value=profile.bio||"";
 modal.querySelector("#profile-photo-preview").innerHTML=avatar(profile.profile_picture,profile.display_name||profile.username);
 modal.querySelector('[name="display_name"]').focus();
}
async function saveProfileEditor(form){
 const token=sessionStorage.getItem("tc_social_access_token");
 const errorBox=document.querySelector("#profile-editor-error");
 const submit=form.querySelector('[type="submit"]');
 submit.disabled=true;submit.textContent="Saving…";errorBox.textContent="";
 try{
  const values={display_name:form.elements.display_name.value,bio:form.elements.bio.value};
  const file=form.elements.profile_picture_file.files[0];
  if(file)values.profile_picture=await resizeProfilePhoto(file);
  if(form.dataset.removePhoto==="true")values.profile_picture="";
  const response=await fetch("/api/profile/me",{method:"PATCH",headers:{"content-type":"application/json","accept":"application/json",authorization:"Bearer "+token},credentials:"same-origin",body:JSON.stringify(values)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const messages={image_too_large:"The resized photo must be 400 KB or smaller.",invalid_image:"Choose a PNG, JPEG, or WebP photo.",unauthorized:"Your TC sign-in has expired. Please sign in again.",display_name_too_long:"Display name must be 80 characters or fewer.",bio_too_long:"Bio must be 500 characters or fewer.",invalid_profile_picture_url:"Profile picture must be a valid HTTPS URL."};throw new Error(messages[data.error]||data.message||"Your Creator page could not be saved. Please try again.");}
  closeProfileEditor();
  showToast("Creator page updated.");
  loadProfile(data.profile.username);
  const user=JSON.parse(sessionStorage.getItem("tc_social_user")||"null");
  if(user&&String(user.preferred_username||"").toLowerCase()===String(data.profile.username).toLowerCase()){
   user.picture=data.profile.profile_picture||"";
   sessionStorage.setItem("tc_social_user",JSON.stringify(user));
   updateSignInState(user);
  }
 }catch(error){errorBox.textContent=error.message;submit.disabled=false;submit.textContent="Save changes"}
}

async function loadProfile(username){
 pageTitle.textContent="Creator";
 try{
  const data=await api("/api/profile/"+encodeURIComponent(username));
  const p=data.profile;
  const name=p.display_name||"@"+p.username;
  const signedInUser=JSON.parse(sessionStorage.getItem("tc_social_user")||"null");
  const isOwnPage=String(signedInUser?.preferred_username||"").toLowerCase()===String(p.username).toLowerCase();
  feed.innerHTML='<section class="profile-card"><div class="profile-top">'+avatar(p.profile_picture,name)+'<div><h1 class="profile-name">'+escapeHtml(name)+'</h1><span class="handle">@'+escapeHtml(p.username)+'</span></div>'+(isOwnPage?'<button class="post-action profile-edit-button" data-edit-profile>Edit</button>':'<button class="post-action" data-auth-action="follow">Follow</button>')+'</div>'+(p.bio?'<p class="bio">'+escapeHtml(p.bio)+'</p>':"")+'</section><div class="section-heading" style="margin-top:25px"><div><span class="eyebrow">CREATOR POSTS</span><h2>Posts</h2></div></div><div id="profile-posts" class="feed"><div class="loading"><span class="spinner"></span></div></div>';
  const posts=await api("/api/profile/"+encodeURIComponent(username)+"/posts");
  const target=document.querySelector("#profile-posts");
  target.innerHTML=posts.posts?.length?posts.posts.map(renderPost).join(""):'<section class="empty-card">This creator has not posted yet.</section>';
 }catch(error){renderRequestError(error)}
}
document.addEventListener("click",async event=>{
 const accountToggle=event.target.closest("[data-tc-header-account][aria-expanded]");
 if(accountToggle){event.preventDefault();const dropdown=document.querySelector("[data-account-dropdown]");const opening=dropdown.hidden;dropdown.hidden=!opening;accountToggle.setAttribute("aria-expanded",String(opening));return}
 const logout=event.target.closest("[data-account-logout]");
 if(logout){sessionStorage.removeItem("tc_social_access_token");sessionStorage.removeItem("tc_social_user");sessionStorage.removeItem("tc_social_oauth_state");sessionStorage.removeItem("tc_social_oauth_verifier");location.assign("/");return}
 const editProfile=event.target.closest("[data-edit-profile]");
 if(editProfile){try{const username=decodeURIComponent(location.pathname.split("/")[1].replace(/^@/,""));const profile=await api("/api/profile/"+encodeURIComponent(username));openProfileEditor(profile.profile)}catch(error){showToast("Could not load your Creator page settings.")}return}
 if(!event.target.closest(".account-menu-wrap")){const dropdown=document.querySelector("[data-account-dropdown]");const toggle=document.querySelector("[data-tc-header-account][aria-expanded]");if(dropdown)dropdown.hidden=true;if(toggle)toggle.setAttribute("aria-expanded","false")}
 const signIn=event.target.closest("[data-tc-signin]");
 if(signIn){event.preventDefault();beginSignIn();return}
 const action=event.target.closest("[data-auth-action]");
 if(action){document.querySelector("#auth-modal").hidden=false;return}
 if(event.target.closest("[data-close-auth]"))document.querySelector("#auth-modal").hidden=true;
 if(event.target.closest("[data-editor-close]"))closeProfileEditor();
 if(event.target.closest("#remove-profile-picture")){const form=document.querySelector("#profile-editor-form");form.dataset.removePhoto="true";form.elements.profile_picture_file.value="";document.querySelector("#profile-photo-preview").innerHTML='<span class="avatar">TC</span>';}
});
document.addEventListener("click",event=>{
 const toggle=event.target.closest("#compose-toggle");
 if(!toggle)return;
 const form=document.querySelector("#post-composer");
 if(!form)return;
 const opening=form.hidden;
 form.hidden=!opening;
 toggle.setAttribute("aria-expanded",String(opening));
 toggle.textContent=opening?"Cancel":"+ Post";
 if(opening)form.querySelector("#post-content").focus();
});
document.addEventListener("submit",async event=>{
 if(event.target.id!=="post-composer")return;
 event.preventDefault();
 const form=event.target,button=form.querySelector('[type="submit"]'),errorBox=form.querySelector("#post-composer-error");
 const content=form.elements.content.value.trim();
 if(!content){errorBox.textContent="Write something before posting.";return}
 button.disabled=true;button.textContent="Posting…";errorBox.textContent="";
 try{
  const response=await fetch("/api/posts",{method:"POST",headers:{"content-type":"application/json","accept":"application/json",authorization:"Bearer "+sessionStorage.getItem("tc_social_access_token")},credentials:"same-origin",body:JSON.stringify({content,identity_id:form.elements.identity_id.value||null})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const messages={unauthorized:"Your TC sign-in has expired. Please sign in again.",empty_post:"Write something before posting.",post_too_long:"Posts must be 2,000 characters or fewer.",identity_forbidden:"You do not have permission to post as that page.",invalid_identity:"Choose a valid posting identity.",social_account_required:"Your TC account needs an active TC Social profile before posting."};
   throw new Error(messages[data.error]||data.message||"Your post could not be published. Please try again.");
  }
  showToast("Post published.");
  await loadHome();
 }catch(error){errorBox.textContent=error.message;button.disabled=false;button.textContent="Post"}
});
document.addEventListener("input",event=>{if(event.target.id==="post-content"){const count=document.querySelector("#post-character-count");if(count)count.textContent=event.target.value.length.toLocaleString()+" / 2,000"}});
document.addEventListener("submit",event=>{if(event.target.id==="profile-editor-form"){event.preventDefault();saveProfileEditor(event.target)}});
document.addEventListener("change",event=>{if(event.target.name==="profile_picture_file"){const form=event.target.form;if(form)form.dataset.removePhoto="false";const file=event.target.files?.[0];if(file){const preview=document.querySelector("#profile-photo-preview");if(preview)preview.textContent=file.name}}});
document.addEventListener("keydown",event=>{if(event.key==="Escape"){document.querySelector("#auth-modal").hidden=true;closeProfileEditor()}});
if(location.pathname==="/auth/callback"){completeSignIn().catch(error=>{history.replaceState({},"","/");showAuthError(error.message)})}
else{let decodedPath=location.pathname;try{decodedPath=decodeURIComponent(decodedPath)}catch{}const match=decodedPath.match(/^\/@([^/]+)\/?$/);if(match){restoreSignIn().then(()=>loadProfile(match[1]))}else{restoreSignIn().finally(()=>loadHome())}}
