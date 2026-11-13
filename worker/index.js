const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const notFound=()=>json({error:"not_found"},404);
const publicPicture=(value,username)=>String(value||"").startsWith("upload:")?"/api/avatar/"+encodeURIComponent(username):value;
const bannerVersion=value=>{let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return (hash>>>0).toString(36)};
const publicBanner=(value,username)=>String(value||"").startsWith("upload:")?"/api/banner/"+encodeURIComponent(username)+"?v="+bannerVersion(String(value)):value;
const safeUser=row=>({username:row.username,display_name:row.display_name,bio:row.bio,profile_picture:publicPicture(row.profile_picture,row.username),banner_image:publicBanner(row.banner_image,row.username),social_links:(()=>{try{return JSON.parse(row.social_links||"{}")}catch{return {}}})(),verified:Boolean(row.verified),verification_type:row.verification_type||"account",is_tc_staff:Boolean(row.is_tc_staff),is_private:Boolean(row.is_private)});
const publicPosts=rows=>(rows||[]).map(row=>({...row,profile_picture:publicPicture(row.profile_picture,row.username)}));
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/api/health"&&request.method==="GET")return json({ok:true,service:"TC Social"});
    if((url.pathname==="/"||url.pathname==="/index.html")&&request.method==="GET"){
      const asset=await env.ASSETS.fetch(request);
      let html=await asset.text();
      const removeAside=(input,marker)=>{const start=input.indexOf(marker);if(start<0)return input;const end=input.indexOf("</aside>",start);return end<0?input:input.slice(0,start)+input.slice(end+8)};
      html=removeAside(html,'<aside class="side-column">');
      html=removeAside(html,'<aside class="right-column">');
      html=html.replace("/styles.css?v=20261112-2","/styles.css?v=20261113-social-dual-badges-2");
      html=html.replace("/styles.css?v=20261113-profiles-admin-1","/styles.css?v=20261113-social-dual-badges-2");
      html=html.replace("/app.js?v=20261113-profiles-admin-1","/app.js?v=20261113-social-dual-badges-2");
      html=html.replace("</head>",'<style>.layout{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:22px;align-items:start;width:min(1240px,calc(100% - 48px));margin:34px auto}.main-column{width:100%;min-width:0}.recommendations-column{position:sticky;top:90px;align-self:start;background:#111;border:1px solid #262626;border-radius:13px;padding:17px;min-width:0}.recommendations-column[hidden]{display:none}.site-footer{font-size:10px;color:#666;padding:24px 2px;text-align:center}@media(max-width:850px){.layout{grid-template-columns:minmax(0,1fr) 230px;gap:14px}}@media(max-width:650px){.layout{display:block;width:calc(100% - 28px);margin:22px auto}.recommendations-column{position:static;margin-top:18px}}.modal{overflow-y:auto;overscroll-behavior:contain}.profile-editor-card{max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);overflow-y:auto;overscroll-behavior:contain;min-height:0}.profile-banner{width:100%;height:auto;min-height:0;max-height:none;aspect-ratio:auto;display:block;overflow:visible;background:#080808;border-radius:9px;margin-bottom:20px}.profile-banner img{display:block;width:100%;height:auto;max-height:360px;object-fit:contain;object-position:center}</style></head>');
      return new Response(html,{status:asset.status,headers:asset.headers});
    }
    if(url.pathname==="/app.js"&&request.method==="GET"){
      const asset=await env.ASSETS.fetch(request);
      const source=await asset.text();
      let repaired=source.replaceAll("\\n","\n").replaceAll("\\\\","\\");
      repaired=repaired.replace("  const followButton=p.is_page||!canEdit?'<button class=\"post-action\" data-follow=\"'+escapeHtml(p.username)+'\" aria-pressed=\"false\">Follow</button>':\"\";","  const signedInUser=JSON.parse(sessionStorage.getItem(\"tc_social_user\")||\"null\");\n  const isOwnProfile=!p.is_page&&String(signedInUser?.preferred_username||\"\").toLowerCase()===String(p.username).toLowerCase();\n  const followButton=p.is_page||!isOwnProfile?'<button class=\"post-action\" data-follow=\"'+escapeHtml(p.username)+'\" aria-pressed=\"false\">Follow</button>':\"\";");
      repaired=repaired.replace("(canEdit?'<button class=\"post-action profile-edit-button\" data-edit-profile>Edit</button>'+(p.is_page?followButton:\"\"):followButton)","(canEdit?'<button class=\"post-action profile-edit-button\" data-edit-profile>Edit</button>':\"\")+followButton");
      if(!repaired.includes("async function requireSignIn()")){
        const authHelper=`async function requireSignIn(){\n const token=sessionStorage.getItem("tc_social_access_token");\n if(token){try{const response=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+token,accept:"application/json"}});const user=await response.json().catch(()=>null);if(response.ok&&user?.sub&&user?.preferred_username){sessionStorage.setItem("tc_social_user",JSON.stringify(user));await updateSignInState(user);return true}}catch{}sessionStorage.removeItem("tc_social_access_token");sessionStorage.removeItem("tc_social_user")}\n await updateSignInState(null);document.querySelector("#auth-modal").hidden=false;return false;\n}\n`;
        repaired=repaired.replace("async function restoreSignIn(){",authHelper+"async function restoreSignIn(){");
        repaired=repaired.replace('if(!sessionStorage.getItem("tc_social_access_token")){document.querySelector("#auth-modal").hidden=false;return}',"if(!await requireSignIn())return");
        repaired=repaired.replace('if(action){document.querySelector("#auth-modal").hidden=false;return}', 'if(action){if(!await requireSignIn())return;showToast(action.dataset.authAction==="react"?"Reactions are not available yet.":"Comments are not available yet.");return}');
        repaired=repaired.replace('if(event.target.id!=="post-composer")return;\\n event.preventDefault();', 'if(event.target.id!=="post-composer")return;\\n event.preventDefault();\\n if(!await requireSignIn())return;');
        repaired=repaired.replace('document.addEventListener("submit",event=>{if(event.target.id==="profile-editor-form"){event.preventDefault();saveProfileEditor(event.target)}});', 'document.addEventListener("submit",async event=>{if(event.target.id==="profile-editor-form"){event.preventDefault();if(await requireSignIn())saveProfileEditor(event.target)}});');
      }
      repaired=repaired.replaceAll('["youtube","instagram","tiktok","spotify","twitch","website"]','["youtube","instagram","tiktok","spotify","twitch","x","website"]');
      repaired=repaired.replace('<label for="edit-website">Website</label>','<label for="edit-x">X</label><input id="edit-x" name="social_x" type="url" maxlength="500" placeholder="https://x.com/username"><label for="edit-x-label">X button label</label><input id="edit-x-label" name="social_x_label" maxlength="40" placeholder="e.g. Follow me on X"><label for="edit-website">Website</label>');
      repaired=repaired.replace('twitch:"Twitch",website:"Website"','twitch:"Twitch",x:"X",website:"Website"');
      return new Response(repaired,{status:asset.status,headers:asset.headers});
    }
    if(url.pathname==="/api/auth/config"&&request.method==="GET")return json({client_id:env.TC_SOCIAL_CLIENT_ID||null,redirect_uri:new URL("/auth/callback",url.origin).toString()});
    if(url.pathname.startsWith("/api/banner/")&&request.method==="GET"){
      const username=decodeURIComponent(url.pathname.slice("/api/banner/".length));
      if(!username||username.length>64)return notFound();
      try{
        let row=await env.TC.prepare("SELECT banner_image FROM users WHERE username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(username).first();
        if(!row)row=await env.TC.prepare("SELECT banner_image FROM social_pages WHERE handle=? COLLATE NOCASE AND status='active' LIMIT 1").bind(username).first();
        const match=String(row?.banner_image||"").match(/^upload:(image\/(?:webp|jpeg|png)):([A-Za-z0-9+/]+={0,2})$/);
        if(!match)return notFound();
        const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
        return new Response(bytes,{headers:{"content-type":match[1],"cache-control":"no-store, no-cache, must-revalidate","cdn-cache-control":"no-store","x-content-type-options":"nosniff"}});
      }catch(error){console.error("TC Social banner query failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname.startsWith("/api/avatar/")&&request.method==="GET"){
      const username=decodeURIComponent(url.pathname.slice("/api/avatar/".length));
      if(!username||username.length>64)return notFound();
      try{
        let row=await env.TC.prepare("SELECT profile_picture FROM users WHERE username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(username).first();
        if(!row)row=await env.TC.prepare("SELECT profile_picture FROM social_pages WHERE handle=? COLLATE NOCASE AND status='active' LIMIT 1").bind(username).first();
        const match=String(row?.profile_picture||"").match(/^upload:(image\/(?:webp|jpeg|png)):([A-Za-z0-9+/]+={0,2})$/);
        if(!match)return notFound();
        const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
        return new Response(bytes,{headers:{"content-type":match[1],"cache-control":"public, max-age=3600","x-content-type-options":"nosniff"}});
      }catch(error){console.error("TC Social avatar query failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname==="/api/identities"&&request.method==="GET"){
      const authorization=request.headers.get("authorization")||"";
      const match=authorization.match(/^Bearer\s+(.+)$/i);
      if(!match)return json({error:"unauthorized"},401);
      try{
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+match[1],accept:"application/json"}});
        if(!identityResponse.ok)return json({error:"unauthorized"},401);
        const identity=await identityResponse.json();
        const user=await env.TC.prepare("SELECT id,username,display_name,profile_picture,verified FROM users WHERE id=? AND username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(Number(identity.sub),String(identity.preferred_username||"")).first();
        if(!user)return json({error:"social_account_required"},403);
        const pages=await env.TC.prepare("SELECT p.id,p.handle,p.display_name,p.profile_picture,p.verified FROM social_pages p JOIN social_page_managers m ON m.page_id=p.id WHERE m.user_id=? AND p.status='active' ORDER BY p.display_name COLLATE NOCASE").bind(user.id).all();
        return json({identities:[{id:"",type:"user",username:user.username,display_name:user.display_name||user.username,profile_picture:publicPicture(user.profile_picture,user.username),verified:Boolean(user.verified)},...(pages.results||[]).map(page=>({id:String(page.id),type:"page",username:page.handle,display_name:page.display_name,profile_picture:page.profile_picture,verified:Boolean(page.verified)}))]});
      }catch(error){console.error("TC Social identity list failed",String(error?.message||error));return json({error:"identities_unavailable"},503)}
    }
    if(url.pathname==="/api/posts"&&request.method==="POST"){
      const authorization=request.headers.get("authorization")||"";
      const match=authorization.match(/^Bearer\s+(.+)$/i);
      if(!match)return json({error:"unauthorized"},401);
      try{
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+match[1],accept:"application/json"}});
        if(!identityResponse.ok)return json({error:"unauthorized"},401);
        const identity=await identityResponse.json();
        const signedInUsername=String(identity.preferred_username||"").trim();
        if(!identity.sub||!signedInUsername)return json({error:"unauthorized"},401);
        const username=signedInUsername;
        const body=await request.json().catch(()=>null);
        if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"invalid_body"},400);
        const content=String(body.content||"").trim();
        if(!content)return json({error:"empty_post",message:"Write something before posting."},400);
        if(content.length>2000)return json({error:"post_too_long",message:"Posts must be 2,000 characters or fewer."},400);
        const user=await env.TC.prepare("SELECT id FROM users WHERE id=? AND username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(Number(identity.sub),username).first();
        if(!user)return json({error:"social_account_required",message:"Your TC account needs an active TC Social profile before posting."},403);
        const pageId=body.identity_id==null||body.identity_id===""?null:Number(body.identity_id);
        if(pageId!==null){
          if(!Number.isSafeInteger(pageId)||pageId<1)return json({error:"invalid_identity"},400);
          const manager=await env.TC.prepare("SELECT p.id FROM social_pages p JOIN social_page_managers m ON m.page_id=p.id WHERE p.id=? AND m.user_id=? AND p.status='active'").bind(pageId,user.id).first();
          if(!manager)return json({error:"identity_forbidden",message:"You do not have permission to publish as that page."},403);
        }
        const createdAt=new Date().toISOString();
        const result=await env.TC.prepare("INSERT INTO social_posts (user_id,author_page_id,content,media_url,created_at) VALUES (?,?,?,NULL,?)").bind(user.id,pageId,content,createdAt).run();
        const post=await env.TC.prepare("SELECT p.id,p.content,p.media_url,p.created_at,COALESCE(sp.handle,u.username) AS username,COALESCE(sp.display_name,u.display_name) AS display_name,COALESCE(sp.profile_picture,u.profile_picture) AS profile_picture,COALESCE(sp.verified,u.verified,0) AS verified,(SELECT COUNT(*) FROM social_reactions r WHERE r.post_id=p.id) AS reaction_count,(SELECT COUNT(*) FROM social_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) AS comment_count FROM social_posts p JOIN users u ON u.id=p.user_id LEFT JOIN social_pages sp ON sp.id=p.author_page_id WHERE p.id=? LIMIT 1").bind(result.meta?.last_row_id).first();
        return json({post:post?{...post,profile_picture:publicPicture(post.profile_picture,post.username)}:null},201);
      }catch(error){
        console.error("TC Social post creation failed",String(error?.message||error));
        return json({error:"internal_error"},500);
      }
    }
    if(url.pathname.startsWith("/api/follow/")&&(request.method==="GET"||request.method==="POST"||request.method==="DELETE")){
      const targetName=decodeURIComponent(url.pathname.slice("/api/follow/".length)).replace(/^@/,"");
      if(!targetName||targetName.length>64)return json({error:"invalid_username"},400);
      try{
        const targetUser=await env.TC.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(targetName).first();
        const targetPage=targetUser?null:await env.TC.prepare("SELECT id FROM social_pages WHERE handle=? COLLATE NOCASE AND status='active' LIMIT 1").bind(targetName).first();
        if(!targetUser&&!targetPage)return notFound();
        const authorization=request.headers.get("authorization")||"";
        const match=authorization.match(/^Bearer\s+(.+)$/i);
        if(!match){if(request.method==="GET")return json({following:false});return json({error:"unauthorized"},401)}
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+match[1],accept:"application/json"}});
        if(!identityResponse.ok)return json({error:"unauthorized"},401);
        const identity=await identityResponse.json();
        const user=await env.TC.prepare("SELECT id FROM users WHERE id=? AND username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(Number(identity.sub),String(identity.preferred_username||"")).first();
        if(!user)return json({error:"social_account_required"},403);
        if(targetUser){
          if(user.id===targetUser.id)return json({error:"cannot_follow_self"},400);
          if(request.method==="POST")await env.TC.prepare("INSERT OR IGNORE INTO social_follows (follower_id,followed_id) VALUES (?,?)").bind(user.id,targetUser.id).run();
          else if(request.method==="DELETE")await env.TC.prepare("DELETE FROM social_follows WHERE follower_id=? AND followed_id=?").bind(user.id,targetUser.id).run();
          const relation=await env.TC.prepare("SELECT 1 AS following FROM social_follows WHERE follower_id=? AND followed_id=?").bind(user.id,targetUser.id).first();
          return json({following:Boolean(relation),target_type:"user"});
        }
        if(request.method==="POST")await env.TC.prepare("INSERT OR IGNORE INTO social_page_follows (follower_id,page_id) VALUES (?,?)").bind(user.id,targetPage.id).run();
        else if(request.method==="DELETE")await env.TC.prepare("DELETE FROM social_page_follows WHERE follower_id=? AND page_id=?").bind(user.id,targetPage.id).run();
        const relation=await env.TC.prepare("SELECT 1 AS following FROM social_page_follows WHERE follower_id=? AND page_id=?").bind(user.id,targetPage.id).first();
        return json({following:Boolean(relation),target_type:"page"});
      }catch(error){console.error("TC Social follow request failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    const engagementMatch=url.pathname.match(/^\/api\/posts\/(\d+)\/(comments|reactions)$/);
    if(engagementMatch){
      const postId=Number(engagementMatch[1]),kind=engagementMatch[2];
      if(!Number.isSafeInteger(postId)||postId<1)return json({error:"invalid_post"},400);
      try{
        const post=await env.TC.prepare("SELECT id FROM social_posts WHERE id=? AND deleted_at IS NULL").bind(postId).first();
        if(!post)return notFound();
        if(kind==="comments"&&request.method==="GET"){
          const result=await env.TC.prepare("SELECT c.id,c.content,c.created_at,u.username,u.display_name,u.profile_picture,u.verified FROM social_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? AND c.deleted_at IS NULL AND u.status='active' ORDER BY c.created_at ASC LIMIT 100").bind(postId).all();
          return json({comments:publicPosts(result.results)});
        }
        if(kind==="reactions"&&request.method==="GET"){
          const count=await env.TC.prepare("SELECT COUNT(*) AS count FROM social_reactions WHERE post_id=?").bind(postId).first();
          let reacted=false;
          const auth=request.headers.get("authorization")||"",tokenMatch=auth.match(/^Bearer\s+(.+)$/i);
          if(tokenMatch){
            const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+tokenMatch[1],accept:"application/json"}});
            if(identityResponse.ok){
              const identity=await identityResponse.json();
              const user=await env.TC.prepare("SELECT id FROM users WHERE id=? AND username=? COLLATE NOCASE AND status='active'").bind(Number(identity.sub),String(identity.preferred_username||"")).first();
              if(user)reacted=Boolean(await env.TC.prepare("SELECT 1 FROM social_reactions WHERE post_id=? AND user_id=?").bind(postId,user.id).first());
            }
          }
          return json({count:Number(count?.count||0),reacted});
        }
        const auth=request.headers.get("authorization")||"",tokenMatch=auth.match(/^Bearer\s+(.+)$/i);
        if(!tokenMatch)return json({error:"unauthorized"},401);
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+tokenMatch[1],accept:"application/json"}});
        if(!identityResponse.ok)return json({error:"unauthorized"},401);
        const identity=await identityResponse.json();
        const user=await env.TC.prepare("SELECT id FROM users WHERE id=? AND username=? COLLATE NOCASE AND status='active'").bind(Number(identity.sub),String(identity.preferred_username||"")).first();
        if(!user)return json({error:"social_account_required"},403);
        if(kind==="reactions"&&(request.method==="POST"||request.method==="DELETE")){
          if(request.method==="POST")await env.TC.prepare("INSERT OR IGNORE INTO social_reactions (post_id,user_id,reaction) VALUES (?,?,'like')").bind(postId,user.id).run();
          else await env.TC.prepare("DELETE FROM social_reactions WHERE post_id=? AND user_id=?").bind(postId,user.id).run();
          const count=await env.TC.prepare("SELECT COUNT(*) AS count FROM social_reactions WHERE post_id=?").bind(postId).first();
          return json({count:Number(count?.count||0),reacted:request.method==="POST"});
        }
        if(kind==="comments"&&request.method==="POST"){
          const body=await request.json().catch(()=>null);
          const content=String(body?.content||"").trim();
          if(!content)return json({error:"empty_comment",message:"Write a comment first."},400);
          if(content.length>1000)return json({error:"comment_too_long",message:"Comments must be 1,000 characters or fewer."},400);
          const createdAt=new Date().toISOString();
          const result=await env.TC.prepare("INSERT INTO social_comments (post_id,user_id,content,created_at,updated_at) VALUES (?,?,?,?,?)").bind(postId,user.id,content,createdAt,createdAt).run();
          const comment=await env.TC.prepare("SELECT c.id,c.content,c.created_at,u.username,u.display_name,u.profile_picture,u.verified FROM social_comments c JOIN users u ON u.id=c.user_id WHERE c.id=?").bind(result.meta?.last_row_id).first();
          return json({comment:comment?{...comment,profile_picture:publicPicture(comment.profile_picture,comment.username)}:null},201);
        }
        return json({error:"method_not_allowed"},405);
      }catch(error){console.error("TC Social engagement request failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname==="/api/verification"&&request.method==="POST"){
      const authorization=request.headers.get("authorization")||"",match=authorization.match(/^Bearer\s+(.+)$/i);
      if(!match)return json({error:"unauthorized"},401);
      try{
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+match[1],accept:"application/json"}});
        if(!identityResponse.ok)return json({error:"unauthorized"},401);
        const identity=await identityResponse.json();
        if(Number(identity.sub)!==1)return json({error:"forbidden"},403);
        const body=await request.json().catch(()=>null);
        if(!body||!["user","page"].includes(body.type)||typeof body.username!=="string"||typeof body.verified!=="boolean"||!["account","business","group"].includes(body.verification_type)||body.staff!==undefined&&typeof body.staff!=="boolean")return json({error:"invalid_body"},400);
        const table=body.type==="user"?"users":"social_pages",nameColumn=body.type==="user"?"username":"handle";
        const result=body.staff!==undefined
          ?await env.TC.prepare("UPDATE "+table+" SET is_tc_staff=? WHERE "+nameColumn+"=? COLLATE NOCASE AND status='active'").bind(body.staff?1:0,body.username).run()
          :await env.TC.prepare("UPDATE "+table+" SET verified=?,verification_type=? WHERE "+nameColumn+"=? COLLATE NOCASE AND status='active'").bind(body.verified?1:0,body.verified?body.verification_type:"account",body.username).run();
        if(!result.meta?.changes)return notFound();
        return json({verified:body.verified});
      }catch(error){console.error("TC Social verification update failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname.startsWith("/api/pages/")&&request.method==="PATCH"){
      const pageId=Number(url.pathname.slice("/api/pages/".length));
      if(!Number.isSafeInteger(pageId)||pageId<1)return json({error:"invalid_page"},400);
      const authorization=request.headers.get("authorization")||"";
      const match=authorization.match(/^Bearer\s+(.+)$/i);
      if(!match)return json({error:"unauthorized"},401);
      try{
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+match[1],accept:"application/json"}});
        if(!identityResponse.ok)return json({error:"unauthorized"},401);
        const identity=await identityResponse.json();
        const userId=Number(identity.sub);
        const manager=await env.TC.prepare("SELECT role FROM social_page_managers WHERE page_id=? AND user_id=?").bind(pageId,userId).first();
        if(userId!==1&&(!manager||!["owner","admin"].includes(manager.role)))return json({error:"forbidden"},403);
        const page=await env.TC.prepare("SELECT id,handle,display_name,profile_picture,banner_image FROM social_pages WHERE id=? AND status='active'").bind(pageId).first();
        if(!page)return notFound();
        const body=await request.json().catch(()=>null);
        if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"invalid_body"},400);
        const displayName=String(body.display_name??page.display_name).trim();
        const handle=String(body.handle??page.handle).trim();
        if(!displayName||displayName.length>80)return json({error:"invalid_display_name"},400);
        if(!/^[A-Za-z0-9_]{3,24}$/.test(handle)&&handle.toLowerCase()!=="tc")return json({error:"invalid_handle",message:"Handles must be 3–24 letters, numbers, or underscores. @TC is reserved."},400);
        let picture=Object.prototype.hasOwnProperty.call(body,"profile_picture")?(body.profile_picture==null||String(body.profile_picture).trim()===""?null:String(body.profile_picture).trim()):page.profile_picture;
        let banner=Object.prototype.hasOwnProperty.call(body,"banner_image")?(body.banner_image==null||String(body.banner_image).trim()===""?null:String(body.banner_image).trim()):page.banner_image;
        if(picture&&picture.startsWith("data:")){
          const uploaded=picture.match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
          if(!uploaded)return json({error:"invalid_image"},400);
          let decoded;try{decoded=atob(uploaded[2])}catch{return json({error:"invalid_image"},400)}
          if(decoded.length>400000)return json({error:"image_too_large"},413);
          picture="upload:"+uploaded[1]+":"+uploaded[2];
        }
        if(picture&&!picture.startsWith("upload:")){
          let imageUrl;try{imageUrl=new URL(picture)}catch{return json({error:"invalid_profile_picture_url"},400)}
          if(imageUrl.protocol!=="https:")return json({error:"invalid_profile_picture_url"},400);
          if(picture.length>2048)return json({error:"profile_picture_url_too_long"},400);
        }
        if(banner&&banner.startsWith("data:")){
          const uploaded=banner.match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
          if(!uploaded)return json({error:"invalid_image"},400);
          let decoded;try{decoded=atob(uploaded[2])}catch{return json({error:"invalid_image"},400)}
          if(decoded.length>400000)return json({error:"image_too_large"},413);
          banner="upload:"+uploaded[1]+":"+uploaded[2];
        }
        if(banner&&!banner.startsWith("upload:")){
          let imageUrl;try{imageUrl=new URL(banner)}catch{return json({error:"invalid_banner_url"},400)}
          if(imageUrl.protocol!=="https:"||banner.length>2048)return json({error:"invalid_banner_url"},400);
        }
        await env.TC.prepare("UPDATE social_pages SET handle=?,display_name=?,profile_picture=?,banner_image=? WHERE id=?").bind(handle,displayName,picture,banner,pageId).run();
        return json({profile:{id:pageId,username:handle,display_name:displayName,profile_picture:publicPicture(picture,handle),banner_image:publicBanner(banner,handle),is_page:true,can_manage:true}});
      }catch(error){
        if(String(error?.message||"").includes("UNIQUE"))return json({error:"handle_taken",message:"That handle is already in use."},409);
        console.error("TC Social page update failed",String(error?.message||error));
        return json({error:"internal_error"},500);
      }
    }
    if((url.pathname==="/api/profile/me"||(/^\/api\/profile\/[^/]+$/.test(url.pathname)&&url.pathname!=="/api/profile"))&&request.method==="PATCH"){
      const authorization=request.headers.get("authorization")||"";
      const match=authorization.match(/^Bearer\s+(.+)$/i);
      if(!match)return json({error:"unauthorized"},401);
      try{
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+match[1],accept:"application/json"}});
        if(!identityResponse.ok)return json({error:"unauthorized"},401);
        const identity=await identityResponse.json();
        const signedInUsername=String(identity.preferred_username||"").trim();
        if(!identity.sub||!signedInUsername)return json({error:"unauthorized"},401);
        const userId=Number(identity.sub);
        const targetUsername=url.pathname==="/api/profile/me"?signedInUsername:decodeURIComponent(url.pathname.slice("/api/profile/".length)).replace(/^@/,"");
        const target=await env.TC.prepare("SELECT id,username FROM users WHERE username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(targetUsername).first();
        if(!target)return notFound();
        if(userId!==1&&Number(target.id)!==userId)return json({error:"forbidden"},403);
        const username=target.username;
        const body=await request.json().catch(()=>null);
        if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"invalid_body"},400);
        const displayName=body.display_name==null||String(body.display_name).trim()===""?null:String(body.display_name).trim();
        const bio=body.bio==null||String(body.bio).trim()===""?null:String(body.bio).trim();
        let picture=Object.prototype.hasOwnProperty.call(body,"profile_picture")?(body.profile_picture==null||String(body.profile_picture).trim()===""?null:String(body.profile_picture).trim()):undefined;
        const isPrivate=Object.prototype.hasOwnProperty.call(body,"is_private")?Boolean(body.is_private):undefined;
        let banner=Object.prototype.hasOwnProperty.call(body,"banner_image")?(body.banner_image==null||String(body.banner_image).trim()===""?null:String(body.banner_image).trim()):undefined;
        if(picture&&picture.startsWith("data:")){
          const uploaded=picture.match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
          if(!uploaded)return json({error:"invalid_image"},400);
          let decoded;
          try{decoded=atob(uploaded[2])}catch{return json({error:"invalid_image"},400)}
          if(decoded.length>400000)return json({error:"image_too_large"},413);
          picture="upload:"+uploaded[1]+":"+uploaded[2];
        }
        if(banner&&banner.startsWith("data:")){
          const uploaded=banner.match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
          if(!uploaded)return json({error:"invalid_image"},400);
          let decoded;try{decoded=atob(uploaded[2])}catch{return json({error:"invalid_image"},400)}
          if(decoded.length>400000)return json({error:"image_too_large"},413);
          banner="upload:"+uploaded[1]+":"+uploaded[2];
        }
        if(banner&&!banner.startsWith("upload:")){
          let imageUrl;try{imageUrl=new URL(banner)}catch{return json({error:"invalid_banner_url"},400)}
          if(imageUrl.protocol!=="https:"||banner.length>2048)return json({error:"invalid_banner_url"},400);
        }
        if(displayName&&displayName.length>80)return json({error:"display_name_too_long",message:"Display name must be 80 characters or fewer."},400);
        if(bio&&bio.length>500)return json({error:"bio_too_long",message:"Bio must be 500 characters or fewer."},400);
        if(picture&&!picture.startsWith("upload:")){
          if(picture.length>2048)return json({error:"profile_picture_url_too_long"},400);
          let imageUrl;
          try{imageUrl=new URL(picture)}catch{return json({error:"invalid_profile_picture_url",message:"Profile picture must be a valid HTTPS image URL."},400)}
          if(imageUrl.protocol!=="https:")return json({error:"invalid_profile_picture_url",message:"Profile picture must use HTTPS."},400);
        }
        await env.TC.prepare("UPDATE users SET display_name=?,bio=?,is_private=COALESCE(?,is_private),profile_picture=CASE WHEN ?=1 THEN ? ELSE profile_picture END,banner_image=CASE WHEN ?=1 THEN ? ELSE banner_image END,social_links=COALESCE(?,social_links) WHERE id=? AND status='active'").bind(displayName,bio,isPrivate===undefined?null:(isPrivate?1:0),Object.prototype.hasOwnProperty.call(body,"profile_picture")?1:0,picture??null,Object.prototype.hasOwnProperty.call(body,"banner_image")?1:0,banner??null,Object.prototype.hasOwnProperty.call(body,"social_links")?JSON.stringify((()=>{const input=body.social_links;if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("invalid_social_links");const allowed=["youtube","instagram","tiktok","spotify","twitch","website"],output={};for(const key of allowed){const entry=input[key];const value=String(typeof entry==="string"?entry:(entry&&typeof entry==="object"?entry.url:"")||"").trim();if(!value)continue;if(value.length>500)throw new Error("invalid_social_link");let parsed;try{parsed=new URL(value)}catch{throw new Error("invalid_social_link")}if(parsed.protocol!=="https:")throw new Error("invalid_social_link");const label=String((entry&&typeof entry==="object"?entry.label:"")||"").trim().slice(0,40);output[key]={url:parsed.toString(),label}}return output})()):null,target.id).run();
        const updated=await env.TC.prepare("SELECT username,display_name,bio,profile_picture,banner_image,social_links,verified,verification_type,is_tc_staff,is_private FROM users WHERE id=? AND status='active'").bind(target.id).first();
        if(!updated)return notFound();
        return json({profile:safeUser(updated)});
      }catch(error){
        console.error("TC Social profile update failed",String(error?.message||error));
        return json({error:"internal_error"},500);
      }
    }
    if(url.pathname==="/api/profile"||url.pathname==="/api/profile/")return json({error:"username_required"},400);
    if(url.pathname.startsWith("/api/profile/")&&request.method==="GET"){
      const parts=url.pathname.split("/").filter(Boolean);
      const username=decodeURIComponent(parts[2]||"").replace(/^@/,"");
      if(!username||username.length>64)return json({error:"invalid_username"},400);
      try{
        const user=await env.TC.prepare("SELECT id,username,display_name,bio,profile_picture,banner_image,social_links,verified,is_private FROM users WHERE username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(username).first();
        if(!user){
          const page=await env.TC.prepare("SELECT id,handle,display_name,profile_picture,banner_image,verified,verification_type,is_tc_staff FROM social_pages WHERE handle=? COLLATE NOCASE AND status='active' LIMIT 1").bind(username).first();
          if(!page)return notFound();
          if(parts.length===3){
            let canManage=false,canVerify=false;
            const auth=request.headers.get("authorization")||"";
            const tokenMatch=auth.match(/^Bearer\s+(.+)$/i);
            if(tokenMatch){
              try{
                const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+tokenMatch[1],accept:"application/json"}});
                if(identityResponse.ok){
                  const identity=await identityResponse.json();
                  canVerify=Number(identity.sub)===1;
                  const manager=await env.TC.prepare("SELECT role FROM social_page_managers WHERE page_id=? AND user_id=?").bind(page.id,Number(identity.sub)).first();
                  canManage=Number(identity.sub)===1||Boolean(manager&&["owner","admin"].includes(manager.role));
                }
              }catch{}
            }
            const followers=await env.TC.prepare("SELECT COUNT(*) AS count FROM social_page_follows WHERE page_id=?").bind(page.id).first();return json({profile:{id:page.id,username:page.handle,display_name:page.display_name,bio:null,profile_picture:publicPicture(page.profile_picture,page.handle),banner_image:publicBanner(page.banner_image,page.handle),verified:Boolean(page.verified),verification_type:page.verification_type||"account",is_tc_staff:Boolean(page.is_tc_staff),is_page:true,can_manage:canManage,can_verify:canVerify,follower_count:Number(followers?.count||0)}});
          }
          if(parts.length===4&&parts[3]==="posts"){
            const pagePosts=await env.TC.prepare("SELECT p.id,p.content,p.media_url,p.created_at,sp.handle AS username,sp.display_name,sp.profile_picture,sp.verified,(SELECT COUNT(*) FROM social_reactions r WHERE r.post_id=p.id) AS reaction_count,(SELECT COUNT(*) FROM social_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) AS comment_count FROM social_posts p JOIN social_pages sp ON sp.id=p.author_page_id WHERE p.author_page_id=? AND p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 30").bind(page.id).all();
            return json({posts:publicPosts(pagePosts.results)});
          }
          return notFound();
        }
        if(user.is_private){
          let canView=false;
          const authorization=request.headers.get("authorization")||"",viewerToken=authorization.match(/^Bearer\s+(.+)$/i);
          if(viewerToken){
            const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+viewerToken[1],accept:"application/json"}});
            if(identityResponse.ok){
              const identity=await identityResponse.json();
              const viewer=await env.TC.prepare("SELECT id FROM users WHERE id=? AND username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(Number(identity.sub),String(identity.preferred_username||"")).first();
              if(viewer?.id===user.id||Number(identity.sub)===1)canView=true;
              else if(viewer)canView=Boolean(await env.TC.prepare("SELECT 1 FROM social_follows WHERE follower_id=? AND followed_id=?").bind(viewer.id,user.id).first());
            }
          }
          if(!canView)return json({error:"private_profile",message:"This profile is private."},403);
        }
        if(parts.length===3){let canVerify=false,canEdit=false;const auth=request.headers.get("authorization")||"",tokenMatch=auth.match(/^Bearer\s+(.+)$/i);if(tokenMatch){const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+tokenMatch[1],accept:"application/json"}});if(identityResponse.ok){const identity=await identityResponse.json();canVerify=Number(identity.sub)===1;canEdit=canVerify||Number(identity.sub)===user.id;}}const followers=await env.TC.prepare("SELECT COUNT(*) AS count FROM social_follows WHERE followed_id=?").bind(user.id).first();return json({profile:{...safeUser(user),is_page:false,can_verify:canVerify,can_edit:canEdit,follower_count:Number(followers?.count||0)}});}
        if(parts.length===4&&parts[3]==="posts"){
          const result=await env.TC.prepare("SELECT p.id,p.content,p.media_url,p.created_at,u.username,u.display_name,u.profile_picture,u.verified,(SELECT COUNT(*) FROM social_reactions r WHERE r.post_id=p.id) AS reaction_count,(SELECT COUNT(*) FROM social_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) AS comment_count FROM social_posts p JOIN users u ON u.id=p.user_id WHERE p.user_id=? AND p.author_page_id IS NULL AND p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 30").bind(user.id).all();
          return json({posts:publicPosts(result.results)});
        }
        return notFound();
      }catch(error){console.error("TC Social profile query failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname==="/api/feed"&&request.method==="GET"){
      const authorization=request.headers.get("authorization")||"";
      const match=authorization.match(/^Bearer\s+(.+)$/i);
      if(!match)return json({posts:[]});
      try{
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+match[1],accept:"application/json"}});
        if(!identityResponse.ok)return json({error:"unauthorized"},401);
        const identity=await identityResponse.json();
        const user=await env.TC.prepare("SELECT id FROM users WHERE id=? AND username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(Number(identity.sub),String(identity.preferred_username||"")).first();
        if(!user)return json({posts:[]});
        const result=await env.TC.prepare("SELECT p.id,p.content,p.media_url,p.created_at,COALESCE(sp.handle,u.username) AS username,COALESCE(sp.display_name,u.display_name) AS display_name,COALESCE(sp.profile_picture,u.profile_picture) AS profile_picture,COALESCE(sp.verified,u.verified,0) AS verified,(SELECT COUNT(*) FROM social_reactions r WHERE r.post_id=p.id) AS reaction_count,(SELECT COUNT(*) FROM social_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) AS comment_count FROM social_posts p JOIN users u ON u.id=p.user_id LEFT JOIN social_pages sp ON sp.id=p.author_page_id WHERE p.deleted_at IS NULL AND u.status='active' AND ((p.author_page_id IS NULL AND EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=? AND f.followed_id=p.user_id)) OR (p.author_page_id IS NOT NULL AND EXISTS(SELECT 1 FROM social_page_follows pf WHERE pf.follower_id=? AND pf.page_id=p.author_page_id))) ORDER BY p.created_at DESC LIMIT 50").bind(user.id,user.id).all();
        return json({posts:publicPosts(result.results)});
      }catch(error){console.error("TC Social followed feed failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname==="/api/search"&&request.method==="GET"){
      const query=String(url.searchParams.get("q")||"").trim().slice(0,48);
      if(query.length<2)return json({results:[]});
      const pattern="%"+query.replace(/[%_\\]/g,"\\$&")+"%";
      try{
        const users=await env.TC.prepare("SELECT username,display_name,profile_picture,verified,'user' AS type,(SELECT COUNT(*) FROM social_follows f WHERE f.followed_id=users.id) AS follower_count FROM users WHERE status='active' AND is_private=0 AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') ORDER BY follower_count DESC,username COLLATE NOCASE LIMIT 20").bind(pattern,pattern).all();
        const pages=await env.TC.prepare("SELECT handle AS username,display_name,profile_picture,verified,'page' AS type,(SELECT COUNT(*) FROM social_page_follows f WHERE f.page_id=social_pages.id) AS follower_count FROM social_pages WHERE status='active' AND (handle LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') ORDER BY follower_count DESC,display_name COLLATE NOCASE LIMIT 20").bind(pattern,pattern).all();
        const results=[...(users.results||[]),...(pages.results||[])].sort((a,b)=>Number(b.follower_count)-Number(a.follower_count)).slice(0,25).map(item=>({...item,profile_picture:publicPicture(item.profile_picture,item.username)}));
        return json({results});
      }catch(error){console.error("TC Social search failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname==="/api/recommendations"&&request.method==="GET"){
      let viewerId=null;
      const authorization=request.headers.get("authorization")||"",match=authorization.match(/^Bearer\s+(.+)$/i);
      if(match){
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+match[1],accept:"application/json"}});
        if(identityResponse.ok){
          const identity=await identityResponse.json();
          const viewer=await env.TC.prepare("SELECT id FROM users WHERE id=? AND username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(Number(identity.sub),String(identity.preferred_username||"")).first();
          viewerId=viewer?.id??null;
        }
      }
      try{
        const users=viewerId
          ?await env.TC.prepare("SELECT u.username,u.display_name,u.profile_picture,u.verified,'user' AS type,(SELECT COUNT(*) FROM social_follows f WHERE f.followed_id=u.id) AS follower_count FROM users u WHERE u.status='active' AND u.is_private=0 AND u.id<>? AND NOT EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=? AND f.followed_id=u.id) ORDER BY follower_count DESC,u.username COLLATE NOCASE LIMIT 6").bind(viewerId,viewerId).all()
          :await env.TC.prepare("SELECT u.username,u.display_name,u.profile_picture,u.verified,'user' AS type,(SELECT COUNT(*) FROM social_follows f WHERE f.followed_id=u.id) AS follower_count FROM users u WHERE u.status='active' AND u.is_private=0 ORDER BY follower_count DESC,u.username COLLATE NOCASE LIMIT 6").all();
        const pages=viewerId
          ?await env.TC.prepare("SELECT p.handle AS username,p.display_name,p.profile_picture,p.verified,'page' AS type,(SELECT COUNT(*) FROM social_page_follows f WHERE f.page_id=p.id) AS follower_count FROM social_pages p WHERE p.status='active' AND NOT EXISTS(SELECT 1 FROM social_page_follows f WHERE f.follower_id=? AND f.page_id=p.id) AND NOT EXISTS(SELECT 1 FROM social_page_managers m WHERE m.page_id=p.id AND m.user_id=?) ORDER BY follower_count DESC,p.display_name COLLATE NOCASE LIMIT 6").bind(viewerId,viewerId).all()
          :await env.TC.prepare("SELECT p.handle AS username,p.display_name,p.profile_picture,p.verified,'page' AS type,(SELECT COUNT(*) FROM social_page_follows f WHERE f.page_id=p.id) AS follower_count FROM social_pages p WHERE p.status='active' ORDER BY follower_count DESC,p.display_name COLLATE NOCASE LIMIT 6").all();
        const combined=[...(users.results||[]),...(pages.results||[])].sort((a,b)=>Number(b.follower_count)-Number(a.follower_count)).slice(0,8);
        return json({recommendations:combined.map(item=>({...item,profile_picture:publicPicture(item.profile_picture,item.username)}))});
      }catch(error){console.error("TC Social recommendations failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname.startsWith("/api/"))return notFound();
    return env.ASSETS.fetch(request);
  }
};
