{
  name: 'Transformer',
  icon: 'ph ph-link',
  requires: ['Brotli', 'Acorn'],
  content() {
    return `
      <div class="h-full p-6 overflow-y-auto">
        <div class="max-w-4xl mx-auto">
          <h1 class="text-2xl mb-4 font-mono">
            <span @click="popupType = popupType === 'Popup' ? 'New Tab' : 'Popup'" class="link link-primary cursor-pointer" x-text="popupType"></span>&nbsp;Maker
          </h1>

          <div class="flex items-center gap-4 mb-4">
            <label class="flex items-center gap-2 text-sm">
              <span>Name:</span>
              <input x-model="bookmarkletName" type="text" class="input input-bordered input-sm" />
            </label>
            <div class="text-sm text-base-content/60 ml-auto" x-text="metrics"></div>
          </div>

          <div class="flex items-center gap-4 mb-2">
            <span class="font-bold">Output:</span>
            <a :href="bookmarkletOutput" class="link link-primary" draggable="true" x-text="bookmarkletName"></a>
            <div class="flex items-center gap-4 ml-auto">
              <label class="flex items-center gap-2 text-sm">
                <input x-model="compressed" type="checkbox" class="checkbox checkbox-sm" />
                <span>Compressed</span>
              </label>
              <label class="flex items-center gap-2 text-sm">
                <input x-model="packed" type="checkbox" class="checkbox checkbox-sm" />
                <span>Packed</span>
              </label>
              <button @click="copyBookmarklet()" class="btn btn-primary btn-sm px-3 py-1 min-h-0 h-auto" x-text="copyButtonText"></button>
            </div>
          </div>

          <textarea x-model="bookmarkletOutput" class="w-full h-32 p-3 font-mono text-sm border rounded bg-base-100 mb-4" readonly></textarea>

          <div class="flex items-center gap-4 mb-2">
            <span class="font-bold">Input:</span>
            <div class="dropdown">
              <div @click="$el.focus()" tabindex="0" role="button" class="badge badge-sm cursor-pointer hover:opacity-80" :class="{
                     'badge-neutral': inputType === 'Text/HTML' && !validationError,
                     'badge-primary': inputType === 'JavaScript' && !validationError,
                     'badge-warning': inputType === 'Compressed (BR64)' && !validationError,
                     'badge-error': validationError
                   }" x-text="inputType"></div>
              <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box z-[1] w-48 p-2 shadow">
                <li><a @click="setInputType('Text/HTML')">Text/HTML</a></li>
                <li><a @click="setInputType('JavaScript')">JavaScript</a></li>
                <li><a @click="setInputType('Compressed (BR64)')">Compressed (BR64)</a></li>
              </ul>
            </div>
            <div x-show="validationMessage" class="text-sm ml-2 flex-1" :class="validationError ? 'text-error' : 'text-success'" x-text="validationMessage"></div>
            <div class="flex items-center gap-4 ml-auto">
              <label class="flex items-center gap-2 text-sm">
                <input x-model="detectInput" type="checkbox" class="checkbox checkbox-sm" />
                <span>Detect input</span>
              </label>
              <button @click="toggleWrap()" class="btn btn-ghost btn-circle btn-sm" title="Toggle line wrapping">
                <i class="ph text-lg" :class="isWrapped ? 'ph-text-aa' : 'ph-text-t'"></i>
              </button>
            </div>
          </div>

          <textarea x-model="inputText" class="w-full h-48 p-3 font-mono text-sm border rounded bg-base-100" :style="{ 'white-space': isWrapped ? 'pre-wrap' : 'pre' }" placeholder="Enter your code or text here..."></textarea>
        </div>
      </div>
    `;
  },
  init() {
    // Initialize bookmarklet transformer state
    if (!this.bookmarkletTransformer) {
      this.bookmarkletTransformer = {
        popupType: 'Popup',
        bookmarkletName: 'Test',
        inputText: '',
        bookmarkletOutput: '',
        metrics: '',
        compressed: true,
        packed: true,
        detectInput: true,
        inputType: 'Text/HTML',
        validationMessage: '',
        validationError: false,
        copyButtonText: 'Copy',
        isWrapped: true
      };
    }
    
    // Create shortcuts to state for x-model binding
    Object.keys(this.bookmarkletTransformer).forEach(key => {
      this[key] = this.bookmarkletTransformer[key];
    });
    
    // Set up watchers
    ['inputText', 'compressed', 'packed', 'detectInput', 'popupType', 'inputType'].forEach(prop => {
      this.$watch(prop, (value) => {
        this.bookmarkletTransformer[prop] = value;
        this.updateBookmarklet();
      });
    });
    
    // Methods
    this.setInputType = (type) => {
      this.inputType = type;
      this.detectInput = false;
    };
    
    this.toggleWrap = () => {
      this.isWrapped = !this.isWrapped;
    };
    
    this.copyBookmarklet = () => {
      const btn = document.createElement('button');
      new ClipboardJS(btn, { text: () => this.bookmarkletOutput }).on('success', () => {
        this.copyButtonText = 'Copied!';
        setTimeout(() => this.copyButtonText = 'Copy', 2000);
      });
      btn.click();
    };
    
    this.processBookmarklet = async (text, options = {}) => {
      const isCompressed = this.isCompressed(text);
      let rawText, compressedText, decompressionError = null;
      
      // Handle compression/decompression
      if (isCompressed) {
        rawText = await this.decompress(text);
        if (!rawText) {
          rawText = text;
          decompressionError = new Error('Failed to decompress');
        }
        compressedText = text;
      } else {
        rawText = text;
        compressedText = await this.compress(text);
      }
      
      // Determine working text based on compression option
      const workingText = (isCompressed && !options.compressed) ? rawText :
                         (!isCompressed && options.compressed) ? compressedText : text;
      
      // JavaScript validation
      const jsValidation = this.validateJavaScript(rawText);
      const isJavaScript = options.forceType === 'JavaScript' ? true :
                          options.forceType === 'Text/HTML' ? false :
                          options.forceType === 'Compressed (BR64)' ? (jsValidation.isValid && !decompressionError) :
                          jsValidation.isValid;
      
      const result = {
        rawText,
        compressedText,
        isJavaScript,
        inputIsCompressed: isCompressed,
        decompressionError,
        jsParseError: isJavaScript ? jsValidation.error : null,
        rawSize: rawText.length,
        compressedSize: compressedText.length
      };
      
      if (!options.packed) {
        return { output: workingText, outputSize: workingText.length, ...result };
      }
      
      // Create packed bookmarklet
      if (workingText.startsWith('BR64:')) {
        const baseScript = `javascript:(async function(){const s='${workingText}';try{const m=await(await import('https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module')).default;const b=atob(s.slice(5));const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);const d=new TextDecoder().decode(m.decompress(a));`;
        
        const action = isJavaScript ? 'eval(d)' :
          options.popup ? "const w=window.open('','_blank','width=600,height=400');w.document.write(d);w.document.close()" :
          "const w=window.open('','_blank');w.document.write(d);w.document.close()";
        
        const output = baseScript + action + '}catch(e){console.error(e)}})();';
        return { output, outputSize: output.length, ...result };
      } else {
        const escapedContent = JSON.stringify(workingText);
        const bookmarklet = isJavaScript ? `javascript:(()=>{${workingText}})()` :
          options.popup ? `javascript:(()=>{let w=window.open('','_blank','width=600,height=400');w.document.write(${escapedContent});w.document.close()})()` :
          `javascript:(()=>{let w=window.open('','_blank');w.document.write(${escapedContent});w.document.close()})()`;
        
        return { output: bookmarklet, outputSize: bookmarklet.length, ...result };
      }
    };
    
    this.updateBookmarklet = async () => {
      const text = this.inputText;
      if (!text.trim()) {
        Object.assign(this, {
          bookmarkletOutput: '',
          metrics: '',
          inputType: 'Text/HTML',
          validationMessage: '',
          validationError: false
        });
        return;
      }
      
      try {
        const options = {
          compressed: this.compressed,
          packed: this.packed,
          popup: this.popupType === 'Popup',
          forceType: this.detectInput ? null : this.inputType
        };
        
        const result = await this.processBookmarklet(text, options);
        
        // Handle validation
        this.validationError = false;
        this.validationMessage = '';
        
        if (!this.detectInput) {
          if (this.inputType === 'Compressed (BR64)') {
            if (!result.inputIsCompressed) {
              this.validationError = true;
              this.validationMessage = 'Invalid format (expected BR64:)';
            } else if (result.decompressionError) {
              this.validationError = true;
              this.validationMessage = 'Invalid Brotli data';
            } else {
              this.validationMessage = 'Valid Brotli';
            }
          } else if (this.inputType === 'JavaScript') {
            if (result.jsParseError) {
              this.validationError = true;
              this.validationMessage = `Syntax error: ${result.jsParseError.message.split('\n')[0]}`;
            } else {
              this.validationMessage = 'Valid JavaScript';
            }
          }
        }
        
        this.bookmarkletOutput = result.output;
        
        // Update type display based on detection
        if (this.detectInput) {
          this.inputType = result.inputIsCompressed ? 'Compressed (BR64)' :
                          result.isJavaScript ? 'JavaScript' : 'Text/HTML';
          this.validationMessage = '';
          this.validationError = false;
        }
        
        // Show compression stats
        const compressionRatio = ((result.rawSize - result.compressedSize) / result.rawSize * 100).toFixed(1);
        this.metrics = `Raw: ${result.rawSize}b | Compressed: ${result.compressedSize}b (${compressionRatio}% smaller) | Output: ${result.outputSize}b`;
      } catch (error) {
        console.error('Processing error:', error);
        this.bookmarkletOutput = 'Error: ' + error.message;
        this.inputType = 'Error';
        this.validationError = true;
      }
    };
    
    // Initialize
    this.updateBookmarklet();
  }
}
