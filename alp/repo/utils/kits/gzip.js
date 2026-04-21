// utils/kits/gzip.js - Gzip compression kit
const re = /^GZ64(?:\("([^"]*)"\))?:/;

const stream = async (compress, data) => {
  const s = new Blob([data]).stream().pipeThrough(new (compress ? CompressionStream : DecompressionStream)('gzip'));
  const chunks = []; for (const r = s.getReader();;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
  const u8 = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0; for (const c of chunks) { u8.set(c, o); o += c.length; }
  return u8;
};

const gzip = async (text, label) => {
  const hdr = label ? `GZ64("${label}"):` : 'GZ64:';
  return hdr + btoa(String.fromCharCode(...await stream(true, new TextEncoder().encode(text))));
};

gzip.compress = gzip;

gzip.decompress = async str => new TextDecoder().decode(await stream(false, new Uint8Array(atob(str.replace(re, '')).split('').map(c => c.charCodeAt(0)))));

gzip.detect = str => {
  const m = str.match(re);
  return m ? { alg: 'gzip', label: m[1] ?? null, prefixLen: m[0].length } : null;
};

gzip.findChunks = str => {
  const chunks = [], r = /GZ64(?::|\("([^"]*)"\):)([A-Za-z0-9+/=]+)/g;
  let m; while ((m = r.exec(str))) chunks.push({ alg: 'gzip', label: m[1] ?? null, start: m.index, end: m.index + m[0].length, text: m[0] });
  return chunks;
};

gzip.sizeOf = async text => (await stream(true, new TextEncoder().encode(text))).length;

export { gzip };
