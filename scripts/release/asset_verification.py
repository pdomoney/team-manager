"""Offline-tested candidate for the consolidated release verifier.
No deployment, credentials, database or recovery operations. Only public GETs
through an injected transport, with exact candidate-manifest byte comparison.
Unexpected HTML modification stays HOLD even if the original bytes are recovered.
"""
from dataclasses import dataclass
from hashlib import sha256
from urllib.parse import urlsplit, urljoin
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
import re
import json

MAX_BYTES=16*1024*1024
HEX=re.compile(r'^[0-9a-f]{64}$')
EXTRA=re.compile(rb'<script\b[^>]*>[^<]*</script\s*>',re.I)
SRC=re.compile(rb'\bsrc\s*=\s*(["\'])(.*?)\1',re.I)

def digest(data): return sha256(data).hexdigest()

def origin_of(url):
    p=urlsplit(url)
    return (p.scheme,p.netloc)

@dataclass(frozen=True)
class Reply:
    status: int
    url: str
    headers: dict
    body: bytes

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None

def public_get(url):
    opener=build_opener(NoRedirect())
    req=Request(url,headers={'Cache-Control':'no-cache','User-Agent':'TeamManager-release-verifier/2'})
    try: res=opener.open(req,timeout=20)
    except HTTPError as exc: res=exc
    with res:
        body=res.read(MAX_BYTES+1)
        return Reply(res.code,res.geturl(),{k.lower():v for k,v in res.headers.items()},body)

def classify(origin,path,expected,transport=public_get):
    if not isinstance(expected,str) or not HEX.fullmatch(expected): raise ValueError('invalid expected digest')
    if not isinstance(path,str) or not re.fullmatch(r'/[a-zA-Z0-9._/-]+',path) or any(p in ('.','..') for p in path.split('/')) or path.startswith('//'):
        raise ValueError('invalid asset path')
    base=origin.rstrip('/')
    canonical=path[:-5] if path.endswith('.html') else path
    url=base+path
    result={'path':path,'outcome':'HOLD','expected_sha256':expected,'redirected':False}
    try:
        res=transport(url)
        if res.url!=url:
            result.update(reason='UNEXPECTED_TRANSPORT_URL');return result
        if res.status in (301,302,303,307,308):
            target=urljoin(url,res.headers.get('location',''))
            if path==canonical or target!=base+canonical or origin_of(target)!=origin_of(base):
                result.update(http_status=res.status,reason='UNAPPROVED_REDIRECT');return result
            result['redirected']=True
            res=transport(target)
            if res.url!=target:
                result.update(reason='UNEXPECTED_TRANSPORT_URL');return result
        result.update(http_status=res.status,ray_id=res.headers.get('cf-ray'),content_type=res.headers.get('content-type','').split(';')[0])
        if res.status!=200:
            result.update(reason='EDGE_OR_TRANSPORT_DENIAL' if res.status in (403,429,503) else 'HTTP_STATUS_UNEXPECTED');return result
        if len(res.body)>MAX_BYTES:
            result.update(reason='RESPONSE_TOO_LARGE');return result
        actual=digest(res.body);result['actual_sha256']=actual
        if actual==expected:
            result.update(outcome='PASS',reason='EXACT_BYTES');return result
        if path.endswith('.html') and result['content_type']=='text/html':
            # Narrow classification only: at most one opaque same-origin script.
            # Never approve the script, fetch it, execute it or ignore other differences.
            candidates=[]
            for tag in EXTRA.finditer(res.body):
                src=SRC.search(tag.group())
                if not src: continue
                try:
                    src_url=urljoin(res.url,src.group(2).decode('ascii'))
                    p=urlsplit(src_url)
                    if origin_of(src_url)==origin_of(base) and len(p.path)>100:
                        candidates.append(tag)
                except (UnicodeError,ValueError): continue
            result['opaque_script_count']=len(candidates)
            if len(candidates)==1:
                tag=candidates[0]; stripped=res.body[:tag.start()]+res.body[tag.end():]
                result['stripped_sha256']=digest(stripped)
                if result['stripped_sha256']==expected:
                    result.update(reason='ORIGINAL_BYTES_RECOVERED_SCRIPT_PROVENANCE_HOLD');return result
        result.update(reason='BYTE_MISMATCH');return result
    except (OSError,URLError,TimeoutError,ValueError,TypeError,KeyError) as exc:
        result.update(reason='TRANSPORT_OR_RESPONSE_ERROR',error_type=type(exc).__name__);return result

