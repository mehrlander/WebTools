{
  name: 'Bookmarklet Transformer',
  icon: 'ph ph-code-simple-bold',
  content: function() {
    return `
      <div class="h-full p-6 overflow-y-auto">
        <div class="max-w-4xl mx-auto">
          <h1 class="text-2xl mb-4 font-mono">Bookmarklet Transformer</h1>

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
            <div class="flex items-center gap-2 ml-auto">
              <!-- Compressed Toggle -->
              <button @click="compressed = !compressed" 
                      :class="compressed ? 'btn btn-accent btn-sm' : 'btn btn-ghost btn-sm'"
                      :title="compressed ? 'Compressed (Click to disable)' : 'Not Compressed (Click to enable)'">
                <i class="ph ph-archive text-lg"></i>
              </button>

              <!-- Packed Toggle -->
              <button @click="packed = !packed" 
                      :class="packed ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'"
                      :title="packed ? 'Packed (Click to disable)' : 'Not Packed (Click to enable)'">
                <i class="ph ph-package text-lg"></i>
              </button>

              <select x-model="popupType" class="select select-sm select-bordered">
                <option value="Apply" x-show="inputType === 'JavaScript' || packed">Apply</option>
                <option value="Write">Write</option>
                <option value="Popup">Popup</option>
                <option value="New Tab">New Tab</option>
              </select>
              <button @click="copyOutput()" class="btn btn-primary btn-sm px-3 py-1 min-h-0 h-auto" x-text="copyButtonText"></button>
            </div>
          </div>

          <textarea x-model="bookmarkletOutput" class="w-full h-32 p-3 font-mono text-sm border rounded bg-base-100 mb-4" readonly></textarea>

          <div class="flex items-center gap-4 mb-2">
            <span class="font-bold">Input:</span>
            <div class="dropdown dropdown-bottom">
              <div tabindex="0" role="button" class="badge badge-lg gap-2 cursor-pointer p-3 hover:opacity-80"
                   :class="{
                     'badge-primary': inputType === 'JavaScript',
                     'badge-neutral': inputType === 'Text/HTML',
                     'badge-error': validationError
                   }">
                <span x-text="inputType"></span>
                <i class="ph ph-archive text-lg" x-show="compressedStates[inputType]"></i>
                <i class="ph ph-caret-down text-sm"></i>
              </div>
              <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-48 mt-2">
                <template x-for="type in contentTypes">
                  <li class="hover:bg-base-200 rounded">
                    <div class="flex items-center p-2 gap-2">
                      <span class="flex-1 text-sm select-none cursor-pointer whitespace-nowrap"
                            @click="setInputType(type); $el.closest('.dropdown').removeAttribute('open')"
                            x-text="type"></span>
                      <button class="p-1 rounded hover:bg-base-300 flex items-center justify-center"
                              @click.stop="toggleCompression(type)"
                              :title="compressedStates[type] ? 'Compressed (Click to disable)' : 'Not Compressed (Click to enable)'">
                        <i class="ph ph-archive text-lg" 
                           :class="compressedStates[type] ? 'text-accent' : 'opacity-30'"></i>
                      </button>
                    </div>
                  </li>
                </template>
              </ul>
            </div>
            <div x-show="validationMessage" class="text-sm ml-2 flex-1" :class="validationError ? 'text-error' : 'text-success'" x-text="validationMessage"></div>
            <div class="flex items-center gap-2 ml-auto">
              <!-- Detect Input Toggle -->
              <button @click="detectInput = !detectInput" 
                      :class="detectInput ? 'btn btn-secondary btn-sm' : 'btn btn-ghost btn-sm'"
                      :title="detectInput ? 'Auto-detect input type (Click to disable)' : 'Manual input type (Click to auto-detect)'">
                <i class="ph ph-scan text-lg"></i>
              </button>

              <!-- Wrap Toggle -->
              <button @click="toggleWrap()" 
                      :class="isWrapped ? 'btn btn-info btn-sm' : 'btn btn-ghost btn-sm'" 
                      :title="isWrapped ? 'Text wrapped (Click to disable)' : 'Text not wrapped (Click to enable)'">
                <i class="ph ph-textbox text-lg"></i>
              </button>
            </div>
          </div>

          <textarea x-model="inputText" class="w-full h-48 p-3 font-mono text-sm border rounded bg-base-100" :style="{ 'white-space': isWrapped ? 'pre-wrap' : 'pre' }" placeholder="Enter your code or text here..."></textarea>
          
          <div class="text-xs text-base-content/50 mt-1 flex items-center gap-1">
            <i class="ph ph-info-circle"></i>
            <span>Compressed input uses BR64: prefix followed by base64-encoded Brotli data</span>
          </div>
        </div>
      </div>
    `;
  },
  init: async function() {
    // Initialize watchers for bookmarklet transformer
    ['inputText', 'compressed', 'compressedStates', 'packed', 'detectInput', 'popupType', 'inputType'].forEach(prop => {
      this.$watch(prop, () => this._updateBookmarklet(), { deep: prop === 'compressedStates' });
    });
    
    // Initialize bookmarklet transformer
    await this.loadLibs();
    this._updateBookmarklet();
  }
}