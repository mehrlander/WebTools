// A reusable file drop target. It takes files three ways (drag-drop,
// click-to-browse, paste), reads each to an ArrayBuffer, and hands the result
// to the host without owning what happens next: it dispatches a `drop-file`
// CustomEvent (and calls an optional onFile callback) carrying the File plus
// its bytes, then forgets. The host decides — stage it, commit it, preview it.
//
// Mount with config via the factory arg:
//
//   <div x-data="dropZone({ accept: '.json,.md', maxSize: 1048576 })"
//        @drop-file="handle($event.detail)"></div>
//
// Config (all optional): accept (comma list of extensions like '.json' or mime
// globs like 'image/*'; '' = any), maxSize (bytes; 0 = unlimited), multiple
// (take every file in one gesture, else the first), pasteText (surface pasted
// text with no file — the stage-format paste path; default on), idle/hint
// (the two lines of resting copy), onFile (a callback run in addition to the
// event). The event/callback detail is { file, buf, bytes, name, size, type }
// for a file, or { text, name:'', size, type:'text/plain' } for pasted text.

document.addEventListener('alpine:init', function() {
  Alpine.data('dropZone', function(opts) {
    const cfg = opts || {};
    return {
      description: 'Reusable file drop target: drag-drop, click-to-browse, and paste; emits a drop-file event carrying the File plus its ArrayBuffer, without owning what happens next',

      // --- config ---
      accept: cfg.accept || '',
      maxSize: cfg.maxSize || 0,
      multiple: !!cfg.multiple,
      pasteText: cfg.pasteText !== false,
      idle: cfg.idle || 'Drop a file here',
      hint: cfg.hint || 'or click to browse, or paste',
      onFile: typeof cfg.onFile === 'function' ? cfg.onFile : null,

      // --- state ---
      hot: false,          // drag hovering: the visual cue
      status: '',          // last message, success or rejection
      statusKind: '',      // 'ok' | 'error' | ''
      last: null,          // { name, size } of the last accepted file

      template: `
        <div
          x-ref="zone" tabindex="0" role="button" :aria-label="idle"
          @click="$refs.file.click()"
          @keydown.enter.prevent="$refs.file.click()"
          @keydown.space.prevent="$refs.file.click()"
          @dragenter.prevent="hot = true"
          @dragover.prevent
          @dragleave.prevent="hot = false"
          @drop.prevent="onDrop($event)"
          @paste="onPaste($event)"
          :class="hot ? 'border-primary bg-primary/10' : 'border-base-300 bg-base-100 hover:border-primary/50'"
          class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40">
          <div class="pointer-events-none flex flex-col items-center">
            <i class="ph text-4xl" :class="hot ? 'ph-file-arrow-down text-primary' : 'ph-upload-simple opacity-50'"></i>
            <p class="mt-3 text-base font-medium" x-text="last ? last.name : idle"></p>
            <p class="mt-0.5 text-sm opacity-60" x-text="last ? fmtSize(last.size) : hint"></p>
            <!-- Errors and text pastes get their own line; a file's name+size
                 above already confirm it, so the success line stays hidden then. -->
            <p x-show="status && (statusKind === 'error' || !last)" x-cloak class="mt-1.5 text-sm"
               :class="statusKind === 'error' ? 'text-error' : 'text-success'" x-text="status"></p>
          </div>
          <input type="file" x-ref="file" class="hidden"
                 :accept="accept" :multiple="multiple" @change="onBrowse($event)">
        </div>`,

      init() {
        this.$root.__dropZone = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
      },

      fmtSize(n) {
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(1) + ' MB';
      },

      // Gate one File. Returns '' when acceptable, else the reason to show.
      reject(file) {
        if (this.maxSize && file.size > this.maxSize)
          return file.name + ' is ' + this.fmtSize(file.size) + ' (limit ' + this.fmtSize(this.maxSize) + ')';
        if (this.accept && !this.matchesAccept(file))
          return file.name + ' is not an accepted type';
        return '';
      },
      matchesAccept(file) {
        const pats = this.accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (!pats.length) return true;
        const name = (file.name || '').toLowerCase();
        const mime = (file.type || '').toLowerCase();
        return pats.some(p =>
          p.startsWith('.') ? name.endsWith(p) :
          p.endsWith('/*') ? mime.startsWith(p.slice(0, -1)) :
          mime === p);
      },

      // A FileList from a drop, browse, or file-paste. Honor `multiple`.
      take(files) {
        const list = [...files];
        if (!list.length) return;
        (this.multiple ? list : list.slice(0, 1)).forEach(f => this.emitFile(f));
      },

      async emitFile(file) {
        const bad = this.reject(file);
        if (bad) return this.fail(bad);
        let buf;
        try { buf = await file.arrayBuffer(); }
        catch { return this.fail('Could not read ' + file.name); }
        this.last = { name: file.name, size: file.size };
        this.ok(this.fmtSize(file.size));
        this.emit({ file, buf, bytes: new Uint8Array(buf), name: file.name, size: file.size, type: file.type });
      },

      // Pasted text with no file: surface it when pasteText is on. The stage
      // format arrives this way (a paste of raw refs, not a file).
      emitText(text) {
        if (!this.pasteText || !text) return false;
        this.last = null;
        this.ok('Pasted ' + text.length + ' chars');
        this.emit({ text, name: '', size: text.length, type: 'text/plain' });
        return true;
      },

      emit(detail) {
        if (this.onFile) { try { this.onFile(detail); } catch (e) { console.error(e); } }
        this.$root.dispatchEvent(new CustomEvent('drop-file', { bubbles: true, detail }));
      },

      onDrop(e) {
        this.hot = false;
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) this.take(files);
      },
      onPaste(e) {
        const cd = e.clipboardData;
        if (!cd) return;
        if (cd.files && cd.files.length) { e.preventDefault(); return this.take(cd.files); }
        const text = cd.getData('text');
        if (text && this.emitText(text)) e.preventDefault();
      },
      onBrowse(e) {
        const input = e.target;
        if (input.files && input.files.length) this.take(input.files);
        input.value = '';   // let the same file re-trigger a change next time
      },

      fail(msg) { this.status = msg; this.statusKind = 'error'; },
      ok(msg) { this.status = msg; this.statusKind = 'ok'; }
    };
  });
});
