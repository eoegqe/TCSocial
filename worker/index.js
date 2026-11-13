const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const notFound=()=>json({error:"not_found"},404);
const publicPicture=(value,username)=>String(value||"").startsWith("upload:")?"/api/avatar/"+encodeURIComponent(username):value;
const safeUser=row=>({username:row.username,display_name:row.display_name,bio:row.bio,profile_picture:publicPicture(row.profile_picture,row.username)});
const publicPosts=rows=>(rows||[]).map(row=>({...row,profile_picture:publicPicture(row.profile_picture,row.username)}));
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/api/health"&&request.method==="GET")return json({ok:true,service:"TC Social"});
    if(url.pathname==="/app.js"&&request.method==="GET"){
      const asset=await env.ASSETS.fetch(request);
      const source=await asset.text();
      const repaired=source.replaceAll("\\n","\n").replaceAll("\\\\","\\");
      return new Response(repaired,{status:asset.status,headers:asset.headers});
    }
    if(url.pathname==="/api/auth/config"&&request.method==="GET")return json({client_id:env.TC_SOCIAL_CLIENT_ID||null,redirect_uri:new URL("/auth/callback",url.origin).toString()});
    if(url.pathname.startsWith("/api/avatar/")&&request.method==="GET"){
      const username=decodeURIComponent(url.pathname.slice("/api/avatar/".length));
      if(!username||username.length>64)return notFound();
      try{
        const row=await env.TC.prepare("SELECT profile_picture FROM users WHERE username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(username).first();
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
        const user=await env.TC.prepare("SELECT id,username,display_name,profile_picture FROM users WHERE id=? AND username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(Number(identity.sub),String(identity.preferred_username||"")).first();
        if(!user)return json({error:"social_account_required"},403);
        const pages=await env.TC.prepare("SELECT p.id,p.handle,p.display_name,p.profile_picture FROM social_pages p JOIN social_page_managers m ON m.page_id=p.id WHERE m.user_id=? AND p.status='active' ORDER BY p.display_name COLLATE NOCASE").bind(user.id).all();
        return json({identities:[{id:"",type:"user",username:user.username,display_name:user.display_name||user.username,profile_picture:publicPicture(user.profile_picture,user.username)},...(pages.results||[]).map(page=>({id:String(page.id),type:"page",username:page.handle,display_name:page.display_name,profile_picture:page.profile_picture}))]});
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
        const username=String(identity.preferred_username||"").trim();
        if(!identity.sub||!username)return json({error:"unauthorized"},401);
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
        const post=await env.TC.prepare("SELECT p.id,p.content,p.media_url,p.created_at,COALESCE(sp.handle,u.username) AS username,COALESCE(sp.display_name,u.display_name) AS display_name,COALESCE(sp.profile_picture,u.profile_picture) AS profile_picture FROM social_posts p JOIN users u ON u.id=p.user_id LEFT JOIN social_pages sp ON sp.id=p.author_page_id WHERE p.id=? LIMIT 1").bind(result.meta?.last_row_id).first();
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
        const target=await env.TC.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(targetName).first();
        if(!target)return notFound();
        const authorization=request.headers.get("authorization")||"";
        const match=authorization.match(/^Bearer\\s+(.+)$/i);
        if(!match){
          if(request.method==="GET")return json({following:false});
          return json({error:"unauthorized"},401);
        }
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+match[1],accept:"application/json"}});
        if(!identityResponse.ok)return json({error:"unauthorized"},401);
        const identity=await identityResponse.json();
        const user=await env.TC.prepare("SELECT id FROM users WHERE id=? AND username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(Number(identity.sub),String(identity.preferred_username||"")).first();
        if(!user)return json({error:"social_account_required"},403);
        if(user.id===target.id)return json({error:"cannot_follow_self"},400);
        if(request.method==="POST"){
          await env.TC.prepare("INSERT OR IGNORE INTO social_follows (follower_id,followed_id) VALUES (?,?)").bind(user.id,target.id).run();
        }else if(request.method==="DELETE"){
          await env.TC.prepare("DELETE FROM social_follows WHERE follower_id=? AND followed_id=?").bind(user.id,target.id).run();
        }
        const relation=await env.TC.prepare("SELECT 1 AS following FROM social_follows WHERE follower_id=? AND followed_id=?").bind(user.id,target.id).first();
        return json({following:Boolean(relation)});
      }catch(error){console.error("TC Social follow request failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname.startsWith("/api/pages/")&&request.method==="PATCH"){
      const pageId=Number(url.pathname.slice("/api/pages/".length));
      if(!Number.isSafeInteger(pageId)||pageId<1)return json({error:"invalid_page"},400);
      const authorization=request.headers.get("authorization")||"";
      const match=authorization.match(/^Bearer\\s+(.+)$/i);
      if(!match)return json({error:"unauthorized"},401);
      try{
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+match[1],accept:"application/json"}});
        if(!identityResponse.ok)return json({error:"unauthorized"},401);
        const identity=await identityResponse.json();
        const userId=Number(identity.sub);
        const manager=await env.TC.prepare("SELECT role FROM social_page_managers WHERE page_id=? AND user_id=?").bind(pageId,userId).first();
        if(!manager||!["owner","admin"].includes(manager.role))return json({error:"forbidden"},403);
        const page=await env.TC.prepare("SELECT id,handle,display_name,profile_picture FROM social_pages WHERE id=? AND status='active'").bind(pageId).first();
        if(!page)return notFound();
        const body=await request.json().catch(()=>null);
        if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"invalid_body"},400);
        const displayName=String(body.display_name??page.display_name).trim();
        const handle=String(body.handle??page.handle).trim();
        if(!displayName||displayName.length>80)return json({error:"invalid_display_name"},400);
        if(!/^[A-Za-z0-9_]{3,24}$/.test(handle)&&handle.toLowerCase()!=="tc")return json({error:"invalid_handle",message:"Handles must be 3–24 letters, numbers, or underscores. @TC is reserved."},400);
        let picture=Object.prototype.hasOwnProperty.call(body,"profile_picture")?(body.profile_picture==null||String(body.profile_picture).trim()===""?null:String(body.profile_picture).trim()):page.profile_picture;
        if(picture&&picture.startsWith("data:")){
          const uploaded=picture.match(/^data:(image\\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
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
        await env.TC.prepare("UPDATE social_pages SET handle=?,display_name=?,profile_picture=? WHERE id=?").bind(handle,displayName,picture,pageId).run();
        return json({profile:{id:pageId,username:handle,display_name:displayName,profile_picture:picture,is_page:true,can_manage:true}});
      }catch(error){
        if(String(error?.message||"").includes("UNIQUE"))return json({error:"handle_taken",message:"That handle is already in use."},409);
        console.error("TC Social page update failed",String(error?.message||error));
        return json({error:"internal_error"},500);
      }
    }
    if(url.pathname==="/api/profile/me"&&request.method==="PATCH"){
      const authorization=request.headers.get("authorization")||"";
      const match=authorization.match(/^Bearer\s+(.+)$/i);
      if(!match)return json({error:"unauthorized"},401);
      try{
        const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+match[1],accept:"application/json"}});
        if(!identityResponse.ok)return json({error:"unauthorized"},401);
        const identity=await identityResponse.json();
        const username=String(identity.preferred_username||"").trim();
        if(!identity.sub||!username)return json({error:"unauthorized"},401);
        const body=await request.json().catch(()=>null);
        if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"invalid_body"},400);
        const displayName=body.display_name==null||String(body.display_name).trim()===""?null:String(body.display_name).trim();
        const bio=body.bio==null||String(body.bio).trim()===""?null:String(body.bio).trim();
        let picture=Object.prototype.hasOwnProperty.call(body,"profile_picture")?(body.profile_picture==null||String(body.profile_picture).trim()===""?null:String(body.profile_picture).trim()):undefined;
        if(picture&&picture.startsWith("data:")){
          const uploaded=picture.match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
          if(!uploaded)return json({error:"invalid_image"},400);
          let decoded;
          try{decoded=atob(uploaded[2])}catch{return json({error:"invalid_image"},400)}
          if(decoded.length>400000)return json({error:"image_too_large"},413);
          picture="upload:"+uploaded[1]+":"+uploaded[2];
        }
        if(displayName&&displayName.length>80)return json({error:"display_name_too_long",message:"Display name must be 80 characters or fewer."},400);
        if(bio&&bio.length>500)return json({error:"bio_too_long",message:"Bio must be 500 characters or fewer."},400);
        if(picture&&!picture.startsWith("upload:")){
          if(picture.length>2048)return json({error:"profile_picture_url_too_long"},400);
          let imageUrl;
          try{imageUrl=new URL(picture)}catch{return json({error:"invalid_profile_picture_url",message:"Profile picture must be a valid HTTPS image URL."},400)}
          if(imageUrl.protocol!=="https:")return json({error:"invalid_profile_picture_url",message:"Profile picture must use HTTPS."},400);
        }
        const result=picture===undefined
          ?await env.TC.prepare("UPDATE users SET display_name=?,bio=? WHERE username=? COLLATE NOCASE AND status='active'").bind(displayName,bio,username).run()
          :await env.TC.prepare("UPDATE users SET display_name=?,bio=?,profile_picture=? WHERE username=? COLLATE NOCASE AND status='active'").bind(displayName,bio,picture,username).run();
        if(!result.meta?.changes)return notFound();
        const updated=await env.TC.prepare("SELECT username,display_name,bio,profile_picture FROM users WHERE username=? COLLATE NOCASE LIMIT 1").bind(username).first();
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
        const user=await env.TC.prepare("SELECT id,username,display_name,bio,profile_picture FROM users WHERE username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(username).first();
        if(!user){
          const page=await env.TC.prepare("SELECT id,handle,display_name,profile_picture FROM social_pages WHERE handle=? COLLATE NOCASE AND status='active' LIMIT 1").bind(username).first();
          if(!page)return notFound();
          if(parts.length===3){
            let canManage=false;
            const auth=request.headers.get("authorization")||"";
            const tokenMatch=auth.match(/^Bearer\\s+(.+)$/i);
            if(tokenMatch){
              try{
                const identityResponse=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{authorization:"Bearer "+tokenMatch[1],accept:"application/json"}});
                if(identityResponse.ok){
                  const identity=await identityResponse.json();
                  const manager=await env.TC.prepare("SELECT role FROM social_page_managers WHERE page_id=? AND user_id=?").bind(page.id,Number(identity.sub)).first();
                  canManage=Boolean(manager);
                }
              }catch{}
            }
            return json({profile:{id:page.id,username:page.handle,display_name:page.display_name,bio:null,profile_picture:page.profile_picture,is_page:true,can_manage:canManage}});
          }
          if(parts.length===4&&parts[3]==="posts"){
            const pagePosts=await env.TC.prepare("SELECT p.id,p.content,p.media_url,p.created_at,sp.handle AS username,sp.display_name,sp.profile_picture FROM social_posts p JOIN social_pages sp ON sp.id=p.author_page_id WHERE p.author_page_id=? AND p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 30").bind(page.id).all();
            return json({posts:publicPosts(pagePosts.results)});
          }
          return notFound();
        }
        if(parts.length===3)return json({profile:safeUser(user)});
        if(parts.length===4&&parts[3]==="posts"){
          const result=await env.TC.prepare("SELECT p.id,p.content,p.media_url,p.created_at,u.username,u.display_name,u.profile_picture FROM social_posts p JOIN users u ON u.id=p.user_id WHERE p.user_id=? AND p.author_page_id IS NULL AND p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 30").bind(user.id).all();
          return json({posts:publicPosts(result.results)});
        }
        return notFound();
      }catch(error){console.error("TC Social profile query failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname==="/api/feed"&&request.method==="GET"){
      try{
        const result=await env.TC.prepare("SELECT p.id,p.content,p.media_url,p.created_at,COALESCE(sp.handle,u.username) AS username,COALESCE(sp.display_name,u.display_name) AS display_name,COALESCE(sp.profile_picture,u.profile_picture) AS profile_picture FROM social_posts p JOIN users u ON u.id=p.user_id LEFT JOIN social_pages sp ON sp.id=p.author_page_id WHERE p.deleted_at IS NULL AND u.status='active' ORDER BY p.created_at DESC LIMIT 30").all();
        return json({posts:publicPosts(result.results)});
      }catch(error){console.error("TC Social feed query failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname.startsWith("/api/"))return notFound();
    return env.ASSETS.fetch(request);
  }
};
