const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const notFound=()=>json({error:"not_found"},404);
const safeUser=row=>({username:row.username,display_name:row.display_name,bio:row.bio,profile_picture:row.profile_picture});
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/api/health"&&request.method==="GET")return json({ok:true,service:"TC Social"});
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
          return json({posts:result.results||[]});
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
