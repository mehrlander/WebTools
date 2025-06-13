{
  name: 'Bookmarklet Transformer',
  icon: 'ph ph-code-simple-bold',
  content: function() {
    return `
      <div class="h-full p-6 overflow-y-auto" x-data="bookmarkletTransformer">
        <div class="max-w-4xl mx-auto">
          <div class="flex items-center gap-4 mb-4">
            <label class="flex items-center gap-2 text-sm">
              <span>Name:</span>
              <input x-model="bookmarkletName" type="text" class="input input-bordered input-sm" />
            </label>
            <a :href="bookmarkletOutput" class="link link-primary" draggable="true" x-text="bookmarkletName"></a>
            <div class="text-sm text-base-content/60 ml-auto" x-text="metrics"></div>
          </div>

          <div class="flex items-center gap-4 mb-2">
            <span class="font-bold">Output:</span>
            <div class="flex items-center gap-1 ml-auto">
              <!-- Compressed Toggle -->
              <button @click="compressed = !compressed" 
                      class="btn btn-ghost btn-sm btn-circle"
                      :title="compressed ? 'Compressed (Click to disable)' : 'Not Compressed (Click to enable)'">
                <i class="ph ph-archive text-lg" :class="compressed ? 'text-primary' : 'text-base-content/40'"></i>
              </button>

              <!-- Packed Toggle -->
              <button @click="packed = !packed" 
                      class="btn btn-ghost btn-sm btn-circle"
                      :title="packed ? 'Packed (Click to disable)' : 'Not Packed (Click to enable)'">
                <i class="ph ph-browsers text-lg" :class="packed ? 'text-primary' : 'text-base-content/40'"></i>
              </button>

              <select x-model="popupType" class="select select-sm select-bordered">
                <option value="Apply" x-show="inputType === 'JavaScript' || packed">Apply</option>
                <option value="Write">Write</option>
                <option value="Popup">Popup</option>
                <option value="New Tab">New Tab</option>
              </select>
              <button @click="copyOutput()" class="btn btn-ghost btn-sm btn-circle" :title="copyButtonText">
                <i class="ph text-lg" :class="copyButtonText === 'Copied!' ? 'ph-check text-success' : 'ph-copy text-base-content/60'"></i>
              </button>
            </div>
          </div>

          <textarea x-model="bookmarkletOutput" class="w-full h-32 p-3 font-mono text-sm border rounded bg-base-100 mb-4" readonly></textarea>

          <div class="flex items-center gap-4 mb-2 relative z-20">
            <span class="font-bold">Input:</span>
            <div class="dropdown dropdown-bottom" @click.away="$el.removeAttribute('open')">
              <div tabindex="0" role="button" class="badge badge-sm gap-1 cursor-pointer p-2 hover:opacity-80 text-xs"
                   :class="{
                     'badge-primary': inputType === 'JavaScript',
                     'badge-neutral': inputType === 'Text/HTML',
                     'badge-error': validationError
                   }">
                <span x-text="inputType"></span>
                <i class="ph ph-archive text-sm" x-show="compressedStates[inputType]"></i>
                <i class="ph ph-caret-down text-xs"></i>
              </div>
              <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-48 mt-2 z-50">
                <template x-for="type in contentTypes">
                  <li class="hover:bg-base-200 rounded">
                    <div class="flex items-center p-2 gap-2">
                      <span class="flex-1 text-sm select-none cursor-pointer whitespace-nowrap"
                            @click="setInputType(type); $el.closest('.dropdown').removeAttribute('open')"
                            x-text="type"></span>
                      <button class="btn btn-ghost btn-xs btn-circle"
                              @click.stop="toggleCompression(type)"
                              :title="compressedStates[type] ? 'Compressed (Click to disable)' : 'Not Compressed (Click to enable)'">
                        <i class="ph ph-archive text-sm" 
                           :class="compressedStates[type] ? 'text-primary' : 'text-base-content/40'"></i>
                      </button>
                    </div>
                  </li>
                </template>
              </ul>
            </div>
            <div x-show="validationMessage" class="text-sm ml-2 flex-1" :class="validationError ? 'text-error' : 'text-success'" x-text="validationMessage"></div>
            <div class="flex items-center gap-1 ml-auto">
              <!-- Detect Input Toggle -->
              <button @click="detectInput = !detectInput" 
                      class="btn btn-ghost btn-sm btn-circle"
                      :title="detectInput ? 'Auto-detect input type (Click to disable)' : 'Manual input type (Click to auto-detect)'">
                <i class="ph ph-lightning-a text-lg" :class="detectInput ? 'text-primary' : 'text-base-content/40'"></i>
              </button>

              <!-- Wrap Toggle -->
              <button @click="toggleWrap()" 
                      class="btn btn-ghost btn-sm btn-circle"
                      :title="isWrapped ? 'Text wrapped (Click to disable)' : 'Text not wrapped (Click to enable)'">
                <i class="ph ph-arrow-u-down-left text-lg" :class="isWrapped ? 'text-primary' : 'text-base-content/40'"></i>
              </button>
            </div>
          </div>

          <div class="relative z-10">
            <textarea 
              x-model="inputText" 
              @input="handleInput"
              class="w-full h-48 p-3 font-mono text-sm border rounded bg-base-100 relative z-10" 
              :style="{ 'white-space': isWrapped ? 'pre-wrap' : 'pre' }" 
              placeholder="Enter your code or text here..."></textarea>
          </div>
          
          <div class="text-xs text-base-content/50 mt-1 flex items-center gap-1">
            <i class="ph ph-info-circle"></i>
            <span>Compressed input uses BR64: prefix followed by base64-encoded Brotli data</span>
          </div>
        </div>
      </div>
    `;
  },
  init: function() {
    // Define the bookmarklet transformer Alpine component
    Alpine.data('bookmarkletTransformer', () => ({
      // State
      popupType: 'Write',
      bookmarkletName: 'Bookmarklet',
      inputText: '',
      bookmarkletOutput: '',
      metrics: '',
      contentTypes: ['Text/HTML', 'JavaScript'],
      compressedStates: {'Text/HTML': false, 'JavaScript': false},
      compressed: true,
      packed: true,
      detectInput: true,
      inputType: 'Text/HTML',
      validationMessage: '',
      validationError: false,
      copyButtonText: 'Copy',
      isWrapped: true,
      libs: {},
      updateTimeout: null,
      isInitialized: false,
      lastProcessedText: '',
      
      // Initialize
      async init() {
        await this.loadLibs();
        
        // Mark as initialized to prevent initial updates
        this.isInitialized = true;
        
        // Set up watchers only for control changes, not input text
        this.$watch('compressed', () => this.triggerUpdate());
        this.$watch('compressedStates', () => this.triggerUpdate(), { deep: true });
        this.$watch('packed', () => this.triggerUpdate());
        this.$watch('detectInput', () => this.triggerUpdate());
        this.$watch('popupType', () => this.triggerUpdate());
        this.$watch('inputType', () => this.triggerUpdate());
      },
      
      // Handle input changes manually
      handleInput() {
        clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => {
          //this.triggerUpdate();
        }, 300);
      },
      
      // Trigger update only if there's actual content and it has changed
      triggerUpdate() {
        if (!this.isInitialized) return;
        if (this.inputText.trim() !== this.lastProcessedText) {
          this.updateBookmarklet();
        }
      },
      
      // Load libraries
      async loadLibs() {
        if (!this.libs.brotli) {
          this.libs.brotli = await import('https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module').then(m => m.default);
          this.libs.acorn = await import('https://unpkg.com/acorn@8.11.3/dist/acorn.mjs');
        }
        return this.libs;
      },
      
      // Compression methods
      async compress(text) {
        const {brotli} = this.libs;
        try {
          return 'BR64:' + btoa(String.fromCharCode(...brotli.compress(new TextEncoder().encode(text))));
        } catch { 
          return text; 
        }
      },
      
      async decompress(text) {
        const {brotli} = this.libs;
        try {
          return new TextDecoder().decode(
            brotli.decompress(
              Uint8Array.from(atob(text.slice(5)), c => c.charCodeAt(0))
            )
          );
        } catch { 
          return null; 
        }
      },
      
      // JavaScript validation
      async validateJavaScript(text) {
        const {acorn} = this.libs;
        try { 
          acorn.parse(text, {ecmaVersion: 2022}); 
          return {isValid: true, error: null}; 
        } catch (e) { 
          return {isValid: false, error: e}; 
        }
      },
      
      // UI methods
      toggleCompression(type) { 
        this.compressedStates[type] = !this.compressedStates[type]; 
      },
      
      setInputType(type) { 
        this.inputType = type; 
        this.detectInput = false; 
      },
      
      toggleWrap() { 
        this.isWrapped = !this.isWrapped; 
      },
      
      copyOutput() {
        const btn = document.createElement('button');
        new ClipboardJS(btn, {text: () => this.bookmarkletOutput}).on('success', () => {
          this.copyButtonText = 'Copied!';
          setTimeout(() => this.copyButtonText = 'Copy', 2000);
        });
        btn.click();
      },
      
      // Main processing logic
      async processText(text, opts = {}) {
        const isBR = text.startsWith('BR64:');
        const raw = isBR ? await this.decompress(text) || text : text;
        const comp = isBR ? text : await this.compress(text);
        const work = opts.compressed ? comp : raw;
        const jsChk = await this.validateJavaScript(raw);
        const isJS = opts.forceType === 'JavaScript' || (opts.forceType !== 'Text/HTML' && jsChk.isValid);
        
        const data = {
          rawText: raw, 
          compressedText: comp, 
          isJavaScript: isJS,
          inputIsCompressed: isBR, 
          decompressionError: isBR && !raw ? new Error('Invalid') : null,
          jsParseError: isJS ? jsChk.error : null, 
          rawSize: raw.length,
          compressedSize: comp.length, 
          outputSize: work.length
        };
        
        if (!opts.packed) {
          return { output: work, ...data };
        }
        
        const actions = {
          Apply: isJS ? 'eval(d)' : "document.write(d);document.close()",
          Write: "document.write(d);document.close()",
          Popup: "const w=window.open('','_blank','width=600,height=400');w.document.write(d);w.document.close()",
          'New Tab': "const w=window.open('','_blank');w.document.write(d);w.document.close()"
        };
        
        if (work.startsWith('BR64:')) {
          const template = `javascript:(async function(){const s='${work}';try{const m=await(await import('https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module')).default;const b=atob(s.slice(5));const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);const d=new TextDecoder().decode(m.decompress(a));${actions[opts.mode]}}catch(e){console.error(e)}})();`;
          return { output: template, ...data };
        } else {
          const escaped = JSON.stringify(work);
          const templates = {
            Apply: `javascript:(()=>{${work}})()`,
            Write: `javascript:(()=>{document.write(${escaped});document.close()})()`,
            Popup: `javascript:(()=>{let w=window.open('','_blank','width=600,height=400');w.document.write(${escaped});w.document.close()})()`,
            'New Tab': `javascript:(()=>{let w=window.open('','_blank');w.document.write(${escaped});w.document.close()})()`
          };
          const output = isJS && opts.mode === 'Apply' ? templates.Apply : templates[opts.mode];
          return { output, ...data };
        }
      },
      
      // Update bookmarklet
      async updateBookmarklet() {
        const trimmedInput = this.inputText.trim();
        this.lastProcessedText = trimmedInput;
        
        if (!trimmedInput) {
          // Only clear outputs, don't update other properties
          this.bookmarkletOutput = '';
          this.metrics = '';
          this.validationMessage = '';
          this.validationError = false;
          return;
        }
        
        try {
          const result = await this.processText(trimmedInput, {
            compressed: this.compressed, 
            packed: this.packed, 
            mode: this.popupType,
            forceType: this.detectInput ? null : this.inputType
          });
          
          this.bookmarkletOutput = result.output;
          
          if (this.detectInput) {
            // Store current values before updating
            const prevInputType = this.inputType;
            const prevCompressedStates = {...this.compressedStates};
            
            this.inputType = result.isJavaScript ? 'JavaScript' : 'Text/HTML';
            if (result.inputIsCompressed) {
              this.compressedStates[this.inputType] = true;
              this.compressedStates[this.inputType === 'JavaScript' ? 'Text/HTML' : 'JavaScript'] = false;
            }
          }
          
          // Calculate compression ratio
          const ratio = result.compressedSize < result.rawSize ? 
            ((result.rawSize - result.compressedSize) / result.rawSize * 100).toFixed(1) : 0;
          
          this.metrics = `In: ${trimmedInput.length}b${result.inputIsCompressed ? ' (BR64)' : ''} | Out: ${result.outputSize}b${ratio > 0 ? ` (${ratio}% smaller)` : ''}`;
          
          // Update validation message
          if (result.isJavaScript && result.jsParseError) {
            this.validationMessage = `JS Error: ${result.jsParseError.message}`;
            this.validationError = true;
          } else if (result.inputIsCompressed && result.decompressionError) {
            this.validationMessage = 'Invalid compressed data';
            this.validationError = true;
          } else {
            this.validationMessage = '';
            this.validationError = false;
          }
        } catch (e) {
          this.bookmarkletOutput = 'Error: ' + e.message;
          this.validationError = true;
          this.validationMessage = e.message;
        }
      }
    }));
  }
}
