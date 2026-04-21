// utils/kits/text.js - Text processing kit
import { brotli } from './brotli.js';
import { gzip } from './gzip.js';
import { acorn } from './acorn.js';

const text = {};

// Detection
text.detectCompressionType = str => brotli.detect(str) || gzip.detect(str);
text.findCompressedChunks = str => [...brotli.findChunks(str), ...gzip.findChunks(str)].sort((a, b) => a.start - b.start);

// Decompression templates for bookmarklet bootstrapping
text.templates = {
  brotliDecomp: n => `const m=await(await import('https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module')).default;const b=atob(s.slice(${n}));const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);const d=new TextDecoder().decode(m.decompress(a));`,
  gzipDecomp: n => `const d=new TextDecoder().decode(new Uint8Array(await new Response(new Blob([Uint8Array.from(atob(s.slice(${n})),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()));`,
  jsExec: () => 'eval(d)',
  htmlExec: popup => `const w=window.open('','_blank'${popup ? ",'width=800,height=600'" : ""});w.document.write(d);w.document.close()`,
};

// Analyze input without transforming
text.assess = async input => {
  const det = text.detectCompressionType(input);
  const raw = det?.alg === 'brotli' ? await brotli.decompress(input)
            : det?.alg === 'gzip' ? await gzip.decompress(input)
            : input;
  const isJavaScript = await acorn.isJS(raw);
  const br = await brotli(raw), gz = await gzip(raw);
  return {
    raw,
    isCompressed: !!det,
    compAlg: det?.alg ?? null,
    isJavaScript,
    sizes: { raw: raw.length, brotli: br.length, gzip: gz.length }
  };
};

// Wrap content in bookmarklet format
text.pack = (content, { isJavaScript = false, popup = false } = {}) => {
  const det = text.detectCompressionType(content);
  const mkResult = packingSegments => ({
    packingSegments,
    output: packingSegments.map(s => s.v).join('')
  });

  if (det) {
    const decomp = det.alg === 'brotli' ? text.templates.brotliDecomp(det.prefixLen) : text.templates.gzipDecomp(det.prefixLen);
    const exec = isJavaScript ? text.templates.jsExec() : text.templates.htmlExec(popup);
    return mkResult([
      { t: 'packing', v: `javascript:(async function(){const s='` },
      { t: 'payload', v: content },
      { t: 'packing', v: `';try{${decomp}console.log('Decompressed content:\\n',d);${exec}}catch(e){console.error(e)}})();` }
    ]);
  }

  if (isJavaScript) {
    return mkResult([
      { t: 'packing', v: 'javascript:(()=>{' },
      { t: 'payload', v: content },
      { t: 'packing', v: '})()' }
    ]);
  }

  const winOpts = popup ? ",'width=600,height=400'" : '';
  return mkResult([
    { t: 'packing', v: `javascript:(()=>{const w=window.open('','_blank'${winOpts});w.document.write(` },
    { t: 'payload', v: JSON.stringify(content) },
    { t: 'packing', v: ');w.document.close()})()' }
  ]);
};

// Full processing: takes UI state, returns everything the page needs
text.process = async (input, { compressed = true, packed = true, alg = 'brotli', popup = false, label = '' } = {}) => {
  const info = await text.assess(input);

  // Determine working content based on compression toggle
  let work;
  if (info.isCompressed) {
    work = compressed ? input : info.raw;
  } else {
    work = compressed ? (alg === 'gzip' ? await gzip(info.raw, label) : await brotli(info.raw, label)) : info.raw;
  }

  // Build result
  const base = { ...info, outAlg: alg };

  if (!packed) {
    const packingSegments = [{ t: 'payload', v: work }];
    return { ...base, packingSegments, output: work, outSize: work.length };
  }

  const parcel = text.pack(work, { isJavaScript: info.isJavaScript, popup });
  return { ...base, ...parcel, outSize: parcel.output.length };
};

export { text };
