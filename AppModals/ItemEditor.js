{
  name: 'Item Editor',
  icon: 'ph ph-pencil',
  id: 'editor',
  
  content: function() {
    return `
      <div class="h-full flex flex-col">
        <!-- Header -->
        <div class="flex justify-between items-center p-6 border-b border-base-300">
          <div class="flex items-center gap-4">
            <h1 class="text-2xl font-bold" x-text="editingItem?.id ? 'Edit Item' : 'Add New Item'"></h1>
            <button class="btn btn-ghost btn-sm gap-2" @click="editorRunCode()" title="Test run this code" x-show="editingItem && canExecute(editingItem.type)">
              <i class="ph ph-play-circle text-lg"></i>
              Test Run
            </button>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-ghost" @click="editorCancel()">Cancel</button>
            <button class="btn btn-primary" @click="editorSave()" :disabled="!editingItem?.name?.trim()">
              <i class="ph ph-floppy-disk"></i>
              Save
            </button>
            <template x-if="editingItem?.id">
              <button class="btn btn-error" @click="editorDelete()">
                <i class="ph ph-trash"></i>
                Delete
              </button>
            </template>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-6">
          <!-- Validation Errors -->
          <div x-show="editorErrors.length > 0" class="alert alert-error mb-6">
            <i class="ph ph-warning-circle text-xl"></i>
            <div>
              <h3 class="font-bold">Please fix the following errors:</h3>
              <ul class="list-disc list-inside text-sm mt-2">
                <template x-for="error in editorErrors" :key="error">
                  <li x-text="error"></li>
                </template>
              </ul>
            </div>
          </div>

          <!-- Success Message -->
          <div x-show="editorSuccess" class="alert alert-success mb-6" x-transition>
            <i class="ph ph-check-circle text-xl"></i>
            <span x-text="editorSuccess"></span>
          </div>

          <template x-if="editingItem">
            <div class="max-w-3xl mx-auto">
              <!-- Name -->
              <div class="form-control mb-6">
                <label class="label">
                  <span class="label-text text-base font-semibold">Item Name <span class="text-error">*</span></span>
                </label>
                <input type="text" 
                       x-model="editingItem.name" 
                       class="input input-bordered w-full" 
                       :class="editorErrors.some(e => e.includes('name')) && 'input-error'"
                       placeholder="Enter a descriptive name for this item">
              </div>

              <!-- Type and Autorun (same line, no labels) -->
              <div class="flex items-center gap-4 mb-6">
                <div class="dropdown dropdown-bottom">
                  <div tabindex="0" role="button" class="btn btn-outline justify-between min-w-40">
                    <span x-text="typeLabels[editingItem.type] || editingItem.type"></span>
                    <i class="ph ph-caret-down"></i>
                  </div>
                  <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box z-[1] w-full p-2 shadow-lg border border-base-300">
                    <template x-for="[key, label] in Object.entries(typeLabels)" :key="key">
                      <li><a @click="editingItem.type = key" x-text="label"></a></li>
                    </template>
                  </ul>
                </div>

                <label class="label cursor-pointer gap-3" x-show="canExecute(editingItem.type)">
                  <input type="checkbox" x-model="editingItem.autorun" class="checkbox checkbox-primary">
                  <div class="flex items-center gap-2">
                    <span class="text-primary font-bold text-lg">»</span>
                    <span class="text-base">Autorun on load</span>
                  </div>
                </label>
              </div>

              <!-- Tags -->
              <div class="form-control mb-6">
                <label class="label">
                  <span class="label-text text-base font-semibold">Tags</span>
                  <span class="label-text-alt">Comma-separated keywords</span>
                </label>
                <input type="text" 
                       x-model="editingItem.tags" 
                       class="input input-bordered w-full" 
                       placeholder="tag1, tag2, category">
              </div>

              <!-- Notes -->
              <div class="form-control mb-6">
                <label class="label">
                  <span class="label-text text-base font-semibold">Notes</span>
                  <span class="label-text-alt">Optional description or documentation</span>
                </label>
                <textarea x-model="editingItem.notes" 
                          class="textarea textarea-bordered !w-full h-24 resize-none" 
                          placeholder="Add any notes, documentation, or comments about this item"></textarea>
              </div>

              <!-- Code -->
              <div class="form-control mb-6">
                <label class="label">
                  <span class="label-text text-base font-semibold">Code <span class="text-error">*</span></span>
                  <span class="label-text-alt">Press F5 to test run • Use Ctrl+A to select all</span>
                </label>
                <textarea x-model="editingItem.code" 
                          class="textarea textarea-bordered !w-full h-80 font-mono text-sm resize-none" 
                          :class="editorErrors.some(e => e.includes('code')) && 'textarea-error'"
                          :placeholder="getPlaceholderText(editingItem.type)" 
                          @keydown.f5.prevent="editorRunCode()"></textarea>
              </div>
            </div>
          </template>
        </div>
      </div>
    `;
  },

  init: function() {
    // Initialize editor-specific state
    this.editorErrors = [];
    this.editorSuccess = '';
    
    // Add editor methods to the main app context
    this.editorSave = async function() {
      try {
        this.editorErrors = [];
        this.editorSuccess = '';
        
        // Validate the item
        const errors = this.editorValidateItem(this.editingItem);
        if (errors.length > 0) {
          this.editorErrors = errors;
          return;
        }
        
        // Prepare the item for saving
        const itemToSave = {
          ...this.editingItem,
          tags: this.editingItem.tags ? 
            this.editingItem.tags.split(',').map(t => t.trim()).filter(Boolean) : 
            []
        };
        
        // Save to database
        if (itemToSave.id) {
          await this.db.items.put(itemToSave);
          console.log(`Updated item: ${itemToSave.name}`);
          this.editorSuccess = 'Item updated successfully!';
        } else {
          delete itemToSave.id; // Remove undefined id for new items
          const newId = await this.db.items.add(itemToSave);
          console.log(`Created item: ${itemToSave.name} (ID: ${newId})`);
          this.editorSuccess = 'Item created successfully!';
        }
        
        // Reload items list
        await this.loadItems();
        
        // Close modal after short delay to show success message
        setTimeout(() => {
          this.closeModal();
        }, 1000);
        
      } catch (error) {
        console.error('Error saving item:', error);
        this.editorErrors = [`Save failed: ${error.message}`];
      }
    };
    
    this.editorDelete = async function() {
      if (!this.editingItem?.id) return;
      
      const itemName = this.editingItem.name;
      if (!confirm(`Are you sure you want to delete "${itemName}"?\n\nThis action cannot be undone.`)) {
        return;
      }
      
      try {
        await this.db.items.delete(this.editingItem.id);
        console.log(`Deleted item: ${itemName}`);
        
        // Reload items list
        await this.loadItems();
        
        // Close modal
        this.closeModal();
        
      } catch (error) {
        console.error('Error deleting item:', error);
        this.editorErrors = [`Delete failed: ${error.message}`];
      }
    };
    
    this.editorCancel = function() {
      // Check if there are unsaved changes
      const hasChanges = this.editingItem && (
        this.editingItem.name || 
        this.editingItem.code || 
        this.editingItem.notes ||
        this.editingItem.tags
      );
      
      if (hasChanges && !confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        return;
      }
      
      this.closeModal();
    };
    
    this.editorRunCode = function() {
      if (!this.editingItem) return;
      
      try {
        // Create a temporary item for testing
        const testItem = {...this.editingItem};
        this.executeItem(testItem);
        console.log(`Test run completed: ${testItem.name || 'Untitled'}`);
      } catch (error) {
        console.error('Error during test run:', error);
        alert(`Test run failed: ${error.message}`);
      }
    };
    
    this.editorValidateItem = function(item) {
      const errors = [];
      
      // Required field validation
      if (!item.name || !item.name.trim()) {
        errors.push('Item name is required');
      }
      
      if (!item.code || !item.code.trim()) {
        errors.push('Code content is required');
      }
      
      // Type validation
      if (!item.type || !this.cfg.types[item.type]) {
        errors.push('Valid item type is required');
      }
      
      // JavaScript syntax validation for JS items
      if (item.type === 'js' && item.code) {
        try {
          new Function(item.code);
        } catch (e) {
          errors.push(`JavaScript syntax error: ${e.message}`);
        }
      }
      
      // JSON validation for JSON items
      if (item.type === 'json' && item.code) {
        try {
          JSON.parse(item.code);
        } catch (e) {
          errors.push(`Invalid JSON: ${e.message}`);
        }
      }
      
      // Name uniqueness validation (for new items)
      if (!item.id && this.items.some(existingItem => existingItem.name === item.name.trim())) {
        errors.push('An item with this name already exists');
      }
      
      // Name uniqueness validation (for edited items)
      if (item.id && this.items.some(existingItem => existingItem.id !== item.id && existingItem.name === item.name.trim())) {
        errors.push('An item with this name already exists');
      }
      
      return errors;
    };
    
    console.log('ItemEditor initialized with self-contained logic');
  }
}