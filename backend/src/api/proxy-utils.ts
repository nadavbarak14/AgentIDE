import net from 'node:net';
import zlib from 'node:zlib';

const BRIDGE_VERSION = '6';
export const BRIDGE_SCRIPT_TAG = `<script src="/api/inspect-bridge.js?v=${BRIDGE_VERSION}" data-c3-bridge></script>`;

/** Decompress a buffer based on content-encoding */
export function decompressBuffer(buf: Buffer, encoding: string): Buffer {
  if (encoding.includes('gzip')) return Buffer.from(zlib.gunzipSync(buf));
  if (encoding.includes('br')) return Buffer.from(zlib.brotliDecompressSync(buf));
  if (encoding.includes('deflate')) return Buffer.from(zlib.inflateSync(buf));
  return buf;
}

/** Clean Set-Cookie headers — strip Domain/Secure, optionally rewrite Path to proxy base */
export function cleanSetCookieHeaders(setCookieHeaders: string | string[] | undefined, proxyBase?: string): string[] {
  if (!setCookieHeaders) return [];
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return headers.map((cookie) => {
    let c = cookie;
    c = c.replace(/;\s*domain\s*=[^;]*/i, '');
    c = c.replace(/;\s*secure/i, '');
    if (/samesite\s*=\s*none/i.test(c)) {
      c = c.replace(/;\s*samesite\s*=\s*[^;]*/i, '; SameSite=Lax');
    }
    // Rewrite cookie Path so the browser sends cookies back through the proxy
    if (proxyBase) {
      if (/;\s*path\s*=/i.test(c)) {
        c = c.replace(/;\s*path\s*=\s*[^;]*/i, `; Path=${proxyBase}/`);
      } else {
        c += `; Path=${proxyBase}/`;
      }
    }
    return c;
  });
}

/**
 * Rewrite url() path references in CSS to go through the proxy.
 * Handles url(/path), url('/path'), url("/path") — only rewrites absolute paths
 * not already under the proxy base.
 */
export function rewriteCssForProxy(css: string, proxyBase: string): string {
  return css.replace(
    /url\(\s*(["']?)(\/(?!\/)[^)'"]*)\1\s*\)/gi,
    (match, quote, url) => {
      if (url.startsWith(proxyBase)) return match;
      return `url(${quote}${proxyBase}${url}${quote})`;
    },
  );
}

