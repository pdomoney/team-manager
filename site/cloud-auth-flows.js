// OAuth/PKCE is deliberately small and browser-only. No provider secrets or
// implicit grants: GoTrue authenticates, server RPCs independently authorise.
// One outstanding flow per session; overlapping tabs/flows fail closed.
const PENDING = 'tm-cloud-pkce-v1';
const MAX_AGE = 10 * 60 * 1000;
const PROVIDERS = new Set(['google', 'apple']);

export function safeAuthReturn(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('invalid-auth-return'); }
  if ((url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) ||
      !url.pathname.endsWith('/cloud-access.html') ||
      url.search || url.hash || url.username || url.password)
    throw new TypeError('invalid-auth-return');
  return url;
}

function encoded(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-')
    .replace(/\//g,'_').replace(/=+$/,'');
}

export function createPkceStore({storage,cryptoImpl,now=Date.now}={}) {
  if (!storage || typeof storage.getItem!=='function' ||
      typeof storage.setItem!=='function' ||
      typeof storage.removeItem!=='function')
    throw new TypeError('missing-pkce-storage');
  function clear() { storage.removeItem(PENDING); }
  async function begin({provider,redirectTo,kind='sign-in',expectedUserId=null}={}) {
    if (!PROVIDERS.has(provider) || !['sign-in','link'].includes(kind) ||
        (kind==='link' && !/^[0-9a-f-]{36}$/i.test(expectedUserId||'')))
      throw new TypeError('invalid-oauth-provider-or-mode');
    const returnUrl=safeAuthReturn(redirectTo);
    if (!cryptoImpl?.getRandomValues || !cryptoImpl?.subtle?.digest)
      throw new TypeError('secure-crypto-unavailable');
    if (storage.getItem(PENDING)) {
      try {
        const old=JSON.parse(storage.getItem(PENDING));
        if (Number.isSafeInteger(old.at) && now()-old.at<MAX_AGE)
          throw new TypeError('oauth-already-in-progress');
      } catch(e) {
        if (e.message==='oauth-already-in-progress') throw e;
      }
      clear();
    }
    const verifier=encoded(cryptoImpl.getRandomValues(new Uint8Array(32)));
    const hashed=await cryptoImpl.subtle.digest('SHA-256',
      new TextEncoder().encode(verifier));
    const challenge=encoded(new Uint8Array(hashed));
    storage.setItem(PENDING,JSON.stringify({
      verifier,provider,kind,expectedUserId,returnUrl:returnUrl.href,at:now()
    }));
    return Object.freeze({challenge,provider,kind,redirectTo:returnUrl.href});
  }
  function consume(callbackUrl) {
    let pending;
    try { pending=JSON.parse(storage.getItem(PENDING)||'null'); }
    catch { /* invalid source: reject */ }
    clear(); // Single use including errors and failed exchanges.
    const url=new URL(callbackUrl);
    if (!pending || !PROVIDERS.has(pending.provider) ||
        !['link','sign-in'].includes(pending.kind) ||
        !Number.isSafeInteger(pending.at) ||
        now()-pending.at<0 || now()-pending.at>MAX_AGE ||
        typeof pending.verifier!=='string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(pending.verifier) ||
        !pending.returnUrl ||
        url.origin!==new URL(pending.returnUrl).origin ||
        url.pathname!==new URL(pending.returnUrl).pathname ||
        (pending.kind==='link' &&
          !/^[0-9a-f-]{36}$/i.test(pending.expectedUserId||'')))
      throw new TypeError('missing-or-expired-oauth-request');
    return pending;
  }
  return Object.freeze({begin,consume,clear});
}

export function validOAuthDestination(value,provider) {
  let url;
  try {url=new URL(value);}catch{throw new TypeError('untrusted-oauth-destination');}
  if (url.protocol!=='https:' || url.username || url.password ||
      url.hash || !PROVIDERS.has(provider) ||
      !(provider==='google'
        ? url.hostname==='accounts.google.com'
        : url.hostname==='appleid.apple.com'))
    throw new TypeError('untrusted-oauth-destination');
  return url.href;
}
