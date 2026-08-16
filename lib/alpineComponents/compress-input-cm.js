document.addEventListener('alpine:init', function() {
  Alpine.data('compressInputCm', function(opts) {
    opts = opts || {};
    const ns = opts.path || 'compress-helper';
    const PATH_INPUT = ns + '.input';
    const PATH_SEL   = ns + '.sel';

    const { tip } = window.html;
    const typeBadge = tip(
      ['bottom', 'xs'],
      `<span class="badge badge-sm badge-neutral" x-text="inputType"></span>`,
      `<strong>Detected: <span x-text="inputType"></span></strong>
       <div class="mt-2 flex flex-col gap-1">
         <div :class="inputKind === 'compressed' && 'font-bold'">• Compressed: BR64: / GZ64: prefix</div>
         <div :class="inputKind === 'dataUrl' && 'font-bold'">• Data URL: data: scheme</div>
         <div :class="inputKind === 'js' && 'font-bold'">• JavaScript: parses as JS</div>
         <div :class="inputKind === 'text' && 'font-bold'">• Text/HTML: fallback</div>
       </div>
       <template x-if="inputKind === 'dataUrl' && inputDetails">
         <div class="mt-2 pt-2 border-t border-base-300 flex flex-col gap-1">
           <div>Media: <span x-text="inputDetails.mediaType"></span></div>
           <div>Encoding: <span x-text="inputDetails.encoding"></span></div>
           <div>Body size: <span x-text="inputDetails.bodySize + ' bytes'"></span></div>
           <div x-show="inputDetails.seed">Seed: <span x-text="inputDetails.seed?.alg"></span></div>
         </div>
       </template>`
    );

    return {
      description: 'CodeMirror input panel for the compression helper with selection chunks',

      template: `
        <div class="absolute inset-0 flex flex-col">
          <div class="flex flex-wrap items-center gap-2 mb-2 flex-none">
            <b>Input</b>
            ${typeBadge}
            <div class="flex-1"></div>
            <button class="btn btn-xs" :class="sel ? 'btn-primary' : 'btn-ghost opacity-50'"
              x-text="sel ? 'Selection ('+sel.start+'-'+sel.end+')' : 'Selection'"></button>
            <template x-for="c in chunks">
              <button @click="selectChunk(c)" class="btn btn-xs"
                :class="sel && sel.start===c.start && sel.end===c.end ? 'btn-primary' : 'btn-ghost'"
                x-text="c.label ? (c.alg==='brotli'?'BR64':'GZ64')+'(\\''+c.label+'\\')' : (c.alg==='brotli'?'BR64':'GZ64')+'('+c.start+'-'+c.end+')'"></button>
            </template>
            <button @click="clearSelection" class="btn btn-xs btn-ghost" :class="!sel && 'opacity-50'">Clear</button>
            <button @click="isWrapped=!isWrapped" class="btn btn-xs btn-ghost" title="Toggle wrap">
              <i :class="isWrapped ? 'ph ph-text-aa' : 'ph ph-text-t'"></i>
            </button>
          </div>
          <div x-ref="editor"
            class="flex-1 min-h-0 w-full text-xs rounded-box border border-base-300 overflow-hidden bg-base-100
                   [&_.cm-editor]:h-full [&_.cm-editor]:outline-none
                   [&_.cm-scroller]:overflow-auto [&_.cm-scroller]:font-mono
                   [&_.cm-gutters]:bg-base-200/30 [&_.cm-gutters]:border-none"></div>
        </div>`,

      input: '',
      sel: null,
      chunks: [],
      isWrapped: true,
      inputType: 'Text/HTML',
      inputKind: 'text',
      inputDetails: null,

      cm: null,
      view: null,
      _currentLang: null,

      init() {
        this.$root.__compressInput = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });

        (async () => {
          const { messaging, persistence, compression } = window;

          const v = await persistence.load(PATH_INPUT);
          if (v) {
            if ('input' in v) this.input = v.input;
            if ('isWrapped' in v) this.isWrapped = v.isWrapped;
          }

          await new Promise(r => this.$nextTick(r));
          await this.mountEditor();

          this.chunks = compression.text.findCompressedChunks(this.input);
          await this.detectType();

          messaging.publish(PATH_INPUT, 'change', this.input);

          this.$watch('input', () => {
            this.chunks = compression.text.findCompressedChunks(this.input);
            this.detectType();
            this.saveInput();
            messaging.publish(PATH_INPUT, 'change', this.input);
          });
          this.$watch('isWrapped', () => {
            this.applyWrap();
            this.saveInput();
          });
        })();
      },

      async mountEditor() {
        if (!window.cm6) {
          console.error('compressInputCm: window.cm6 is missing — gh.load("kits/cm6.js") before this component');
          return;
        }

        this.cm = await cm6.create(this.$refs.editor, {
          value: this.input,
          language: 'plain',
          wrap: this.isWrapped,
          setup: 'basic',
          onChange: (text) => { this.input = text; },
          onSelection: (sel) => {
            this.sel = sel;
            this.detectType();
            window.messaging.publish(PATH_SEL, 'change', this.sel);
          }
        });
        this.view = this.cm.view;
      },

      applyWrap() {
        this.cm?.setWrap(this.isWrapped);
      },

      applyLanguage(kind) {
        if (!this.cm || this._currentLang === kind) return;
        this._currentLang = kind;
        this.cm.setLanguage(kind === 'js' ? 'js' : kind === 'html' ? 'html' : 'plain');
      },

      async saveInput() {
        await window.persistence.save(PATH_INPUT, { input: this.input, isWrapped: this.isWrapped });
      },

      async detectType() {
        const { compression } = window;
        const effective = this.sel?.text || this.input;
        const trimmed = effective.trim();

        if (compression.text.detectCompressionType(trimmed)) {
          this.inputKind = 'compressed';
          this.applyLanguage('plain');
        } else if (trimmed.startsWith('data:')) {
          this.inputKind = 'dataUrl';
          this.applyLanguage('plain');
        } else if (await compression.acorn.isJS(effective)) {
          this.inputKind = 'js';
          this.applyLanguage('js');
        } else {
          this.inputKind = 'text';
          this.applyLanguage('html');
        }

        this.inspect();
        return { kind: this.inputKind, label: this.inputType };
      },

      // Cheap, per-keystroke wrapper sniff for the badge. Mirrors the layer
      // taxonomy of compression.text.assess but does no decompression — assess
      // runs in the output pane where the cost is paid once per process().
      inspect() {
        const { compression } = window;
        const effective = this.sel?.text || this.input;
        const trimmed = effective.trim();

        if (this.inputKind === 'compressed') {
          const det = compression.text.detectCompressionType(trimmed);
          this.inputDetails = det;
          this.inputType = `Compressed (${det.alg === 'brotli' ? 'Brotli' : 'Gzip'})`;
        } else if (this.inputKind === 'dataUrl') {
          const parsed = compression.text.fromDataUrl(trimmed);
          if (parsed) {
            const header = trimmed.slice(5, trimmed.indexOf(','));
            const encoding = header.split(';').includes('base64') ? 'base64' : 'urlencoded';
            const seed = parsed.seed ? compression.text.detectCompressionType(parsed.seed) : null;
            this.inputDetails = {
              mediaType: parsed.mediaType,
              encoding,
              params: parsed.params,
              bodySize: parsed.body.length,
              seed,
            };
            const bits = [parsed.mediaType];
            if (seed) bits.push(`+${seed.alg} seed`);
            this.inputType = `Data URL (${bits.join(', ')})`;
          } else {
            this.inputDetails = null;
            this.inputType = 'Data URL (invalid)';
          }
        } else if (this.inputKind === 'js') {
          this.inputDetails = null;
          this.inputType = 'JavaScript';
        } else {
          this.inputDetails = null;
          this.inputType = 'Text/HTML';
        }

        return this.inputDetails;
      },

      selectChunk(c) {
        if (!this.view) return;
        this.view.focus();
        this.view.dispatch({
          selection: { anchor: c.start, head: c.end },
          scrollIntoView: true
        });
      },

      clearSelection() {
        if (!this.view) return;
        const pos = this.view.state.selection.main.from;
        this.view.dispatch({ selection: { anchor: pos, head: pos } });
      }
    };
  });
});
