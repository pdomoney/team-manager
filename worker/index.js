// Cloudflare Worker entrypoint. /api routes are never static or browser-trusted.
// Environment bindings are configured only after separate staging authorisation.
import {handleStage1Request} from './stage1-api.js';
import {handleStage2PlayRequest} from './stage2-play-api.js';
import {handleStage3Onboarding} from './stage3-onboarding-api.js';
import {handleStage3D3Registration,stage3D3PolicyGate} from './stage3d3-registration.js';
import {handleStage3D4Owner} from './stage3d4-owner-api.js';

export default {
  async fetch(request, env) {
    const path=new URL(request.url).pathname;
    // Only the separately named staging Worker uses this management-only gate.
    // Do not remove or rewrite the accepted E5 demo or its saved plays.
    if(env?.STAGE3C_MODE==='management-only'){
      if(path==='/'&&request.method==='GET')
        return new Response(null,{status:302,headers:{
          'Location':'/cloud-access.html','Cache-Control':'no-store'}});
      if(path==='/index.html'||path.startsWith('/data/')||
        path.startsWith('/api/stage2/'))
        return new Response('Not available in management staging',{status:404,
          headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    // Existing-Worker first-team activation preserves the legacy static app
    // while keeping Stage 4 play API out of the connected adult-only trial.
    // The historic Worker and demo have no new mode flag until approved install.
    if(env?.STAGE3D3_EXISTING_SHARED_WORKER_MODE==='preserve-legacy-pages'&&
       path.startsWith('/api/stage2/'))
      return new Response('Not available in first-team management activation',{
        status:404,headers:{'Cache-Control':'no-store',
          'X-Content-Type-Options':'nosniff'}});
    if(path.startsWith('/api/stage3d4/')) return handleStage3D4Owner(request,env);
    if(path.startsWith('/api/stage3d3/')) return handleStage3D3Registration(request,env);
    if(path.startsWith('/api/stage1/')||path.startsWith('/api/stage3b/')||
       path.startsWith('/api/stage3/')){
      const denied=await stage3D3PolicyGate(request,env);
      if(denied)return denied;
    }
    if (path.startsWith('/api/stage1/')) return handleStage1Request(request,env);
    if (path.startsWith('/api/stage3b/')) return handleStage1Request(request,env);
    if (path.startsWith('/api/stage2/')) return handleStage2PlayRequest(request,env);
    if (path.startsWith('/api/stage3/')) return handleStage3Onboarding(request,env);
    if (path.startsWith('/api/')) return new Response(
      JSON.stringify({ok:false,code:'not-found'}),{status:404,
        headers:{'Content-Type':'application/json; charset=utf-8',
          'Cache-Control':'no-store'}});
    if (!env?.ASSETS?.fetch) return new Response('Service unavailable',{status:503});
    return env.ASSETS.fetch(request);
  }
};
