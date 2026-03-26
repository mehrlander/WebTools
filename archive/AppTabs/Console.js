({
  name: 'Console',
  icon: 'ph ph-terminal',
  content() {
    return `
      <div class="h-full flex flex-col p-4">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-lg font-semibold">Console Output</h2>
          <button @click="clearConsole()" class="btn btn-sm btn-ghost">
            <i class="ph ph-trash"></i> Clear
          </button>
        </div>
        <div class="flex-1 bg-base-200 rounded-lg p-4 font-mono text-sm overflow-y-auto">
          <template x-for="(log, index) in consoleLogs" :key="index">
            <div class="mb-2" :class="{
              'text-error': log.level === 'error',
              'text-warning': log.level === 'warn',
              'text-info': log.level === 'info',
              'text-base-content': log.level === 'log'
            }">
              <span class="text-xs opacity-60" x-text="log.timestamp"></span>
              <span class="ml-2" x-text="log.level.toUpperCase()"></span>
              <span class="ml-2" x-text="log.message"></span>
            </div>
          </template>
          <div x-show="!consoleLogs.length" class="text-center text-base-content/60 py-8">
            <i class="ph ph-terminal text-4xl mb-2 block"></i>
            <p>No console output yet</p>
            <p class="text-xs">Console messages will appear here</p>
          </div>
        </div>
      </div>
    `;
  }
})