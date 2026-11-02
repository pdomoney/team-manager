// Published GitHub Pages site is a development sandbox until production
// environment approval. Local CI keeps its legacy encrypted-login tests; opt
// into sandbox acceptance tests with ?sandbox=1.
// No query string can disable the sandbox on the public development site.
export function developmentSandbox({hostname='',pathname='',search=''}={}) {
  if(hostname==='pdomoney.github.io' && (pathname==='/team-manager'||pathname.startsWith('/team-manager/')))return true;
  return new URLSearchParams(search).get('sandbox')==='1';
}
