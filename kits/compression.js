// kits/compression.js — Brotli/Gzip/Acorn wrappers + bookmarklet packer.
//
// Salvaged and consolidated from Alp's kits (utils/kits/{brotli,gzip,acorn,
// text}.js — see archive/alp/repo/utils/kits/ for the originals). Reshaped
// to a single gh.load-compatible script with no ES module syntax. All third-
// party libraries are loaded lazily via dynamic await import() inside
// functions, so no top-level imports.
//
// After loading:
//   window.compression.brotli  → { compress, decompress, detect, findChunks }
//   window.compression.gzip    → { compress, decompress, detect, findChunks, sizeOf }
//   window.compression.acorn   → { parse, isJS }
//   window.compression.text    → { detectCompressionType, findCompressedChunks,
//                                  templates, assess, pack, process }
//
// brotli/gzip use a "BR64:" / "GZ64:" prefix protocol (with optional label)
// to mark base64-encoded compressed payloads. text.process drives the full
// compression-helper.html UI: assess input, optionally compress, optionally
// pack as a `javascript:` bookmarklet that decompresses on click.

(() => {
  // ============== BROTLI ==============
  let brotliMod;
  const loadBrotli = async () =>
    brotliMod ??= await import('https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module').then(m => m.default);
  const brRe = /^BR64(?:\("([^"]*)"\))?:/;

  const brotli = async (text, label) => {
    const m = await loadBrotli();
    const hdr = label ? `BR64("${label}"):` : 'BR64:';
    return hdr + btoa(String.fromCharCode(...m.compress(new TextEncoder().encode(text))));
  };
  brotli.compress = brotli;
  brotli.decompress = async str => {
    const m = await loadBrotli();
    return new TextDecoder().decode(
      m.decompress(new Uint8Array(atob(str.replace(brRe, '')).split('').map(c => c.charCodeAt(0))))
    );
  };
  brotli.detect = str => {
    const m = str.match(brRe);
    return m ? { alg: 'brotli', label: m[1] ?? null, prefixLen: m[0].length } : null;
  };
  brotli.findChunks = str => {
    const chunks = [];
    const r = /BR64(?::|\("([^"]*)"\):)([A-Za-z0-9+/=]+)/g;
    let m;
    while ((m = r.exec(str))) {
      chunks.push({ alg: 'brotli', label: m[1] ?? null, start: m.index, end: m.index + m[0].length, text: m[0] });
    }
    return chunks;
  };

  // ============== GZIP ==============
  const gzRe = /^GZ64(?:\("([^"]*)"\))?:/;

  const gzStream = async (compress, data) => {
    const s = new Blob([data]).stream().pipeThrough(
      new (compress ? CompressionStream : DecompressionStream)('gzip')
    );
    const chunks = [];
    for (const r = s.getReader();;) {
      const { done, value } = await r.read();
      if (done) break;
      chunks.push(value);
    }
    const u8 = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
    let o = 0;
    for (const c of chunks) { u8.set(c, o); o += c.length; }
    return u8;
  };

  const gzip = async (text, label) => {
    const hdr = label ? `GZ64("${label}"):` : 'GZ64:';
    return hdr + btoa(String.fromCharCode(...await gzStream(true, new TextEncoder().encode(text))));
  };
  gzip.compress = gzip;
  gzip.decompress = async str => new TextDecoder().decode(
    await gzStream(false, new Uint8Array(atob(str.replace(gzRe, '')).split('').map(c => c.charCodeAt(0))))
  );
  gzip.detect = str => {
    const m = str.match(gzRe);
    return m ? { alg: 'gzip', label: m[1] ?? null, prefixLen: m[0].length } : null;
  };
  gzip.findChunks = str => {
    const chunks = [];
    const r = /GZ64(?::|\("([^"]*)"\):)([A-Za-z0-9+/=]+)/g;
    let m;
    while ((m = r.exec(str))) {
      chunks.push({ alg: 'gzip', label: m[1] ?? null, start: m.index, end: m.index + m[0].length, text: m[0] });
    }
    return chunks;
  };
  gzip.sizeOf = async text => (await gzStream(true, new TextEncoder().encode(text))).length;

  // ============== ACORN ==============
  let acornMod;
  const acorn = async () =>
    acornMod ??= await import('https://unpkg.com/acorn@8.11.3/dist/acorn.mjs');
  acorn.parse = async (text, opts) => (await acorn()).parse(text, { ecmaVersion: 2022, ...opts });
  acorn.isJS = async text => { try { await acorn.parse(text); return true; } catch { return false; } };

  // ============== TEXT (composes the above) ==============
  const text = {};

  text.detectCompressionType = str => brotli.detect(str) || gzip.detect(str);
  text.findCompressedChunks = str =>
    [...brotli.findChunks(str), ...gzip.findChunks(str)].sort((a, b) => a.start - b.start);

  // Bookmarklet decompression/exec snippets, parameterized by prefix length
  // and popup option. Used by text.pack() to build self-contained
  // `javascript:` URLs that decompress and execute their payload.
  text.templates = {
    brotliDecomp: n => `const m=await(await import('https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module')).default;const b=atob(s.slice(${n}));const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);const d=new TextDecoder().decode(m.decompress(a));`,
    gzipDecomp:   n => `const d=new TextDecoder().decode(new Uint8Array(await new Response(new Blob([Uint8Array.from(atob(s.slice(${n})),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()));`,
    jsExec:       () => 'eval(d)',
    htmlExec:     popup => `const w=window.open('','_blank'${popup ? ",'width=800,height=600'" : ""});w.document.write(d);w.document.close()`,
  };

  text.assess = async input => {
    const det = text.detectCompressionType(input);
    const raw = det?.alg === 'brotli' ? await brotli.decompress(input)
              : det?.alg === 'gzip'   ? await gzip.decompress(input)
              :                          input;
    const isJavaScript = await acorn.isJS(raw);
    const br = await brotli(raw);
    const gz = await gzip(raw);
    return {
      raw,
      isCompressed: !!det,
      compAlg: det?.alg ?? null,
      isJavaScript,
      sizes: { raw: raw.length, brotli: br.length, gzip: gz.length }
    };
  };

  text.pack = (content, { isJavaScript = false, popup = false } = {}) => {
    const det = text.detectCompressionType(content);
    const mkResult = packingSegments => ({
      packingSegments,
      output: packingSegments.map(s => s.v).join('')
    });

    if (det) {
      const decomp = det.alg === 'brotli' ? text.templates.brotliDecomp(det.prefixLen)
                                          : text.templates.gzipDecomp(det.prefixLen);
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

  text.process = async (input, { compressed = true, packed = true, alg = 'brotli', popup = false, label = '' } = {}) => {
    const info = await text.assess(input);

    let work;
    if (info.isCompressed) {
      work = compressed ? input : info.raw;
    } else {
      work = compressed
        ? (alg === 'gzip' ? await gzip(info.raw, label) : await brotli(info.raw, label))
        : info.raw;
    }

    const base = { ...info, outAlg: alg };

    if (!packed) {
      const packingSegments = [{ t: 'payload', v: work }];
      return { ...base, packingSegments, output: work, outSize: work.length };
    }

    const parcel = text.pack(work, { isJavaScript: info.isJavaScript, popup });
    return { ...base, ...parcel, outSize: parcel.output.length };
  };

  // ============== REGISTER ==============
  window.compression = { brotli, gzip, acorn, text };
})();