def verify_all(origin,expected,transport=public_get):
    if urlsplit(origin).scheme!='https' or urlsplit(origin).path not in ('','/') or urlsplit(origin).query or urlsplit(origin).fragment or urlsplit(origin).username:
        raise ValueError('approved HTTPS origin required')
    if not expected: raise ValueError('empty asset inventory')
    # Validate complete inventory before any request.
    for p,h in expected.items():
        if not isinstance(h,str) or not HEX.fullmatch(h) or not isinstance(p,str) or not re.fullmatch(r'/[a-zA-Z0-9._/-]+',p) or p.startswith('//') or any(s in ('.','..') for s in p.split('/')):raise ValueError('invalid asset inventory')
    results=[classify(origin,p,h,transport) for p,h in sorted(expected.items())]
    passed=sum(r['outcome']=='PASS' for r in results)
    return {'status':'PASS' if passed==len(results) else 'HOLD','passed':passed,'total':len(results),'assets':results}

def browser_code(origin,expected):
    """Generate self-contained paste-ready JS, no Python import or clipboard prerequisite.
    One JSON result, no session credentials, same-origin canonical routes only.
    Does not execute opaque script content or accept a transformed HTML response.
    """
    config=json.dumps({'origin':origin.rstrip('/'),'expected':expected},ensure_ascii=True)
    return '''(async()=>{\nconst cfg='''+config+''';
if(location.origin!==cfg.origin) throw Error('Open the approved Team Manager origin');
const hex=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');
const assets=[];
for(const [path,expected] of Object.entries(cfg.expected)){
 const row={path,expected,outcome:'HOLD'};
 try{
  const canonical=path.endsWith('.html')?path.slice(0,-5):path;
  const r=await fetch(canonical,{credentials:'omit',cache:'no-store',redirect:'error'});
  row.status=r.status;row.url=r.url;row.rayId=r.headers.get('cf-ray');
  const bytes=await r.arrayBuffer();row.actual=await hex(bytes);
  if(r.status===200&&r.url===cfg.origin+canonical&&row.actual===expected){row.outcome='PASS';row.reason='EXACT_BYTES';}
  else if(r.status===200&&r.url===cfg.origin+canonical&&path.endsWith('.html')){
   const html=new TextDecoder().decode(bytes);
   const candidates=[...html.matchAll(/<script\\b[^>]*>[^<]*<\\/script\\s*>/gi)].filter(m=>{const s=m[0].match(/\\bsrc\\s*=\\s*["']([^"']+)["']/i);if(!s)return false;try{const u=new URL(s[1],r.url);return u.origin===cfg.origin&&u.pathname.length>100;}catch{return false;}});
   row.opaqueScriptCount=candidates.length;
   if(candidates.length===1){const m=candidates[0];row.stripped=await hex(new TextEncoder().encode(html.slice(0,m.index)+html.slice(m.index+m[0].length)));}
   row.reason=row.stripped===expected?'ORIGINAL_BYTES_RECOVERED_SCRIPT_PROVENANCE_HOLD':'BYTE_MISMATCH';
  }else{row.reason=r.status===200?'BYTE_MISMATCH':'HTTP_STATUS_UNEXPECTED';}
 }catch(e){row.reason='TRANSPORT_ERROR';row.errorType=e.name;}
 assets.push(row);
}
let anonymousAuth={expectedDenial:false};
try{const r=await fetch('/api/stage3d5/v1/team',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:'{}'});const j=await r.json().catch(()=>null);anonymousAuth={status:r.status,code:j?.code??'NO_RECOGNISED_JSON',expectedDenial:r.status===401&&j?.ok===false&&j?.code==='unauthenticated'&&j.canProceed===false};}catch(e){anonymousAuth.errorType=e.name;}
const passed=assets.filter(a=>a.outcome==='PASS').length;
console.log(JSON.stringify({status:passed===assets.length&&anonymousAuth.expectedDenial?'PASS':'HOLD',passed,total:assets.length,anonymousAuth,assets},null,2));
})();\n'''
