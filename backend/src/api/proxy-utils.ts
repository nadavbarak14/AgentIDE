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

/** Clean Set-Cookie headers — only strip Domain and Secure so cookies work over HTTP proxy */
export function cleanSetCookieHeaders(setCookieHeaders: string | string[] | undefined): string[] {
  if (!setCookieHeaders) return [];
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return headers.map((cookie) => {
    let c = cookie;
    c = c.replace(/;\s*domain\s*=[^;]*/i, '');
    c = c.replace(/;\s*secure/i, '');
    if (/samesite\s*=\s*none/i.test(c)) {
      c = c.replace(/;\s*samesite\s*=\s*[^;]*/i, '; SameSite=Lax');
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

  // Inject a URL rewriter script that intercepts fetch, XHR, URL constructor,
  // location.assign/replace, navigation, and dynamic elements
  const urlRewriter = `<script>(function(){
var b="${proxyBase}";
function rw(u){if(typeof u!=="string")return u;if(u.startsWith("/")&&!u.startsWith(b)&&!u.startsWith("//"))return b+u;var o=window.location.origin;if(u.length>o.length+1&&u.startsWith(o+"/")&&!u.startsWith(o+b))return o+b+u.slice(o.length);return u}
try{var OU=window.URL;var proxyRe=/\\/api\\/sessions\\/[^\\/]+\\/proxy\\/\\d+/;
window.URL=new Proxy(OU,{construct:function(T,args){
if(args.length>=2&&typeof args[0]==="string"&&args[0].startsWith("/")&&!args[0].startsWith("//")){
var s=args[1]!=null?(args[1] instanceof T?args[1].href:String(args[1])):"";
var m=s.match(proxyRe);if(m&&!args[0].startsWith(m[0]))args[0]=m[0]+args[0]}
return new T(args[0],args[1])},apply:function(T,t,args){return T.apply(t,args)}})}catch(e){}
try{var oLA=location.assign.bind(location);location.assign=function(u){return oLA(rw(u))}}catch(e){}
try{var oLR=location.replace.bind(location);location.replace=function(u){return oLR(rw(u))}}catch(e){}
var oF=window.fetch;window.fetch=function(u,o){return oF.call(this,rw(u),o)};
var oX=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){return oX.apply(this,[m,rw(u)].concat([].slice.call(arguments,2)))};
var oPS=history.pushState.bind(history);history.pushState=function(s,t,u){return oPS(s,t,u?rw(u):u)};
var oRS=history.replaceState.bind(history);history.replaceState=function(s,t,u){return oRS(s,t,u?rw(u):u)};
function rwEl(el){if(!el||el.nodeType!==1)return;
if(el.hasAttribute&&el.hasAttribute("data-c3-bridge"))return;
var tag=el.tagName;if(!tag)return;
var attrs=tag==="A"?["src","action"]:["src","href","action"];
attrs.forEach(function(a){var v=el.getAttribute(a);
if(!v)return;var rwd=rw(v);if(rwd!==v)el.setAttribute(a,rwd)});
if(el.children)for(var i=0;i<el.children.length;i++)rwEl(el.children[i])}
var oAppend=Node.prototype.appendChild;
Node.prototype.appendChild=function(c){rwEl(c);return oAppend.call(this,c)};
var oInsert=Node.prototype.insertBefore;
Node.prototype.insertBefore=function(c,r){rwEl(c);return oInsert.call(this,c,r)};
var oAppendEl=Element.prototype.append;
if(oAppendEl)Element.prototype.append=function(){for(var i=0;i<arguments.length;i++)if(arguments[i]&&arguments[i].nodeType)rwEl(arguments[i]);return oAppendEl.apply(this,arguments)};
var oSetAttr=Element.prototype.setAttribute;
Element.prototype.setAttribute=function(a,v){
if((a==="src"||a==="action"||(a==="href"&&this.tagName!=="A"))&&typeof v==="string")return oSetAttr.call(this,a,rw(v));
return oSetAttr.call(this,a,v)};
document.addEventListener("click",function(e){if(e.defaultPrevented)return;
var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;
var h=a.getAttribute("href");
if(h&&h.startsWith("/")&&!h.startsWith(b)&&!h.startsWith("//")){e.preventDefault();location.assign(b+h)}});
new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){rwEl(n)})})}).observe(document.documentElement,{childList:true,subtree:true});
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
  // Insert URL rewriter right after <head> so it runs before any resources load
  if (rewritten.includes('<head>')) {
    rewritten = rewritten.replace('<head>', '<head>' + urlRewriter);
  } else if (rewritten.includes('<head ')) {
    rewritten = rewritten.replace(/<head\s[^>]*>/, '$&' + urlRewriter);
  } else {
    rewritten = urlRewriter + rewritten;
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
