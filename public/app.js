const feed=document.querySelector("#feed");
const pageTitle=document.querySelector("#page-title");
document.querySelector("#year").textContent=new Date().getFullYear();
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const initials=value=>String(value||"TC").trim().slice(0,1).toUpperCase();
const safeMediaUrl=value=>{if(typeof value!=="string"||!value.trim())return "";try{const url=new URL(value.trim(),location.origin);return ["https:","http:"].includes(url.protocol)?url.href:""}catch{return ""}};
const verifiedMark=(verified,type="account",staff=false)=>{const icons={account:{name:"badge-check",title:"Verified account",path:'<path d="M3.85 8.62a4 4 0 0 1 4.77-4.77 4 4 0 0 1 6.76 0 4 4 0 0 1 4.77 4.77 4 4 0 0 1 0 6.76 4 4 0 0 1-4.77 4.77 4 4 0 0 1-6.76 0 4 4 0 0 1-4.77-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>'},business:{name:"briefcase-business",title:"Verified business",path:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/>'},group:{name:"users-round",title:"Verified group",path:'<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-5.5-7.6M16 3.1a5 5 0 0 1 0 9.8"/>'},ai:{name:"bot",title:"AI account",path:'<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M9 13v2M15 13v2"/>'}};const render=(icon,kind)=>'<span class="verified-mark verified-'+kind+'" title="'+icon.title+'" data-tooltip="'+icon.title+'" aria-label="'+icon.title+'"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icon.path+'</svg></span>';const mark=icons[type]||icons.account;return (verified?render(mark,type):"")+(staff?render({title:"TC staff",path:'<path d="m14.7 6.3 3 3"/><path d="M5 21a2 2 0 0 1-2-2l9.6-9.6a5 5 0 0 1 6.4-6.4l-3.1 3.1 2 2 3.1-3.1a5 5 0 0 1-6.4 6.4L7 21z"/>'},"staff"):"")};
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
async function requireSignIn(){
 const token=sessionStorage.getItem("tc_social_access_token");
 if(token){
  try{
   const response=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+token,accept:"application/json"}});
   const user=await response.json().catch(()=>null);
   if(response.ok&&user?.sub&&user?.preferred_username){sessionStorage.setItem("tc_social_user",JSON.stringify(user));await updateSignInState(user);return true}
  }catch{}
  sessionStorage.removeItem("tc_social_access_token");
  sessionStorage.removeItem("tc_social_user");
 }
 await updateSignInState(null);
 document.querySelector("#auth-modal").hidden=false;
 return false;
}
async function restoreSignIn(){const token=sessionStorage.getItem("tc_social_access_token");if(!token)return;try{const response=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+token,accept:"application/json"}});if(!response.ok)throw new Error("expired");const user=await response.json();sessionStorage.setItem("tc_social_user",JSON.stringify(user));updateSignInState(user)}catch{sessionStorage.removeItem("tc_social_access_token");sessionStorage.removeItem("tc_social_user");updateSignInState(null)}}
function showToast(message){const toast=document.querySelector("#toast");if(!toast)return;toast.textContent=message;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2600)}
function showAuthError(message){const modal=document.querySelector("#auth-modal");modal.hidden=false;const description=modal.querySelector("p");if(description)description.textContent=message}
async function completeSignIn(){const params=new URLSearchParams(location.search),code=params.get("code"),state=params.get("state"),expected=sessionStorage.getItem("tc_social_oauth_state"),verifier=sessionStorage.getItem("tc_social_oauth_verifier");if(params.has("error"))throw new Error(params.get("error")==="access_denied"?"You cancelled TC Social sign-in.":"TC Accounts could not authorize this sign-in.");if(!code||!state||!expected||state!==expected||!verifier)throw new Error("The sign-in response could not be verified. Please try again.");const config=await api("/api/auth/config");if(!config.client_id)throw new Error("TC Social's OAuth client ID has not been configured yet.");const response=await fetch("https://accounts.theegget.com/oauth/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},body:new URLSearchParams({grant_type:"authorization_code",code,client_id:config.client_id,redirect_uri:OAUTH_REDIRECT_URI,code_verifier:verifier})});const data=await response.json().catch(()=>({}));if(!response.ok||!data.access_token)throw new Error(data.error_description||data.error||"TC Accounts could not complete sign-in.");sessionStorage.setItem("tc_social_access_token",data.access_token);const userResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+data.access_token,accept:"application/json"}});const user=await userResponse.json().catch(()=>({}));if(!userResponse.ok||!user.sub)throw new Error("TC Accounts issued a token but could not confirm the account identity.");sessionStorage.setItem("tc_social_user",JSON.stringify(user));updateSignInState(user);sessionStorage.removeItem("tc_social_oauth_state");sessionStorage.removeItem("tc_social_oauth_verifier");history.replaceState({},"","/");location.assign("/")}

function renderPost(post){
 const name=post.display_name||"@"+post.username;
 const mediaUrl=safeMediaUrl(post.media_url);
 const media=mediaUrl?(/\.(mp4|webm|ogg)(?:$|\?)/i.test(mediaUrl)?'<video class="post-media" controls preload="metadata" src="'+escapeHtml(mediaUrl)+'"></video>':'<img class="post-media" loading="lazy" src="'+escapeHtml(mediaUrl)+'" alt="Post media">'):"";
 return '<article class="post" data-post-id="'+escapeHtml(post.id)+'"><div class="post-head">'+avatar(post.profile_picture,name)+'<div class="post-author"><a href="/@'+encodeURIComponent(post.username)+'">'+escapeHtml(name)+verifiedMark(post.verified,post.verification_type,post.is_tc_staff)+'</a><small>@'+escapeHtml(post.username)+' · '+escapeHtml(time(post.created_at))+'</small></div></div>'+(post.content?'<p class="post-content">'+escapeHtml(post.content)+'</p>':"")+media+'<div class="post-actions"><button class="post-action" data-react aria-pressed="false">Like <span data-reaction-count>'+Number(post.reaction_count||0)+'</span></button><button class="post-action" data-comments-toggle aria-expanded="false">Comments <span data-comment-count>'+Number(post.comment_count||0)+'</span></button></div><section class="comments-panel" data-comments-panel hidden><div class="comments-list" data-comments-list></div><form class="comment-form"><textarea name="content" maxlength="1000" rows="2" placeholder="Write a comment…" required></textarea><div><span>1,000 characters max</span><button class="post-action" type="submit">Comment</button></div><p class="comment-error" role="alert"></p></form></section></article>';
}
async function loadPostReactionStates(root){
 const token=sessionStorage.getItem("tc_social_access_token");
 const posts=[...root.querySelectorAll("[data-post-id]")];
 await Promise.all(posts.map(async post=>{
  try{
   const response=await fetch("/api/posts/"+post.dataset.postId+"/reactions",{headers:{accept:"application/json",...(token?{authorization:"Bearer "+token}:{})}});
   if(!response.ok)return;
   const data=await response.json(),button=post.querySelector("[data-react]");
   if(!button)return;
   button.setAttribute("aria-pressed",String(data.reacted));
   button.querySelector("[data-reaction-count]").textContent=data.count;
   button.classList.toggle("is-active",data.reacted);
  }catch{}
 }));
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
async function loadRecommendations(){
 const aside=document.querySelector("#recommendations");
 if(!aside)return;
 try{
  const data=await api("/api/recommendations");
  const items=data.recommendations||[];
  aside.innerHTML='<div class="recommendation-heading"><span class="eyebrow">DISCOVER</span><h3>Recommended</h3></div>'+(items.length?'<div class="recommendation-list">'+items.map(item=>'<a class="recommendation-item" href="/@'+encodeURIComponent(item.username)+'">'+avatar(item.profile_picture,item.display_name||item.username)+'<span class="recommendation-info"><strong>'+escapeHtml(item.display_name||item.username)+verifiedMark(item.verified,item.verification_type,item.is_tc_staff)+'</strong><small>@'+escapeHtml(item.username)+' · '+Number(item.follower_count||0).toLocaleString()+' followers</small></span></a>').join("")+'</div>':'<p class="recommendation-empty">No profiles to recommend yet.</p>');
 }catch{aside.innerHTML='<div class="recommendation-heading"><span class="eyebrow">DISCOVER</span><h3>Recommended</h3></div><p class="recommendation-empty">Recommendations are temporarily unavailable.</p>'}
}
async function loadHome(){
 pageTitle.textContent="Home";
 const aside=document.querySelector("#recommendations");if(aside)aside.hidden=false;
 try{
  const data=await api("/api/feed"),posts=data.posts||[],signedIn=Boolean(sessionStorage.getItem("tc_social_access_token"));
  let composer="";
  if(signedIn){
   let identities=[];try{identities=(await api("/api/identities")).identities||[]}catch{}
   const options=identities.map(item=>'<option value="'+escapeHtml(item.id)+'">'+escapeHtml(item.display_name+' (@'+item.username+')')+'</option>').join("");
   composer='<button class="compose-toggle" id="compose-toggle" type="button" aria-expanded="false" aria-controls="post-composer">+ Post</button><form id="post-composer" class="post-composer" hidden><label for="post-identity">Post as</label><select id="post-identity" name="identity_id">'+options+'</select><label for="post-content">Create a post</label><textarea id="post-content" name="content" maxlength="2000" rows="3" placeholder="What would you like to share?" required></textarea><div class="composer-footer"><span id="post-character-count">0 / 2,000</span><button class="publish-post" type="submit">Post</button></div><p class="composer-error" id="post-composer-error" role="alert"></p></form>';
  }
  const empty=posts.length?"":!signedIn?'<section class="empty-card"><strong>Your feed starts with the people you follow.</strong><p>Sign in and follow profiles or managed pages to see their posts here. Use Search to find public profiles.</p></section>':'<section class="empty-card"><strong>Your feed is quiet.</strong><p>Posts from people and pages you follow will appear here. Use Search to find public profiles.</p></section>';
  feed.innerHTML=composer+(posts.length?posts.map(renderPost).join(""):empty);
  loadPostReactionStates(feed);loadRecommendations();
 }catch(error){renderRequestError(error)}
}

async function loadSearch(query=""){
 pageTitle.textContent="Search";
 const term=String(query||"").trim();
 feed.innerHTML='<form id="profile-search-form" class="search-form"><input name="q" type="search" maxlength="48" minlength="2" value="'+escapeHtml(term)+'" placeholder="Search profiles and pages" aria-label="Search profiles and pages" required><button class="post-action" type="submit">Search</button></form><div id="search-results" class="search-results">'+(term?'<div class="loading"><span class="spinner"></span></div>':'<section class="empty-card"><strong>Find profiles and pages.</strong><p>Search by name or handle. Private profiles are not listed.</p></section>')+'</div>';
 const aside=document.querySelector("#recommendations");if(aside)aside.hidden=true;
 if(term)await runProfileSearch(term);
}
async function runProfileSearch(term){
 const target=document.querySelector("#search-results");if(!target)return;
 target.innerHTML='<div class="loading"><span class="spinner"></span><p>Searching…</p></div>';
 try{
  const data=await api("/api/search?q="+encodeURIComponent(term)),results=data.results||[];
  target.innerHTML=results.length?'<div class="search-result-list">'+results.map(item=>'<a class="search-result" href="/@'+encodeURIComponent(item.username)+'">'+avatar(item.profile_picture,item.display_name||item.username)+'<span class="search-result-info"><strong>'+escapeHtml(item.display_name||item.username)+verifiedMark(item.verified,item.verification_type,item.is_tc_staff)+'</strong><small>@'+escapeHtml(item.username)+' · '+(item.type==="page"?"Page":"Profile")+' · '+Number(item.follower_count||0).toLocaleString()+' followers</small></span></a>').join("")+'</div>':'<section class="empty-card"><strong>No public results.</strong><p>Try another name or handle.</p></section>';
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
async function resizeBannerImage(file){
 if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Choose a PNG, JPEG, or WebP banner.");
 if(file.size>16*1024*1024)throw new Error("Choose a banner smaller than 16 MB.");
 const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/bitmap.width,700/bitmap.height);
 const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 let blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",.82));
 if(!blob||blob.size>400000)blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.65));
 if(!blob||blob.size>400000)throw new Error("This banner is too large after resizing. Choose another image.");
 return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Could not read the banner image."));reader.readAsDataURL(blob)});
}
function openProfileEditor(profile){
 closeProfileEditor();
 const isPage=Boolean(profile.is_page);
 const modal=document.createElement("div");
 modal.id="profile-editor-modal";
 modal.className="modal";
 modal.innerHTML='<div class="modal-backdrop" data-editor-close></div><section class="modal-card profile-editor-card" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title"><button class="modal-close" type="button" data-editor-close aria-label="Close">×</button><span class="eyebrow">'+(isPage?'PAGE SETTINGS':'PROFILE SETTINGS')+'</span><h2 id="profile-editor-title">'+(isPage?'Edit subaccount':'Edit Profile')+'</h2><form id="profile-editor-form" data-page-id="'+(isPage?escapeHtml(profile.id):'')+'">'+(isPage?'<label for="edit-handle">Handle</label><input id="edit-handle" name="handle" maxlength="24" minlength="2" pattern="[A-Za-z0-9_]{2,24}" required>':'')+'<label for="edit-display-name">Display name</label><input id="edit-display-name" name="display_name" maxlength="80" required placeholder="Display name">'+(isPage?'':'<label for="edit-bio">Bio</label><textarea id="edit-bio" name="bio" maxlength="500" rows="4" placeholder="Tell people about yourself"></textarea><label>Social links</label><p class="editor-hint">Add the full URL to each profile. Leave fields empty to hide them.</p><label for="edit-youtube">YouTube</label><input id="edit-youtube" name="social_youtube" type="url" maxlength="500" placeholder="https://youtube.com/@username"><label for="edit-youtube-label">YouTube button label</label><input id="edit-youtube-label" name="social_youtube_label" maxlength="40" placeholder="e.g. My YouTube"><label for="edit-instagram">Instagram</label><input id="edit-instagram" name="social_instagram" type="url" maxlength="500" placeholder="https://instagram.com/username"><label for="edit-instagram-label">Instagram button label</label><input id="edit-instagram-label" name="social_instagram_label" maxlength="40" placeholder="e.g. My Instagram"><label for="edit-tiktok">TikTok</label><input id="edit-tiktok" name="social_tiktok" type="url" maxlength="500" placeholder="https://tiktok.com/@username"><label for="edit-tiktok-label">TikTok button label</label><input id="edit-tiktok-label" name="social_tiktok_label" maxlength="40" placeholder="e.g. My TikTok"><label for="edit-spotify">Spotify</label><input id="edit-spotify" name="social_spotify" type="url" maxlength="500" placeholder="https://open.spotify.com/user/..."><label for="edit-spotify-label">Spotify button label</label><input id="edit-spotify-label" name="social_spotify_label" maxlength="40" placeholder="e.g. My Spotify"><label for="edit-twitch">Twitch</label><input id="edit-twitch" name="social_twitch" type="url" maxlength="500" placeholder="https://twitch.tv/username"><label for="edit-twitch-label">Twitch button label</label><input id="edit-twitch-label" name="social_twitch_label" maxlength="40" placeholder="e.g. My Twitch"><label for="edit-x">X</label><input id="edit-x" name="social_x" type="url" maxlength="500" placeholder="https://x.com/username"><label for="edit-x-label">X button label</label><input id="edit-x-label" name="social_x_label" maxlength="40" placeholder="e.g. Follow me on X"><label for="edit-website">Website</label><input id="edit-website" name="social_website" type="url" maxlength="500" placeholder="https://example.com"><label for="edit-website-label">Website button label</label><input id="edit-website-label" name="social_website_label" maxlength="40" placeholder="e.g. My Website">')+(isPage?'':'<label class="privacy-toggle"><input type="checkbox" name="is_private"> Private profile <span>Your profile and posts are visible only to you and your followers.</span></label>')+'<label for="edit-banner-image">Profile banner</label><input id="edit-banner-image" name="banner_image_file" type="file" accept="image/png,image/jpeg,image/webp"><div class="banner-editor-preview" id="banner-editor-preview"></div><button type="button" class="post-action" id="remove-banner-image">Remove banner</button><p class="editor-hint">The full image remains visible on desktop, tablet, and mobile.</p><label for="edit-profile-picture">Profile photo</label><input id="edit-profile-picture" name="profile_picture_file" type="file" accept="image/png,image/jpeg,image/webp"><div class="profile-photo-preview" id="profile-photo-preview"></div><button type="button" class="post-action" id="remove-profile-picture">Remove photo</button><p class="editor-hint">Choose a PNG, JPEG, or WebP image. It will be resized before upload.</p><p class="editor-error" id="profile-editor-error" role="alert"></p><div class="editor-actions"><button type="button" class="post-action" data-editor-close>Cancel</button><button type="submit" class="editor-save">Save changes</button></div></form></section>';
 document.body.append(modal);
 modal.querySelector('[name="display_name"]').value=profile.display_name||"";
 if(isPage)modal.querySelector('[name="handle"]').value=profile.username||"";
 else{modal.querySelector('[name="bio"]').value=profile.bio||"";modal.querySelector('[name="is_private"]').checked=profile.is_private!==false;const links=profile.social_links||{};for(const key of ["youtube","instagram","tiktok","spotify","twitch","x","website"]){const item=links[key];modal.querySelector('[name="social_'+key+'"]').value=typeof item==="string"?item:(item?.url||"");modal.querySelector('[name="social_'+key+'_label"]').value=typeof item==="object"?(item?.label||""):"";}}
 modal.querySelector("#profile-photo-preview").innerHTML=avatar(profile.profile_picture,profile.display_name||profile.username);
 if(profile.banner_image)modal.querySelector("#banner-editor-preview").innerHTML='<img src="'+escapeHtml(safeMediaUrl(profile.banner_image))+'" alt="Current banner preview">';
 modal.querySelector('[name="display_name"]').focus();
}
async function saveProfileEditor(form){
 const token=sessionStorage.getItem("tc_social_access_token");
 const errorBox=document.querySelector("#profile-editor-error");
 const submit=form.querySelector('[type="submit"]');
 submit.disabled=true;submit.textContent="Saving…";errorBox.textContent="";
 try{
  const isPage=Boolean(form.dataset.pageId);
  const values={display_name:form.elements.display_name.value};
  if(isPage){values.handle=form.elements.handle.value.trim();if(values.handle.length<3&&values.handle.toLowerCase()!=="tc")throw new Error("Handles must be at least 3 characters, except the reserved @TC handle.");}
  else{values.bio=form.elements.bio.value;values.is_private=form.elements.is_private.checked;values.social_links={};for(const key of ["youtube","instagram","tiktok","spotify","twitch","x","website"]){const value=form.elements["social_"+key].value.trim();const label=form.elements["social_"+key+"_label"].value.trim();if(value)values.social_links[key]={url:value,label:label||"My "+key[0].toUpperCase()+key.slice(1)};}}
  const file=form.elements.profile_picture_file.files[0];
  if(file)values.profile_picture=await resizeProfilePhoto(file);
  const bannerFile=form.elements.banner_image_file.files[0];if(bannerFile)values.banner_image=await resizeBannerImage(bannerFile);
  if(form.dataset.removeBanner==="true")values.banner_image="";
  if(form.dataset.removePhoto==="true")values.profile_picture="";
  const currentProfileName=decodeURIComponent(location.pathname.split("/")[1].replace(/^@/,""));
  const endpoint=isPage?"/api/pages/"+encodeURIComponent(form.dataset.pageId):"/api/profile/"+encodeURIComponent(currentProfileName);
  const response=await fetch(endpoint,{method:"PATCH",headers:{"content-type":"application/json","accept":"application/json",authorization:"Bearer "+token},credentials:"same-origin",body:JSON.stringify(values)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const messages={image_too_large:"The resized photo must be 400 KB or smaller.",invalid_image:"Choose a PNG, JPEG, or WebP photo.",unauthorized:"Your TC sign-in has expired. Please sign in again.",display_name_too_long:"Display name must be 80 characters or fewer.",bio_too_long:"Bio must be 500 characters or fewer.",invalid_profile_picture_url:"Profile picture must be a valid HTTPS URL."};throw new Error(messages[data.error]||data.message||"Your profile could not be saved. Please try again.");}
  closeProfileEditor();
  showToast(isPage?"Subaccount updated.":"Profile updated.");
  history.replaceState({}, "", "/@"+encodeURIComponent(data.profile.username));
  loadProfile(data.profile.username);
  const user=JSON.parse(sessionStorage.getItem("tc_social_user")||"null");
  if(!isPage&&user&&String(user.preferred_username||"").toLowerCase()===String(data.profile.username).toLowerCase()){
   user.picture=data.profile.profile_picture||"";
   user.display_name=data.profile.display_name||user.display_name;
   sessionStorage.setItem("tc_social_user",JSON.stringify(user));
   updateSignInState(user);
  }
 }catch(error){errorBox.textContent=error.message;submit.disabled=false;submit.textContent="Save changes"}
}

async function loadProfile(username){
 pageTitle.textContent="Profile";
 try{
  const data=await api("/api/profile/"+encodeURIComponent(username));
  const p=data.profile;
  const name=p.display_name||"@"+p.username;
  const canEdit=Boolean(p.can_manage||p.can_edit)||(!p.is_page&&String(JSON.parse(sessionStorage.getItem("tc_social_user")||"null")?.preferred_username||"").toLowerCase()===String(p.username).toLowerCase());
  const signedInUser=JSON.parse(sessionStorage.getItem("tc_social_user")||"null");
  const isOwnProfile=!p.is_page&&String(signedInUser?.preferred_username||"").toLowerCase()===String(p.username).toLowerCase();
  const followButton=p.is_page||!isOwnProfile?'<button class="post-action" data-follow="'+escapeHtml(p.username)+'" aria-pressed="false">Follow</button>':"";
  feed.innerHTML='<section class="profile-card">'+(p.banner_image?'<div class="profile-banner"><img src="'+escapeHtml(safeMediaUrl(p.banner_image))+'" alt="'+escapeHtml(name)+' banner"></div>':"")+'<div class="profile-top">'+avatar(p.profile_picture,name)+'<div><h1 class="profile-name">'+escapeHtml(name)+verifiedMark(p.verified,p.verification_type,p.is_tc_staff)+'</h1><span class="handle">@'+escapeHtml(p.username)+'</span><span class="follower-count" data-follower-count>'+Number(p.follower_count||0).toLocaleString()+' followers</span></div>'+(canEdit?'<button class="post-action profile-edit-button" data-edit-profile>Edit</button>':"")+followButton+(p.can_verify?'<button class="post-action" data-verify-type="'+(p.is_page?"page":"user")+'" data-verify-name="'+escapeHtml(p.username)+'" data-verified="'+String(Boolean(p.verified))+'" data-staff="'+String(Boolean(p.is_tc_staff))+'">'+(p.verified?"Remove verification":"Verify")+'</button>':"")+'</div>'+(p.bio?'<p class="bio">'+escapeHtml(p.bio)+'</p>':"")+(p.social_links&&Object.keys(p.social_links).length?'<nav class="profile-social-links" aria-label="Social profiles">'+Object.entries(p.social_links).map(([key,item])=>{const url=typeof item==="string"?item:item?.url;const label=typeof item==="object"&&item?.label?item.label:"My "+(({youtube:"YouTube",instagram:"Instagram",tiktok:"TikTok",spotify:"Spotify",twitch:"Twitch",x:"X",website:"Website"})[key]||key);return url?'<a href="'+escapeHtml(safeMediaUrl(url))+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(label)+'</a>':""}).join("")+'</nav>':"")+'</section><div class="section-heading" style="margin-top:25px"><div><span class="eyebrow">PROFILE POSTS</span><h2>Posts</h2></div></div><div id="profile-posts" class="feed"><div class="loading"><span class="spinner"></span></div></div>';
  if(followButton&&sessionStorage.getItem("tc_social_access_token")){
   try{const status=await api("/api/follow/"+encodeURIComponent(p.username));const follow=feed.querySelector("[data-follow]");if(follow){follow.textContent=status.following?"Following":"Follow";follow.setAttribute("aria-pressed",String(status.following));}}catch{}
  }
  const posts=await api("/api/profile/"+encodeURIComponent(username)+"/posts");
  const target=document.querySelector("#profile-posts");
  target.innerHTML=posts.posts?.length?posts.posts.map(renderPost).join(""):'<section class="empty-card">This profile has not posted yet.</section>';
  loadPostReactionStates(target);
 }catch(error){renderRequestError(error)}
}
document.addEventListener("click",async event=>{
 const verify=event.target.closest("[data-verify-type]");
 if(verify){
  if(!await requireSignIn())return;
  verify.disabled=true;
  try{
   const current=verify.dataset.verified==="true";
   const selected=await new Promise(resolve=>{
    const dialog=document.createElement("div");
    dialog.id="verification-dialog";
    dialog.innerHTML='<style>#verification-dialog{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.68);backdrop-filter:blur(5px)}#verification-dialog .verification-panel{width:min(100%,440px);padding:24px;background:var(--card,#171717);color:var(--text,#fff);border:1px solid var(--border,#333);border-radius:18px;box-shadow:0 24px 80px #0008}#verification-dialog h2{margin:0 0 7px;font-size:21px}#verification-dialog p{margin:0 0 18px;color:var(--muted,#aaa);font-size:14px}#verification-dialog .verification-options{display:grid;gap:9px}#verification-dialog button{font:inherit;cursor:pointer}#verification-dialog .verification-choice{display:flex;align-items:center;gap:12px;width:100%;padding:13px 14px;text-align:left;color:inherit;background:var(--surface,#222);border:1px solid var(--border,#383838);border-radius:11px}#verification-dialog .verification-choice:hover{border-color:var(--accent,#888);background:var(--surface-hover,#292929)}#verification-dialog .verification-symbol{width:28px;text-align:center;font-size:19px}#verification-dialog .verification-choice strong{display:block;font-size:14px}#verification-dialog .verification-choice small{display:block;margin-top:3px;color:var(--muted,#aaa);font-size:12px}#verification-dialog .verification-danger{color:#ff7777}#verification-dialog .verification-footer{display:flex;justify-content:flex-end;margin-top:16px}#verification-dialog .verification-cancel{padding:9px 15px;color:inherit;background:transparent;border:1px solid var(--border,#444);border-radius:9px}</style><section class="verification-panel" role="dialog" aria-modal="true" aria-labelledby="verification-title"><h2 id="verification-title">Manage verification</h2><p>Choose a badge action for this profile. Verified and staff badges can be shown together.</p><div class="verification-options"><button class="verification-choice" data-choice="1"><span class="verification-symbol">✓</span><span><strong>Verified account</strong><small>Personal account verification</small></span></button><button class="verification-choice" data-choice="2"><span class="verification-symbol">💼</span><span><strong>Verified business</strong><small>Business verification</small></span></button><button class="verification-choice" data-choice="3"><span class="verification-symbol"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-5.5-7.6M16 3.1a5 5 0 0 1 0 9.8"/></svg></span><span><strong>Verified group</strong><small>Group or community verification</small></span></button><button class="verification-choice" data-choice="4"><span class="verification-symbol"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M9 13v2M15 13v2"/></svg></span><span><strong>AI account</strong><small>Verification for an AI identity or assistant</small></span></button><button class="verification-choice" data-choice="6"><span class="verification-symbol">🛠️</span><span><strong>'+(verify.dataset.staff==="true"?"Remove TC staff status":"Mark as TC staff")+'</strong><small>Toggle the TC staff badge independently</small></span></button><button class="verification-choice verification-danger" data-choice="7"><span class="verification-symbol">×</span><span><strong>Remove verification</strong><small>Remove the verified badge only</small></span></button></div><div class="verification-footer"><button class="verification-cancel" data-choice="cancel">Cancel</button></div></section>';
    const finish=value=>{dialog.remove();resolve(value)};
    dialog.addEventListener("click",event=>{if(event.target===dialog){finish(null);return}const choice=event.target.closest("[data-choice]");if(choice)finish(choice.dataset.choice==="cancel"?null:choice.dataset.choice)});
    const keyHandler=event=>{if(event.key==="Escape"){document.removeEventListener("keydown",keyHandler);finish(null)}};
    document.addEventListener("keydown",keyHandler);
    dialog.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>document.removeEventListener("keydown",keyHandler),{once:true}));
    document.body.appendChild(dialog);
    dialog.querySelector('[data-choice="1"]').focus();
   });
   if(selected===null){verify.disabled=false;return}
   const types={"1":"account","2":"business","3":"group","4":"ai"};
   const verificationType=types[selected];
   const staffAction=selected==="6";
   const remove=selected==="7";
   if(!verificationType&&!staffAction&&!remove)throw new Error("Invalid verification action.");
   const response=await fetch("/api/verification",{method:"POST",headers:{"content-type":"application/json","accept":"application/json",authorization:"Bearer "+sessionStorage.getItem("tc_social_access_token")},body:JSON.stringify({type:verify.dataset.verifyType,username:verify.dataset.verifyName,verified:remove?false:!staffAction,verification_type:verificationType||"account",staff:staffAction?verify.dataset.staff!=="true":undefined})});
   const data=await response.json();if(!response.ok)throw new Error(data.message||"Could not update verification.");
   showToast(staffAction?"TC staff status updated.":remove?"Verification removed.":"Verification updated.");loadProfile(verify.dataset.verifyName);
  }catch(error){showToast(error.message);verify.disabled=false}
  return;
 }
 if(event.target.id==="remove-banner-image"){const form=event.target.form;if(form){form.dataset.removeBanner="true";form.elements.banner_image_file.value="";document.querySelector("#banner-editor-preview").innerHTML="";}return}
 const accountToggle=event.target.closest("[data-tc-header-account][aria-expanded]");
 if(accountToggle){event.preventDefault();const dropdown=document.querySelector("[data-account-dropdown]");const opening=dropdown.hidden;dropdown.hidden=!opening;accountToggle.setAttribute("aria-expanded",String(opening));return}
 const logout=event.target.closest("[data-account-logout]");
 if(logout){sessionStorage.removeItem("tc_social_access_token");sessionStorage.removeItem("tc_social_user");sessionStorage.removeItem("tc_social_oauth_state");sessionStorage.removeItem("tc_social_oauth_verifier");location.assign("/");return}
 const editProfile=event.target.closest("[data-edit-profile]");
 if(editProfile){try{const username=decodeURIComponent(location.pathname.split("/")[1].replace(/^@/,""));const profile=await api("/api/profile/"+encodeURIComponent(username));openProfileEditor(profile.profile)}catch(error){showToast("Could not load your profile settings.")}return}
 if(!event.target.closest(".account-menu-wrap")){const dropdown=document.querySelector("[data-account-dropdown]");const toggle=document.querySelector("[data-tc-header-account][aria-expanded]");if(dropdown)dropdown.hidden=true;if(toggle)toggle.setAttribute("aria-expanded","false")}
 const signIn=event.target.closest("[data-tc-signin]");
 if(signIn){event.preventDefault();beginSignIn();return}
 const follow=event.target.closest("[data-follow]");
 if(follow){
  if(!await requireSignIn())return;
  const username=follow.dataset.follow;
  const wasFollowing=follow.getAttribute("aria-pressed")==="true";
  follow.disabled=true;
  try{
   const response=await fetch("/api/follow/"+encodeURIComponent(username),{method:wasFollowing?"DELETE":"POST",headers:{accept:"application/json",authorization:"Bearer "+sessionStorage.getItem("tc_social_access_token")},credentials:"same-origin"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.message||"Could not update follow status.");
   follow.textContent=data.following?"Following":"Follow";
   follow.setAttribute("aria-pressed",String(data.following));
   const followerCount=document.querySelector("[data-follower-count]");if(followerCount){const match=followerCount.textContent.match(/[0-9,]+/);const current=Number(match?match[0].replace(/,/g,""):0);followerCount.textContent=Math.max(0,current+(data.following?1:-1)).toLocaleString()+" followers"}
   showToast(data.following?"You are now following @"+username+".":"You unfollowed @"+username+".");
  }catch(error){showToast(error.message)}
  finally{follow.disabled=false}
  return;
 }
 const react=event.target.closest("[data-react]");
 if(react){
  if(!await requireSignIn())return;
  const post=react.closest("[data-post-id]"),was=react.getAttribute("aria-pressed")==="true";
  react.disabled=true;
  try{
   const response=await fetch("/api/posts/"+post.dataset.postId+"/reactions",{method:was?"DELETE":"POST",headers:{accept:"application/json",authorization:"Bearer "+sessionStorage.getItem("tc_social_access_token")}});
   const data=await response.json();if(!response.ok)throw new Error(data.message||"Could not update reaction.");
   react.setAttribute("aria-pressed",String(data.reacted));react.querySelector("[data-reaction-count]").textContent=data.count;react.classList.toggle("is-active",data.reacted);
  }catch(error){showToast(error.message)}finally{react.disabled=false}
  return;
 }
 const commentsToggle=event.target.closest("[data-comments-toggle]");
 if(commentsToggle){
  const post=commentsToggle.closest("[data-post-id]"),panel=post.querySelector("[data-comments-panel]"),opening=panel.hidden;
  panel.hidden=!opening;commentsToggle.setAttribute("aria-expanded",String(opening));
  if(opening&&!panel.dataset.loaded){
   try{
    const response=await fetch("/api/posts/"+post.dataset.postId+"/comments");const data=await response.json();if(!response.ok)throw new Error("Could not load comments.");
    panel.querySelector("[data-comments-list]").innerHTML=data.comments?.length?data.comments.map(comment=>'<div class="comment"><strong>'+escapeHtml(comment.display_name||comment.username)+verifiedMark(comment.verified,comment.verification_type,comment.is_tc_staff)+'</strong><small>@'+escapeHtml(comment.username)+' · '+escapeHtml(time(comment.created_at))+'</small><p>'+escapeHtml(comment.content)+'</p></div>').join(""):'<p class="no-comments">No comments yet.</p>';
    panel.dataset.loaded="true";
   }catch(error){panel.querySelector("[data-comments-list]").textContent=error.message}
  }
  return;
 }
 if(event.target.closest("[data-close-auth]"))document.querySelector("#auth-modal").hidden=true;
 if(event.target.closest("[data-editor-close]"))closeProfileEditor();
 if(event.target.closest("#remove-profile-picture")){const form=document.querySelector("#profile-editor-form");form.dataset.removePhoto="true";form.elements.profile_picture_file.value="";document.querySelector("#profile-photo-preview").innerHTML=avatar("",form.elements.display_name.value||"TC");}
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
 if(!await requireSignIn())return;
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
document.addEventListener("submit",async event=>{
 if(event.target.id==="profile-search-form"){event.preventDefault();const query=event.target.elements.q.value.trim();history.replaceState({},"","/search?q="+encodeURIComponent(query));runProfileSearch(query);return}
 const form=event.target.closest(".comment-form");
 if(!form)return;
 event.preventDefault();
 if(!await requireSignIn())return;
 const post=form.closest("[data-post-id]"),button=form.querySelector("button[type=submit]"),error=form.querySelector(".comment-error"),content=form.elements.content.value.trim();
 if(!content){error.textContent="Write a comment first.";return}
 button.disabled=true;error.textContent="";
 try{
  const response=await fetch("/api/posts/"+post.dataset.postId+"/comments",{method:"POST",headers:{"content-type":"application/json","accept":"application/json",authorization:"Bearer "+sessionStorage.getItem("tc_social_access_token")},body:JSON.stringify({content})});
  const data=await response.json();if(!response.ok)throw new Error(data.message||"Could not publish comment.");
  const comment=data.comment,list=post.querySelector("[data-comments-list]"),empty=list.querySelector(".no-comments");if(empty)empty.remove();
  list.insertAdjacentHTML("beforeend",'<div class="comment"><strong>'+escapeHtml(comment.display_name||comment.username)+verifiedMark(comment.verified,comment.verification_type,comment.is_tc_staff)+'</strong><small>@'+escapeHtml(comment.username)+' · '+escapeHtml(time(comment.created_at))+'</small><p>'+escapeHtml(comment.content)+'</p></div>');
  const count=post.querySelector("[data-comment-count]");count.textContent=Number(count.textContent||0)+1;form.reset();post.querySelector("[data-comments-panel]").dataset.loaded="true";
 }catch(error){form.querySelector(".comment-error").textContent=error.message}finally{button.disabled=false}
});
document.addEventListener("input",event=>{if(event.target.id==="post-content"){const count=document.querySelector("#post-character-count");if(count)count.textContent=event.target.value.length.toLocaleString()+" / 2,000"}});
document.addEventListener("submit",async event=>{if(event.target.id==="profile-editor-form"){event.preventDefault();if(await requireSignIn())saveProfileEditor(event.target)}});
document.addEventListener("change",event=>{if(event.target.name==="profile_picture_file"){const form=event.target.form;if(form)form.dataset.removePhoto="false";const file=event.target.files?.[0];if(file){const preview=document.querySelector("#profile-photo-preview");if(preview)preview.textContent=file.name}}});
document.addEventListener("keydown",event=>{if(event.key==="Escape"){document.querySelector("#auth-modal").hidden=true;closeProfileEditor()}});
if(location.pathname==="/auth/callback"){completeSignIn().catch(error=>{history.replaceState({},"","/");showAuthError(error.message)})}
else{let decodedPath=location.pathname;try{decodedPath=decodeURIComponent(decodedPath)}catch{}const match=decodedPath.match(/^\/@([^/]+)\/?$/);if(match){const recommendations=document.querySelector("#recommendations");if(recommendations)recommendations.hidden=true;restoreSignIn().then(()=>loadProfile(match[1]))}else if(decodedPath==="/search"){restoreSignIn().finally(()=>loadSearch(new URLSearchParams(location.search).get("q")||""))}else if(decodedPath==="/explore"){location.replace("/search")}else{restoreSignIn().finally(()=>loadHome())}}
