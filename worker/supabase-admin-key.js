// One privileged server-side Supabase key adapter. The newer sb_secret_*
// keys MUST be sent as apikey only. Legacy service_role JWTs require the
// Authorization header. Never send either value to a browser.
const NEW=/^sb_secret_[A-Za-z0-9_-]{10,160}$/;
const LEGACY=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export function adminHeaders(env){
  if(env?.SUPABASE_SECRET_KEY!==undefined){
    const key=env.SUPABASE_SECRET_KEY;
    return typeof key==='string'&&NEW.test(key)?{apikey:key}:null;
  }
  const key=env?.SUPABASE_SERVICE_ROLE_KEY;
  return typeof key==='string'&&LEGACY.test(key)?
    {apikey:key,Authorization:'Bearer '+key}:null;
}
export function isApprovedProjectConfig(env){
  let u;
  try{u=new URL(env?.SUPABASE_URL);}catch{return false;}
  return u.protocol==='https:'&&u.pathname==='/'&&!u.port&&
    !u.search&&!u.hash&&!u.username&&!u.password&&
    /^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)&&
    /^sb_publishable_[A-Za-z0-9_-]{10,160}$/.test(env?.SUPABASE_PUBLISHABLE_KEY||'')&&
    adminHeaders(env)!==null;
}
