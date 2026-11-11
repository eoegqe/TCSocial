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
        let picture=body.profile_picture==null||String(body.profile_picture).trim()===""?null:String(body.profile_picture).trim();
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
        const result=await env.TC.prepare("UPDATE users SET display_name=?,bio=?,profile_picture=? WHERE username=? COLLATE NOCASE AND status='active'").bind(displayName,bio,picture,username).run();
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
        if(!user)return notFound();
        if(parts.length===3)return json({profile:safeUser(user)});
        if(parts.length===4&&parts[3]==="posts"){
          const result=await env.TC.prepare("SELECT p.id,p.content,p.media_url,p.created_at,u.username,u.display_name,u.profile_picture FROM social_posts p JOIN users u ON u.id=p.user_id WHERE p.user_id=? AND p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 30").bind(user.id).all();
          return json({posts:publicPosts(result.results)});
        }
        return notFound();
      }catch(error){console.error("TC Social profile query failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname==="/api/feed"&&request.method==="GET"){
      try{
        const result=await env.TC.prepare("SELECT p.id,p.content,p.media_url,p.created_at,u.username,u.display_name,u.profile_picture FROM social_posts p JOIN users u ON u.id=p.user_id WHERE p.deleted_at IS NULL AND u.status='active' ORDER BY p.created_at DESC LIMIT 30").all();
        return json({posts:result.results||[]});
      }catch(error){console.error("TC Social feed query failed",String(error?.message||error));return json({error:"internal_error"},500)}
    }
    if(url.pathname.startsWith("/api/"))return notFound();
    return env.ASSETS.fetch(request);
  }
};
