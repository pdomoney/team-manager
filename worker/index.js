// Cloudflare Worker entrypoint. /api routes are never static or browser-trusted.
// Environment bindings are configured only after separate staging authorisation.
import {handleStage1Request} from './stage1-api.js';
import {handleStage2PlayRequest} from './stage2-play-api.js';

export default {
  async fetch(request, env) {
    const path=new URL(request.url).pathname;
    if (path.startsWith('/api/stage1/')) return handleStage1Request(request,env);
    if (path.startsWith('/api/stage2/')) return handleStage2PlayRequest(request,env);
    if (!env?.ASSETS?.fetch) return new Response('Service unavailable',{status:503});
    return env.ASSETS.fetch(request);
  }
};