/** Rewrite absolute paths in HTML to go through the proxy, and inject a fetch/XHR interceptor */
export function rewriteHtmlForProxy(html: string, proxyBase: string): string {
  // Rewrite src="/..." and action="/..." attributes (but not "//..." protocol-relative)
  // NOTE: We intentionally do NOT rewrite href on <a> tags — React hydration
  // would see a mismatch between server HTML (rewritten) and client render (original).
  // Next.js Link components handle navigation client-side via our URL/history patches.
  let rewritten = html.replace(
    /((?:src|action)\s*=\s*)(["'])\/(?!\/)(.*?)\2/gi,
    `$1$2${proxyBase}/$3$2`,
  );
  // Rewrite href only on <link> elements (CSS, preload, icons — need proxy paths to load)
  rewritten = rewritten.replace(
    /(<link\b[^>]*?\bhref\s*=\s*)(["'])\/(?!\/)(.*?)\2/gi,
    `$1$2${proxyBase}/$3$2`,
  );

  // Rewrite JSON URLs inside <script> tags (e.g. Next.js RSC payloads)
  // Handles both \"/_next/...\" and ["/_next/..."] patterns
  rewritten = rewritten.replace(
    /\\"\/(_next\/[^"\\]*)\\"/g,
    `\\"${proxyBase}/$1\\"`,
  );
  rewritten = rewritten.replace(
    /\["\/(_next\/[^"]*?)"/g,
    `["${proxyBase}/$1"`,
  );

  // Expose proxy base so SPA frameworks (React Router etc.) can use it as basename
  const proxyBaseScript = `<script>window.__c3ProxyBase__="${proxyBase}";</script>`;

  // Inject a URL rewriter script that intercepts fetch, XHR, URL constructor,
  // location.assign/replace, navigation, and dynamic elements
  const urlRewriter = `<script>(function(){
var b="${proxyBase}";
function rw(u){if(typeof u!=="string")return u;if(u.startsWith("/")&&!u.startsWith(b)&&!u.startsWith("//"))return b+u;var o=window.location.origin;if(u.length>o.length+1&&u.startsWith(o+"/")&&!u.startsWith(o+b))return o+b+u.slice(o.length);return u}
// Helper: strip proxy prefix from a path (for headers sent to the server)
function stripProxy(u){if(typeof u!=="string")return u;if(u.startsWith(b+"/"))return u.slice(b.length);if(u===b)return"/";return u}
try{var OU=window.URL;var proxyRe=/\\/api\\/sessions\\/[^\\/]+\\/proxy\\/\\d+/;
window.URL=new Proxy(OU,{construct:function(T,args){
if(args.length>=2&&typeof args[0]==="string"&&args[0].startsWith("/")&&!args[0].startsWith("//")){
var s=args[1]!=null?(args[1] instanceof T?args[1].href:String(args[1])):"";
var m=s.match(proxyRe);if(m&&!args[0].startsWith(m[0]))args[0]=m[0]+args[0]}
return new T(args[0],args[1])},apply:function(T,t,args){return T.apply(t,args)}})}catch(e){}
try{var oLA=location.assign.bind(location);location.assign=function(u){return oLA(rw(u))}}catch(e){}
try{var oLR=location.replace.bind(location);location.replace=function(u){return oLR(rw(u))}}catch(e){}
var oX=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){return oX.apply(this,[m,rw(u)].concat([].slice.call(arguments,2)))};
var oPS=history.pushState.bind(history);var _c3Nav=null;
history.pushState=function(s,t,u){if(u&&_c3Nav){var up=stripProxy(typeof u==="string"?u:"");if(up===_c3Nav)_c3Nav=null}return oPS(s,t,u?rw(u):u)};
var oRS=history.replaceState.bind(history);history.replaceState=function(s,t,u){return oRS(s,t,u?rw(u):u)};
var oF=window.fetch;window.fetch=function(u,o){
var hdrs=(o&&o.headers)?o.headers:(u&&typeof u==="object"&&u.headers)?u.headers:null;
if(hdrs){if(hdrs instanceof Headers){if(hdrs.has("Next-URL"))hdrs.set("Next-URL",stripProxy(hdrs.get("Next-URL")))}
else if(typeof hdrs==="object"&&hdrs!==null){if(hdrs["Next-URL"])hdrs["Next-URL"]=stripProxy(hdrs["Next-URL"])}}
var ir=false;if(hdrs){if(hdrs instanceof Headers)ir=hdrs.has("RSC")||hdrs.has("rsc");else if(typeof hdrs==="object")ir=!!hdrs.RSC||!!hdrs.rsc}
var oo=o;
if(ir){if(o&&o.signal){oo=Object.assign({},o);delete oo.signal}
if(typeof u==="object"&&u.signal&&!(oo&&oo.signal===null)){oo=oo||{};oo.signal=null}}
var furl=typeof u==="string"?u:(u&&typeof u==="object")?(u.href||u.url||""):"";
var p=oF.call(this,typeof u==="string"?rw(u):u,oo);
if(ir){
var tp=stripProxy(furl.split("?")[0].replace(window.location.origin,""));var cp=stripProxy(window.location.pathname);
var navTarget=(tp&&tp!==cp)?tp:null;
if(navTarget)_c3Nav=navTarget;
p=p.then(function(r){var rd=r.headers.get("x-proxy-redirect");
if(rd){_c3Nav=null;setTimeout(function(){var pp=b+rd;if(window.location.pathname!==pp)oPS({},"",pp)},0)}
else if(navTarget&&_c3Nav===navTarget){setTimeout(function(){if(_c3Nav===navTarget){var np=stripProxy(window.location.pathname);_c3Nav=null;if(np!==navTarget){oPS({},"",b+navTarget);window.dispatchEvent(new PopStateEvent("popstate",{state:{}}))}}},50)}
return r});
if(navTarget){setTimeout(function(){if(_c3Nav===navTarget){var np=stripProxy(window.location.pathname);_c3Nav=null;if(np!==navTarget){oPS({},"",b+navTarget);window.dispatchEvent(new PopStateEvent("popstate",{state:{}}))}}},3000)}
}
return p};
var oSetAttr=Element.prototype.setAttribute;
Element.prototype.setAttribute=function(a,v){
if((a==="src"||a==="action"||(a==="href"&&this.tagName!=="A"))&&typeof v==="string")return oSetAttr.call(this,a,rw(v));
return oSetAttr.call(this,a,v)};
document.addEventListener("click",function(e){if(e.defaultPrevented)return;
var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;
var h=a.getAttribute("href");
if(h&&h.startsWith("/")&&!h.startsWith(b)&&!h.startsWith("//")){e.preventDefault();location.assign(b+h)}});
var OWS=window.WebSocket;
window.WebSocket=new Proxy(OWS,{construct:function(T,args){
var wu=args[0]||"";
if(wu.indexOf("/_next/")!==-1||wu.indexOf("webpack-hmr")!==-1||wu.indexOf("turbopack")!==-1||wu.indexOf("__nextjs")!==-1){
var dummy=new EventTarget();
dummy.readyState=3;dummy.send=function(){};dummy.close=function(){};
dummy.onopen=null;dummy.onclose=null;dummy.onerror=null;dummy.onmessage=null;
dummy.url=wu;dummy.protocol="";dummy.extensions="";dummy.bufferedAmount=0;dummy.binaryType="blob";
dummy.CONNECTING=0;dummy.OPEN=1;dummy.CLOSING=2;dummy.CLOSED=3;
return dummy}
return new T(args[0],args[1])}});
})()</script>`;

  // Strip <meta> CSP tags from proxied HTML — they'd block our injected scripts
  rewritten = rewritten.replace(/<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi, '');

  // Note: we no longer strip HMR client scripts — Turbopack's HMR client
  // doubles as the chunk loading runtime. Without it, client components
  // can't load and React hydration fails. Instead, we patch WebSocket
  // in the urlRewriter to silently drop HMR connections.

  rewritten = injectBridgeScript(rewritten);
  // Insert URL rewriter + proxy base var right after <head> so they run before any resources load
  const headInject = proxyBaseScript + urlRewriter;
  if (rewritten.includes('<head>')) {
    rewritten = rewritten.replace('<head>', '<head>' + headInject);
  } else if (rewritten.includes('<head ')) {
    rewritten = rewritten.replace(/<head\s[^>]*>/, '$&' + headInject);
  } else {
    rewritten = headInject + rewritten;
  }

  return rewritten;
}

/** Inject the inspect-bridge script before </head> in an HTML document */
export function injectBridgeScript(html: string): string {
  if (html.includes('</head>')) {
    return html.replace('</head>', BRIDGE_SCRIPT_TAG + '</head>');
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', BRIDGE_SCRIPT_TAG + '</body>');
  }
  return html + BRIDGE_SCRIPT_TAG;
}

/**
 * Check if an IP address is private/internal (SSRF protection).
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (link-local / cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts[0] === 0) return true;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // ::1 (loopback)
    if (lower === '::1') return true;
    // fd00::/8 (unique local)
    if (lower.startsWith('fd')) return true;
    // fe80::/10 (link-local)
    if (lower.startsWith('fe80')) return true;
    // ::ffff:127.x.x.x (IPv4-mapped loopback)
    if (lower.startsWith('::ffff:127.')) return true;
  }
  return false;
}

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html', '.htm': 'text/html',
  '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.json': 'application/json', '.xml': 'application/xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/plain',
  '.ts': 'text/plain', '.tsx': 'text/plain', '.jsx': 'text/plain',
};
