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
            <button class="btn btn-ghost" @click="editorRunCode()" title="Run code" x-show="editingItem && canExecute(editingItem.type)">
              <i class="ph ph-play-circle text-xl"></i>
              Run
            </button>
          </div>
          <div class="flex gap-2">
            <button class="btn" @click="editorCancel()">Cancel</button>
            <button class="btn btn-primary" @click="editorSave()" :disabled="!editingItem?.name?.trim()">Save</button>
            <template x-if="editingItem?.id">
              <button class="btn btn-error" @click="editorDelete()">
                <i class="ph ph-trash text-lg"></i>
                Delete
              </button>
            </template>
          </div>
        </div>

        <!-- Validation Errors -->
        <div x-show="editorErrors.length > 0" class="alert alert-error mb-4">
          <i class="ph ph-warning-circle"></i>
          <div>
            <h3 class="font-bold">Please fix the following errors:</h3>
            <ul class="list-disc list-inside text-sm mt-1">
              <template x-for="error in editorErrors" :key="error">
                <li x-text="error"></li>
              </template>
            </ul>
          </div>
        </div>

        <!-- Success Message -->
        <div x-show="editorSuccess" class="alert alert-success mb-4" x-transition>
          <i class="ph ph-check-circle"></i>
          <span x-text="editorSuccess"></span>
        </div>

        <template x-if="editingItem">
          <div class="flex-1 flex flex-col gap-4">
            <div class="form-control">
              <label class="label">
                <span class="label-text">Item Name <span class="text-error">*</span></span>
              </label>
              <input type="text" 
                     x-model="editingItem.name" 
                     class="input input-bordered w-full" 
                     :class="editorErrors.some(e => e.includes('name')) && 'input-error'"
                     placeholder="Enter a descriptive name for this item" 
                     required>
            </div>

            <div class="flex gap-4 items-end">
              <div class="form-control">
                <label class="label">
                  <span class="label-text">Type</span>
                </label>
                <div class="dropdown">
                  <div tabindex="0" role="button" class="btn btn-sm" :class="badgeClass(editingItem.type) + ' btn-outline'" x-text="typeLabels[editingItem.type] || editingItem.type"></div>
                  <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box z-[1] w-48 p-2 shadow">
                    <template x-for="[key, label] in Object.entries(typeLabels)" :key="key">
                      <li><a @click="editingItem.type = key" x-text="label"></a></li>
                    </template>
                  </ul>
                </div>
              </div>

              <label class="label cursor-pointer inline-flex items-center space-x-2 w-auto max-w-max" x-show="canExecute(editingItem.type)">
                <input type="checkbox" x-model="editingItem.autorun" class="checkbox checkbox-primary">
                <span class="text-primary font-bold">»</span>
                <span class="label-text">Autorun on load</span>
              </label>
            </div>

            <div class="form-control">
              <label class="label">
                <span class="label-text">Tags</span>
                <span class="label-text-alt">Comma-separated</span>
              </label>
              <input type="text" 
                     x-model="editingItem.tags" 
                     class="input input-bordered w-full" 
                     placeholder="tag1, tag2, category">
            </div>

            <div class="form-control">
              <label class="label">
                <span class="label-text">Notes</span>
                <span class="label-text-alt">Optional description</span>
              </label>
              <textarea x-model="editingItem.notes" 
                        class="textarea textarea-bordered w-full h-20" 
                        placeholder="Add any notes or documentation about this item"></textarea>
            </div>

            <div class="form-control flex-1">
              <label class="label">
                <span class="label-text">Code <span class="text-error">*</span></span>
                <span class="label-text-alt">F5 to test run</span>
              </label>
              <textarea x-model="editingItem.code" 
                        class="flex-1 p-3 font-mono text-sm border rounded bg-base-100 resize-none min-h-0" 
                        :class="editorErrors.some(e => e.includes('code')) && 'textarea-error'"
                        :placeholder="getPlaceholderText(editingItem.type)" 
                        @keydown.f5.prevent="editorRunCode()"></textarea>
            </div>
          </div>
        </template>
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