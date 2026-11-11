const feed=document.querySelector("#feed");
const pageTitle=document.querySelector("#page-title");
document.querySelector("#year").textContent=new Date().getFullYear();
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const initials=value=>String(value||"TC").trim().slice(0,1).toUpperCase();
const safeMediaUrl=value=>{try{const url=new URL(value,location.origin);return ["https:","http:"].includes(url.protocol)?url.href:""}catch{return ""}};
const avatar=(url,name)=>{const safe=safeMediaUrl(url);return safe?'<img class="avatar" src="'+escapeHtml(safe)+'" alt="">':'<span class="avatar">'+escapeHtml(initials(name))+'</span>'};
const time=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?"":date.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})};
async function api(path){const token=sessionStorage.getItem("tc_social_access_token");const response=await fetch(path,{headers:{accept:"application/json",...(token?{authorization:"Bearer "+token}:{})},credentials:"same-origin"});const data=await response.json().catch(()=>({}));if(!response.ok){const error=new Error("Request failed");error.status=response.status;error.code=data.error;error.confidence=data.confidence;throw error}return data}

const OAUTH_REDIRECT_URI=location.origin+"/auth/callback";
const bytesToBase64Url=bytes=>{let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/g,"")};
async function sha256(value){return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))))}
function randomToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return bytesToBase64Url(bytes)}
async function beginSignIn(){try{const config=await api("/api/auth/config");if(!config.client_id)throw new Error("TC Social's OAuth client ID has not been configured yet.");const state=randomToken(),verifier=randomToken(),challenge=await sha256(verifier);sessionStorage.setItem("tc_social_oauth_state",state);sessionStorage.setItem("tc_social_oauth_verifier",verifier);const authorize=new URL("https://accounts.theegget.com/oauth/authorize");for(const [key,value] of Object.entries({client_id:config.client_id,redirect_uri:OAUTH_REDIRECT_URI,response_type:"code",scope:"profile",state,code_challenge:challenge,code_challenge_method:"S256"}))authorize.searchParams.set(key,value);location.assign(authorize.toString())}catch(error){showAuthError(error.message)}}
function updateSignInState(user){document.querySelectorAll("[data-tc-signin]").forEach(link=>{link.textContent=user?"Signed in as @"+user.preferred_username:"Sign in with TC";link.setAttribute("aria-label",user?"Signed in as @"+user.preferred_username:"Sign in with TC")})}
async function restoreSignIn(){const token=sessionStorage.getItem("tc_social_access_token");if(!token)return;try{const response=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+token,accept:"application/json"}});if(!response.ok)throw new Error("expired");const user=await response.json();sessionStorage.setItem("tc_social_user",JSON.stringify(user));updateSignInState(user)}catch{sessionStorage.removeItem("tc_social_access_token");sessionStorage.removeItem("tc_social_user");updateSignInState(null)}}
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
  feed.innerHTML=posts.length?posts.map(renderPost).join(""):'<section class="empty-card"><strong>Nothing here yet.</strong><p>Posts will appear here as the TC Social community grows.</p></section>';
 }catch(error){renderRequestError(error)}
}
async function loadProfile(username){
 pageTitle.textContent="Creator";
 try{
  const data=await api("/api/profile/"+encodeURIComponent(username));
  const p=data.profile;
  const name=p.display_name||"@"+p.username;
  feed.innerHTML='<section class="profile-card"><div class="profile-top">'+avatar(p.profile_picture,name)+'<div><h1 class="profile-name">'+escapeHtml(name)+'</h1><span class="handle">@'+escapeHtml(p.username)+'</span></div><button class="post-action" data-auth-action="follow">Follow</button></div>'+(p.bio?'<p class="bio">'+escapeHtml(p.bio)+'</p>':"")+'</section><div class="section-heading" style="margin-top:25px"><div><span class="eyebrow">CREATOR POSTS</span><h2>Posts</h2></div></div><div id="profile-posts" class="feed"><div class="loading"><span class="spinner"></span></div></div>';
  const posts=await api("/api/profile/"+encodeURIComponent(username)+"/posts");
  const target=document.querySelector("#profile-posts");
  target.innerHTML=posts.posts?.length?posts.posts.map(renderPost).join(""):'<section class="empty-card">This creator has not posted yet.</section>';
 }catch(error){renderRequestError(error)}
}
document.addEventListener("click",event=>{
 const signIn=event.target.closest("[data-tc-signin]");
 if(signIn){event.preventDefault();beginSignIn();return}
 const action=event.target.closest("[data-auth-action]");
 if(action){document.querySelector("#auth-modal").hidden=false;return}
 if(event.target.closest("[data-close-auth]"))document.querySelector("#auth-modal").hidden=true;
});
document.addEventListener("keydown",event=>{if(event.key==="Escape")document.querySelector("#auth-modal").hidden=true});
if(location.pathname==="/auth/callback"){completeSignIn().catch(error=>{history.replaceState({},"","/");showAuthError(error.message)})}
else{restoreSignIn();const match=location.pathname.match(/^\\/@([^/]+)\\/?$/);if(match)loadProfile(decodeURIComponent(match[1]));else loadHome()}
