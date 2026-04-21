// utils/kits/brotli.js - Brotli compression kit
let mod;
const load = async () => mod ??= await import('https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module').then(m => m.default);
const re = /^BR64(?:\("([^"]*)"\))?:/;

const brotli = async (text, label) => {
  const m = await load();
  const hdr = label ? `BR64("${label}"):` : 'BR64:';
  return hdr + btoa(String.fromCharCode(...m.compress(new TextEncoder().encode(text))));
};

brotli.compress = brotli;

brotli.decompress = async str => {
  const m = await load();
  return new TextDecoder().decode(m.decompress(new Uint8Array(atob(str.replace(re, '')).split('').map(c => c.charCodeAt(0)))));
};

brotli.detect = str => {
  const m = str.match(re);
  return m ? { alg: 'brotli', label: m[1] ?? null, prefixLen: m[0].length } : null;
};

brotli.findChunks = str => {
  const chunks = [], r = /BR64(?::|\("([^"]*)"\):)([A-Za-z0-9+/=]+)/g;
  let m; while ((m = r.exec(str))) chunks.push({ alg: 'brotli', label: m[1] ?? null, start: m.index, end: m.index + m[0].length, text: m[0] });
  return chunks;
};

export { brotli };
