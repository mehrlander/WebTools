// io.js — user data in and out of the page: file picker, file download, blob
// preview, and the clipboard. JSZip loads lazily, only when saveZip is called.
// Exposes window.io; documented in lib/kits/README.md.
(() => {
  let jszipMod;

  const loadZip = async () => {
    if (typeof JSZip !== 'undefined') return JSZip;
    jszipMod ??= await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm').then(m => m.default);
    return jszipMod;
  };

  const triggerDownload = (blob, filename) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 150);
  };

  const pickFile = (accept) => new Promise((resolve, reject) => {
    const f = Object.assign(document.createElement('input'), { type: 'file', accept });
    f.onchange = () => f.files[0] ? resolve(f.files[0]) : reject(new Error('No file selected'));
    f.oncancel = () => reject(new Error('Cancelled'));
    f.click();
  });

  let copyAbort = null;
  let pasteAbort = null;

  const fallbackCopy = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    const success = document.execCommand('copy');
    document.body.removeChild(ta);
    return success;
  };

  // THE TEXTAREA PASTE, and the one rule it has to follow: READ THE VALUE, do
  // not ask execCommand whether it worked. On iOS `execCommand('paste')`
  // returns false and pastes anyway, because the actual read happens behind the
  // edit-menu pill the platform puts up; gating on the return value meant every
  // iOS paste resolved null and surfaced as "Paste unavailable in this
  // context", which is a sentence about the browser rather than about what
  // happened. The recipe is the ios-clipboard skill's, which was measured on a
  // device rather than reasoned about.
  //
  // The attributes each earn their keep: the element must be focusable, so
  // display:none and visibility:hidden are out and offscreen-plus-transparent
  // is in; `inputmode="none"` keeps the soft keyboard down; and it must NOT be
  // readonly, which focuses fine and then pastes empty. The nested timeouts let
  // focus settle and the paste land before the read.
  //
  // Empty resolves as null rather than '', so a caller can tell "nothing came
  // back" from "the clipboard holds an empty string" and fall through honestly.
  const fallbackPaste = () => new Promise((resolve) => {
    const ta = document.createElement('textarea');
    ta.setAttribute('inputmode', 'none');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    setTimeout(() => {
      document.execCommand('paste');
      setTimeout(() => {
        const value = ta.value;
        ta.remove();
        resolve(value || null);
      }, 50);
    }, 0);
  });

  const io = {
    pick: async (accept = '*/*') => (await pickFile(accept)).arrayBuffer(),

    pickText: async (accept = '.txt,.json,.csv') => (await pickFile(accept)).text(),

    save: (data, filename = 'download.bin', type = 'application/octet-stream') => {
      const blob = data instanceof Blob ? data : new Blob([data], { type });
      triggerDownload(blob, filename);
    },

    saveJson: (data, filename = 'data.json', space = 2) => {
      const blob = new Blob([JSON.stringify(data, null, space)], { type: 'application/json' });
      triggerDownload(blob, filename);
    },

    saveZip: async (files, filename = 'archive.zip') => {
      const JSZip = await loadZip();
      const zip = new JSZip();

      const resolved = await Promise.all(files.map(async ({ path, data, url }) => ({
        path,
        content: data ?? await fetch(url).then(r => r.blob())
      })));
      for (const { path, content } of resolved) zip.file(path, content);

      triggerDownload(await zip.generateAsync({ type: 'blob' }), filename);
    },

    show: (data, type = 'application/pdf') => {
      const blob = data instanceof Blob ? data : new Blob([data], { type });
      window.open(URL.createObjectURL(blob), '_blank', 'width=1000,height=800,resizable');
    },

    copy: async (text) => {
      if (!document.hasFocus()) {
        if (copyAbort) copyAbort.abort();
        copyAbort = new AbortController();

        console.log("%c🖱️ Click the page document to copy...", "color: orange; font-weight: bold;");

        // Resolve the DEFERRED write's own answer, not `undefined`. Every
        // caller reads this as a boolean to decide whether to show a check or
        // a warning, so swallowing it made the one path that waits for a click
        // report failure on a copy that had just succeeded.
        return new Promise((resolve) => {
          document.addEventListener('click', async () => {
            copyAbort = null;
            resolve(await io.copy(text));
          }, { once: true, signal: copyAbort.signal });
        });
      }

      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          console.log("%c✅ Copied via Navigator API", "color: green; font-weight: bold;");
          return true;
        } catch (err) {}
      }

      if (fallbackCopy(text)) {
        console.log("%c✅ Copied via Legacy DOM", "color: green; font-weight: bold;");
        return true;
      } else {
        console.error("❌ Copy failed.");
        return false;
      }
    },

    paste: async () => {
      if (!document.hasFocus()) {
        if (pasteAbort) pasteAbort.abort();
        pasteAbort = new AbortController();

        console.log("%c🖱️ Click the page document to paste...", "color: orange; font-weight: bold;");

        return new Promise((resolve) => {
          document.addEventListener('click', async () => {
            pasteAbort = null;
            resolve(await io.paste());
          }, { once: true, signal: pasteAbort.signal });
        });
      }

      if (navigator.clipboard?.readText && window.isSecureContext) {
        try {
          const text = await navigator.clipboard.readText();
          console.log("%c✅ Pasted via Navigator API", "color: green; font-weight: bold;");
          return text;
        } catch (err) {}
      }

      const text = await fallbackPaste();
      if (text != null) {
        console.log("%c✅ Pasted via Legacy DOM", "color: green; font-weight: bold;");
        return text;
      }

      console.error("❌ Paste failed.");
      throw new Error('Paste unavailable in this context');
    },

    // EVERY FLAVOR ON THE CLIPBOARD, the async sibling of paste(). paste()
    // resolves to a string because readText() does, so a caller reaching for
    // the clipboard through a button could never see that one copy out of a
    // spreadsheet carries the cells, an HTML table, and a picture of the range
    // at once. A paste EVENT has always carried all three; only this path was
    // narrow, which is why a keyboard paste and a button paste behaved
    // differently for the same clipboard.
    //
    // Returns [{ kind: 'text'|'blob', type, text?, blob?, size }]. Falls back
    // to a single text/plain entry wherever read() is unavailable or refused,
    // so a caller never has to ask which path it got.
    pasteItems: async () => {
      if (navigator.clipboard?.read && window.isSecureContext) {
        try {
          const items = await navigator.clipboard.read();
          const out = [];
          for (const item of items) {
            for (const type of item.types) {
              try {
                const blob = await item.getType(type);
                if (/^text\//.test(type) || type === 'application/json') {
                  const text = await blob.text();
                  if (text) out.push({ kind: 'text', type, text, size: text.length });
                } else {
                  out.push({ kind: 'blob', type, blob, size: blob.size });
                }
              } catch {}
            }
          }
          if (out.length) return out;
        } catch (err) {}
      }
      const text = await io.paste();
      return text ? [{ kind: 'text', type: 'text/plain', text, size: text.length }] : [];
    }
  };

  window.io = io;
})();
