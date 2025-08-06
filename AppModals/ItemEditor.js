{
  name: 'Item Editor',
  icon: 'ph ph-pencil',
  id: 'editor',
  content: function() {
    return `
      <div class="h-full p-6 flex flex-col">
        <div class="flex justify-between items-center mb-6">
          <div class="flex items-center gap-4">
            <h1 class="text-2xl font-bold" x-text="editingItem?.id ? 'Edit Item' : 'Add New Item'"></h1>
            <button class="btn btn-ghost" @click="runCurrentCode()" title="Run code" x-show="editingItem && canExecute(editingItem.type)">
              <i class="ph ph-play-circle text-xl"></i>
              Run
            </button>
          </div>
          <div class="flex gap-2">
            <button class="btn" @click="cancelEdit()">Cancel</button>
            <button class="btn btn-primary" @click="saveItem()">Save</button>
            <template x-if="editingItem?.id">
              <button class="btn btn-error" @click="deleteItem()">
                <i class="ph ph-trash text-lg"></i>
                Delete
              </button>
            </template>
          </div>
        </div>

        <template x-if="editingItem">
          <div class="flex-1 flex flex-col gap-4">
            <input type="text" x-model="editingItem.name" class="input input-bordered w-full" placeholder="Item name" required>

            <div class="flex gap-4 items-center">
              <div class="dropdown">
                <div tabindex="0" role="button" class="btn btn-sm" :class="badgeClass(editingItem.type) + ' btn-outline'" x-text="editingItem.type || 'js'"></div>
                <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box z-[1] w-48 p-2 shadow">
                  <template x-for="t in ['js', 'html', 'text', 'json']">
                    <li><a @click="editingItem.type = t" x-text="typeLabels[t]"></a></li>
                  </template>
                </ul>
              </div>

              <label class="label cursor-pointer inline-flex items-center space-x-2 w-auto max-w-max" x-show="canExecute(editingItem.type)">
                <input type="checkbox" x-model="editingItem.autorun" class="checkbox checkbox-primary">
                <span class="text-primary font-bold">»</span>
                <span class="label-text">Autorun on load</span>
              </label>
            </div>

            <input type="text" x-model="editingItem.tags" class="input input-bordered w-full" placeholder="Tags (comma-separated)">
            <textarea x-model="editingItem.notes" class="textarea textarea-bordered w-full h-24" placeholder="Notes (optional)"></textarea>
            <textarea x-model="editingItem.code" class="flex-1 p-3 font-mono text-sm border rounded bg-base-100 resize-none" :placeholder="getPlaceholderText(editingItem.type)" @keydown.f5.prevent="runCurrentCode()"></textarea>
          </div>
        </template>
      </div>
    `;
  }
}
