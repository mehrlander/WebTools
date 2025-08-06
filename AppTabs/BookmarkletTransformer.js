{
  name: 'Popup Maker',
  icon: 'ph ph-link',
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
              <button @click="copyOutput()" class="btn btn-primary btn-sm px-3 py-1 min-h-0 h-auto" x-text="copyButtonText"></button>
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
    // Initialize popup maker state if not already present
    if (!this.popupType) {
      Object.assign(this, {
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
      });
    }
    
    // Set up watchers for popup maker updates
    ['inputText', 'compressed', 'packed', 'detectInput', 'popupType', 'inputType'].forEach(prop => {
      this.$watch(prop, () => this.updateBookmarklet());
    });
    
    // Initialize the bookmarklet
    this.updateBookmarklet();
  }
}
