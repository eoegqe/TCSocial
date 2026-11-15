const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const fail=(code,message,status)=>json({error:code,message},status);
const now=()=>new Date().toISOString();
const makeId=()=>crypto.randomUUID().replaceAll("-","");
async function auth(request,env){
 const header=request.headers.get("authorization")||"",token=header.startsWith("Bearer ")?header.slice(7).trim():"";
 if(!token||token.length>4096)return {response:fail("not_authenticated","Sign in with your TC Account to continue.",401)};
 let identityResponse;
 try{identityResponse=await fetch(new URL("/oauth/userinfo",env.TC_ACCOUNTS_ORIGIN||"https://accounts.theegget.com"),{headers:{authorization:"Bearer "+token,accept:"application/json"},cf:{cacheTtl:0}})}catch{return {response:fail("identity_unavailable","TC Accounts could not be reached.",503)}}
 if(!identityResponse.ok)return {response:fail("invalid_session","Your TC sign-in has expired. Sign in again.",401)};
 let identity;try{identity=await identityResponse.json()}catch{return {response:fail("identity_unavailable","TC Accounts returned an invalid response.",503)}}
 if(!identity?.sub||!identity?.preferred_username)return {response:fail("invalid_identity","TC Accounts did not return a valid identity.",401)};
 const user=await env.TC.prepare("SELECT id,username FROM users WHERE id=? AND username=? COLLATE NOCASE AND status='active' LIMIT 1").bind(String(identity.sub),String(identity.preferred_username)).first();
 if(!user)return {response:fail("social_account_required","This TC account does not have an active Social profile.",403)};
 return {user:{id:String(user.id),username:user.username}};
}
async function participant(env,conversationId,userId){
 return env.TC.prepare("SELECT c.id,c.type,c.title,c.service_tag FROM tc_chat_conversations c JOIN tc_chat_participants p ON p.conversation_id=c.id WHERE c.id=? AND p.user_id=? LIMIT 1").bind(conversationId,userId).first();
}
async function blocked(env,a,b){
 return env.TC.prepare("SELECT 1 AS blocked FROM tc_chat_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1").bind(a,b,b,a).first();
}
export async function handleMessagingRequest(request,env,url){
 const path=url.pathname,method=request.method;
 const migrationMatch=path.match(/^\/api\/conversations\/([a-f0-9-]+)\/messages\/([a-f0-9-]+)\/encrypt$/i);
 const known=path==="/api/messages/me"||path==="/api/keys/self"||path==="/api/keys"||path==="/api/directory"||path==="/api/conversations"||/^\/api\/conversations\/[a-f0-9-]+\/messages$/i.test(path)||Boolean(migrationMatch);
 if(!known)return null;
 const signed=await auth(request,env);if(signed.response)return signed.response;
 const user=signed.user;
 if(path==="/api/messages/me"&&method==="GET")return json({user,service:{label:"Theegget's Social Messages"}});
 if(path==="/api/keys/self"&&method==="GET"){
  const row=await env.TC.prepare("SELECT public_key_jwk,encrypted_private_key,private_key_iv,salt,kdf_iterations FROM tc_chat_user_keys WHERE user_id=?").bind(user.id).first();
  return json({key_bundle:row?{public_key:JSON.parse(row.public_key_jwk),encrypted_private_key:row.encrypted_private_key,private_key_iv:row.private_key_iv,salt:row.salt,kdf_iterations:row.kdf_iterations}:null});
 }
 if(path==="/api/keys/self"&&method==="POST"){
  let body;try{body=await request.json()}catch{return fail("invalid_json","The request body must be valid JSON.",400)}
  const k=body?.public_key,encrypted=typeof body?.encrypted_private_key==="string"?body.encrypted_private_key:"",iv=typeof body?.private_key_iv==="string"?body.private_key_iv:"",salt=typeof body?.salt==="string"?body.salt:"",iterations=Number(body?.kdf_iterations);
  if(k?.kty!=="RSA"||typeof k.n!=="string"||k.n.length<500||k.n.length>600||k.e!=="AQAB"||k.alg!=="RSA-OAEP-256"||encrypted.length<100||encrypted.length>10000||!/^[A-Za-z0-9+/]+=*$/.test(encrypted)||!/^[A-Za-z0-9+/]{16}$/.test(iv)||!/^[A-Za-z0-9+/]{22}==$/.test(salt)||!Number.isInteger(iterations)||iterations<100000||iterations>2000000)return fail("invalid_key_bundle","The encryption recovery bundle is invalid.",400);
  const existing=await env.TC.prepare("SELECT user_id FROM tc_chat_user_keys WHERE user_id=?").bind(user.id).first();
  if(existing)return fail("key_bundle_exists","An encryption recovery key is already registered for this account.",409);
  const timestamp=now();
  await env.TC.prepare("INSERT INTO tc_chat_user_keys(user_id,public_key_jwk,encrypted_private_key,private_key_iv,salt,kdf_iterations,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(user.id,JSON.stringify(k),encrypted,iv,salt,iterations,timestamp,timestamp).run();
  return json({success:true},201);
 }
 if(path==="/api/keys"&&method==="GET"){
  const ids=[...new Set((url.searchParams.get("user_ids")||"").split(",").map(x=>x.trim()).filter(Boolean))];
  if(!ids.length||ids.length>10||ids.some(x=>x.length>128))return fail("invalid_key_request","Request encryption keys for 1 to 10 users.",400);
  const marks=ids.map(()=>"?").join(",");
  const rows=await env.TC.prepare("SELECT k.user_id AS id,k.public_key_jwk FROM tc_chat_user_keys k JOIN users u ON u.id=k.user_id WHERE u.status='active' AND k.user_id IN ("+marks+")").bind(...ids).all();
  return json({keys:(rows.results||[]).map(x=>({id:String(x.id),public_key:JSON.parse(x.public_key_jwk)}))});
 }
 if(path==="/api/directory"&&method==="GET"){
  const q=(url.searchParams.get("q")||"").trim().slice(0,32);if(q.length<2)return json({users:[]});
  const rows=await env.TC.prepare("SELECT u.id,u.username,CASE WHEN u.last_heartbeat_at IS NOT NULL AND julianday('now')-julianday(u.last_heartbeat_at)<(90.0/86400.0) THEN 1 ELSE 0 END AS is_online FROM users u WHERE u.status='active' AND u.id<>? AND u.username LIKE ? COLLATE NOCASE AND NOT EXISTS(SELECT 1 FROM tc_chat_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)) ORDER BY u.username COLLATE NOCASE LIMIT 25").bind(user.id,"%"+q+"%",user.id,user.id).all();
  return json({users:rows.results||[]});
 }
 if(path==="/api/conversations"&&method==="GET"){
  const rows=await env.TC.prepare("SELECT c.id,c.type,c.title,c.created_at,c.updated_at,(SELECT 'Encrypted message' FROM tc_chat_messages m WHERE m.conversation_id=c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS last_message,(SELECT m.created_at FROM tc_chat_messages m WHERE m.conversation_id=c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,(SELECT COUNT(*) FROM tc_chat_participants p2 WHERE p2.conversation_id=c.id) AS participant_count FROM tc_chat_conversations c JOIN tc_chat_participants p ON p.conversation_id=c.id WHERE p.user_id=? ORDER BY COALESCE(last_message_at,c.updated_at) DESC LIMIT 100").bind(user.id).all();
  const conversations=rows.results||[];
  for(const c of conversations){const people=await env.TC.prepare("SELECT u.id,u.username,CASE WHEN u.last_heartbeat_at IS NOT NULL AND julianday('now')-julianday(u.last_heartbeat_at)<(90.0/86400.0) THEN 1 ELSE 0 END AS is_online FROM tc_chat_participants p JOIN users u ON u.id=p.user_id WHERE p.conversation_id=? ORDER BY u.username COLLATE NOCASE").bind(c.id).all();c.participants=people.results||[]}
  return json({conversations});
 }
 if(path==="/api/conversations"&&method==="POST"){
  let body;try{body=await request.json()}catch{return fail("invalid_json","The request body must be valid JSON.",400)}
  const requested=Array.isArray(body?.participant_ids)?body.participant_ids.map(String):[],ids=[...new Set([user.id,...requested])];
  if(ids.length<2||ids.length>10||ids.some(x=>x.length>128))return fail("invalid_participants","A conversation must include 2 to 10 users.",400);
  const marks=ids.map(()=>"?").join(",");
  const eligible=await env.TC.prepare("SELECT id FROM users WHERE id IN ("+marks+") AND status='active'").bind(...ids).all();
  if((eligible.results||[]).length!==ids.length)return fail("participant_unavailable","Every participant must have an active Social account.",404);
  const keys=await env.TC.prepare("SELECT user_id FROM tc_chat_user_keys WHERE user_id IN ("+marks+")").bind(...ids).all();
  if((keys.results||[]).length!==ids.length)return fail("encryption_setup_required","Every participant must complete encryption setup before starting a conversation.",409);
  for(const other of ids.filter(x=>x!==user.id))if(await blocked(env,user.id,other))return fail("user_unavailable","This conversation cannot be created because a participant has restricted contact.",403);
  const type=ids.length===2?"direct":"group";
  if(type==="direct"){const existing=await env.TC.prepare("SELECT c.id FROM tc_chat_conversations c JOIN tc_chat_participants p1 ON p1.conversation_id=c.id AND p1.user_id=? JOIN tc_chat_participants p2 ON p2.conversation_id=c.id AND p2.user_id=? WHERE c.type='direct' LIMIT 1").bind(ids[0],ids[1]).first();if(existing)return json({conversation_id:existing.id,existing:true})}
  const cid=makeId(),timestamp=now(),title=type==="group"&&typeof body?.title==="string"?body.title.trim().slice(0,80):null;
  await env.TC.prepare("INSERT INTO tc_chat_conversations(id,service_tag,type,title,created_by,created_at,updated_at) VALUES(?,'TC',?,?,?,?,?)").bind(cid,type,title||null,user.id,timestamp,timestamp).run();
  const insert=env.TC.prepare("INSERT INTO tc_chat_participants(conversation_id,user_id,joined_at) VALUES(?,?,?)");
  await env.TC.batch(ids.map(pid=>insert.bind(cid,pid,timestamp)));
  return json({conversation_id:cid,existing:false},201);
 }
 if(migrationMatch&&method==="POST"){
  const [,cid,mid]=migrationMatch,conversation=await participant(env,cid,user.id);
  if(!conversation)return fail("conversation_not_found","This conversation is unavailable.",404);
  let body;try{body=await request.json()}catch{return fail("invalid_json","The request body must be valid JSON.",400)}
  const payload=typeof body?.encrypted_payload==="string"?body.encrypted_payload:"";
  if(!payload||payload.length>30000)return fail("encrypted_message_required","The replacement must be encrypted on your device.",400);
  let envelope;try{envelope=JSON.parse(payload)}catch{return fail("invalid_envelope","The encrypted message envelope is invalid.",400)}
  if(envelope?.version!==1||envelope?.algorithm!=="RSA-OAEP-256+A256GCM"||typeof envelope.iv!=="string"||typeof envelope.ciphertext!=="string"||!envelope.wrapped_keys||typeof envelope.wrapped_keys!=="object"||Array.isArray(envelope.wrapped_keys))return fail("invalid_envelope","The encrypted message envelope is invalid.",400);
  const participants=await env.TC.prepare("SELECT user_id FROM tc_chat_participants WHERE conversation_id=?").bind(cid).all(),ids=(participants.results||[]).map(x=>String(x.user_id));
  if(ids.length<2||Object.keys(envelope.wrapped_keys).length!==ids.length||ids.some(id=>typeof envelope.wrapped_keys[id]!=="string"))return fail("missing_recipient_key","The replacement must be encrypted for every participant.",400);
  const updated=await env.TC.prepare("UPDATE tc_chat_messages SET body='',encrypted_payload=? WHERE id=? AND conversation_id=? AND encrypted_payload IS NULL AND deleted_at IS NULL").bind(payload,mid,cid).run();
  if(!updated.meta?.changes){const existing=await env.TC.prepare("SELECT encrypted_payload FROM tc_chat_messages WHERE id=? AND conversation_id=? AND deleted_at IS NULL").bind(mid,cid).first();if(existing?.encrypted_payload)return json({success:true,already_encrypted:true});return fail("message_not_migratable","This message is unavailable.",409)}
  return json({success:true});
 }
 const match=path.match(/^\/api\/conversations\/([a-f0-9-]+)\/messages$/i);
 if(match){
  const cid=match[1],conversation=await participant(env,cid,user.id);if(!conversation)return fail("conversation_not_found","This conversation is unavailable.",404);
  if(method==="GET"){
   const before=url.searchParams.get("before"),beforeId=url.searchParams.get("before_id"),limit=Math.min(Math.max(Number(url.searchParams.get("limit")||50),1),100);
   const query=before&&beforeId?env.TC.prepare("SELECT m.id,m.sender_id,u.username AS sender_username,m.body,m.encrypted_payload,m.created_at,m.edited_at FROM tc_chat_messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=? AND m.deleted_at IS NULL AND (m.created_at<? OR (m.created_at=? AND m.id<?)) ORDER BY m.created_at DESC,m.id DESC LIMIT ?").bind(cid,before,before,beforeId,limit):before?env.TC.prepare("SELECT m.id,m.sender_id,u.username AS sender_username,m.body,m.encrypted_payload,m.created_at,m.edited_at FROM tc_chat_messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=? AND m.deleted_at IS NULL AND m.created_at<? ORDER BY m.created_at DESC,m.id DESC LIMIT ?").bind(cid,before,limit):env.TC.prepare("SELECT m.id,m.sender_id,u.username AS sender_username,m.body,m.encrypted_payload,m.created_at,m.edited_at FROM tc_chat_messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=? AND m.deleted_at IS NULL ORDER BY m.created_at DESC,m.id DESC LIMIT ?").bind(cid,limit);
   const rows=await query.all();await env.TC.prepare("UPDATE tc_chat_participants SET last_read_at=? WHERE conversation_id=? AND user_id=?").bind(now(),cid,user.id).run();
   return json({conversation,messages:(rows.results||[]).reverse()});
  }
  if(method==="POST"){
   let body;try{body=await request.json()}catch{return fail("invalid_json","The request body must be valid JSON.",400)}
   const payload=typeof body?.encrypted_payload==="string"?body.encrypted_payload:"";
   if(!payload||payload.length>30000)return fail("encrypted_message_required","Messages must be encrypted on your device before sending.",400);
   let envelope;try{envelope=JSON.parse(payload)}catch{return fail("invalid_envelope","The encrypted message envelope is invalid.",400)}
   if(envelope?.version!==1||envelope?.algorithm!=="RSA-OAEP-256+A256GCM"||typeof envelope.iv!=="string"||typeof envelope.ciphertext!=="string"||!envelope.wrapped_keys||typeof envelope.wrapped_keys!=="object"||Array.isArray(envelope.wrapped_keys))return fail("invalid_envelope","The encrypted message envelope is invalid.",400);
   const p=await env.TC.prepare("SELECT user_id FROM tc_chat_participants WHERE conversation_id=?").bind(cid).all(),ids=(p.results||[]).map(x=>String(x.user_id)),wrapped=Object.keys(envelope.wrapped_keys).sort();
   if(ids.length<2||wrapped.length!==ids.length||ids.some(id=>typeof envelope.wrapped_keys[id]!=="string"||!wrapped.includes(id)))return fail("missing_recipient_key","The message must be encrypted for every conversation participant.",400);
   for(const other of ids.filter(x=>x!==user.id)){const active=await env.TC.prepare("SELECT 1 AS ok FROM users WHERE id=? AND status='active'").bind(other).first();if(!active||await blocked(env,user.id,other))return fail("recipient_unavailable","A participant is no longer available for this conversation.",403)}
   const mid=makeId(),timestamp=now();
   await env.TC.prepare("INSERT INTO tc_chat_messages(id,conversation_id,sender_id,body,encrypted_payload,created_at) VALUES(?,?,?,'',?,?)").bind(mid,cid,user.id,payload,timestamp).run();
   await env.TC.prepare("UPDATE tc_chat_conversations SET updated_at=? WHERE id=?").bind(timestamp,cid).run();
   return json({message:{id:mid,sender_id:user.id,sender_username:user.username,body:"",encrypted_payload:payload,created_at:timestamp}},201);
  }
 }
 return fail("method_not_allowed","This messaging method is not supported.",405);
}
