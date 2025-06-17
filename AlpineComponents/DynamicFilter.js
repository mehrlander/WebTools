/**
 * DynamicFilter - A self-mounting dynamic filter component for arrays of objects
 * Requires: Alpine.js, DaisyUI, Phosphor Icons
 * Optional: Tabulator (for automatic table integration)
 * 
 * Usage:
 *   // With Tabulator
 *   new DynamicFilter('#filter', { table: tabulatorInstance, properties: [...] });
 *   
 *   // With custom data
 *   new DynamicFilter('#filter', {
 *     data: arrayOfObjects,
 *     properties: [...],
 *     onFilter: (filteredData) => { updateMyUI(filteredData); }
 *   });
 */
class DynamicFilter {
  constructor(selector, options = {}) {
    // Convert selector to a safe ID by removing special chars
    this.id = selector.replace(/[^a-zA-Z0-9]/g, '_');
    this.selector = selector;
    
    // Merge default options
    this.options = {
      data: null,                     // Array of objects to filter
      table: null,                    // Optional Tabulator instance
      properties: [],                 // Array of filterable properties
      containerClass: 'card bg-base-200',
      bodyClass: 'card-body p-4',
      showCounts: true,              // Show filtered/total counts
      showClearAll: true,            // Show clear all button
      allowMultiple: true,           // Allow multiple filters
      autoApply: true,               // Apply filters on change
      pillClass: 'badge badge-lg gap-1 p-0 pr-1 bg-base-100 h-10 flex items-center',
      addButtonClass: 'btn btn-sm h-10 px-3 gap-1',
      addButtonText: 'Add Filter',
      noFiltersText: 'No filters applied',
      clearAllText: 'Clear All',
      dropdownClass: 'dropdown-bottom dropdown-end',
      onFilter: null,                // Callback with filtered data
      onFilterChange: null,          // Callback with filter definitions
      itemLabel: 'items',            // Label for count display
      ...options
    };
    
    // Initialize state
    this.activeFilters = {};
    this.originalData = [];
    this.filteredData = [];
    
    // Setup data source
    if (this.options.data) {
      this.originalData = [...this.options.data];
      this.filteredData = [...this.options.data];
    } else if (this.options.table) {
      this.originalData = this.options.table.getData();
      this.filteredData = this.originalData;
    }
    
    // Auto-mount on creation
    this.mount();
  }
  
  get html() {
    const { 
      containerClass, bodyClass, showCounts, showClearAll, 
      pillClass, addButtonClass, addButtonText, noFiltersText,
      clearAllText, dropdownClass, itemLabel
    } = this.options;
    
    return `
      <div class="${containerClass}" x-data="dynamicFilterData_${this.id}">
        <div class="${bodyClass}">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold">Active Filters</h3>
            <div class="flex items-center gap-2">
              ${showCounts ? `
                <span class="text-sm text-base-content/60">
                  <span x-text="filteredCount"></span> / <span x-text="totalCount"></span> ${itemLabel}
                </span>
              ` : ''}
              ${showClearAll ? `
                <button @click="clearAllFilters" 
                        x-show="Object.keys(activeFilters).length > 0"
                        class="btn btn-xs btn-ghost text-error">
                  <i class="ph ph-x"></i>
                  ${clearAllText}
                </button>
              ` : ''}
            </div>
          </div>
          
          <!-- Filter Pills Container with fixed Add button -->
          <div class="flex items-center gap-2">
            <!-- Scrollable filter pills area -->
            <div class="flex-1 flex flex-wrap items-center gap-2 min-h-[2.5rem]">
              <!-- Active Filter Pills -->
              <template x-for="(filter, key) in activeFilters" :key="key">
                <div class="${pillClass}">
                  <span class="pl-3 text-xs font-medium whitespace-nowrap" x-text="filter.label + ':'"></span>
                  
                  <!-- Text filter -->
                  <template x-if="filter.type === 'text'">
                    <input type="text" 
                           x-model="filter.value"
                           @input="handleFilterChange"
                           :placeholder="filter.label"
                           class="input input-xs bg-transparent border-0 w-24 h-full focus:outline-none px-1">
                  </template>
                  
                  <!-- Number filter -->
                  <template x-if="filter.type === 'number'">
                    <div class="flex items-center h-full">
                      <select x-model="filter.operator" @change="handleFilterChange" 
                              class="select select-xs bg-transparent border-0 w-12 h-full focus:outline-none px-0">
                        <option value="=">=</option>
                        <option value=">">></option>
                        <option value="<"><</option>
                        <option value=">=">≥</option>
                        <option value="<=">≤</option>
                      </select>
                      <input type="number" 
                             x-model="filter.value"
                             @input="handleFilterChange"
                             :placeholder="'0'"
                             class="input input-xs bg-transparent border-0 w-16 h-full focus:outline-none px-1">
                    </div>
                  </template>
                  
                  <!-- Select filter -->
                  <template x-if="filter.type === 'select'">
                    <select x-model="filter.value" @change="handleFilterChange" 
                            class="select select-xs bg-transparent border-0 h-full focus:outline-none px-1">
                      <option value="">All</option>
                      <template x-for="option in filter.options" :key="option">
                        <option :value="option" x-text="option"></option>
                      </template>
                    </select>
                  </template>
                  
                  <!-- Boolean filter -->
                  <template x-if="filter.type === 'boolean'">
                    <select x-model="filter.value" @change="handleFilterChange" 
                            class="select select-xs bg-transparent border-0 h-full focus:outline-none px-1">
                      <option value="">All</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </template>
                  
                  <!-- Date filter -->
                  <template x-if="filter.type === 'date'">
                    <div class="flex items-center h-full">
                      <select x-model="filter.operator" @change="handleFilterChange" 
                              class="select select-xs bg-transparent border-0 w-12 h-full focus:outline-none px-0">
                        <option value="=">=</option>
                        <option value=">">></option>
                        <option value="<"><</option>
                        <option value=">=">≥</option>
                        <option value="<=">≤</option>
                      </select>
                      <input type="date" 
                             x-model="filter.value"
                             @change="handleFilterChange"
                             class="input input-xs bg-transparent border-0 h-full focus:outline-none px-1">
                    </div>
                  </template>
                  
                  <button @click="removeFilter(key)" class="btn btn-xs btn-ghost btn-circle h-6 w-6 min-h-0">
                    <i class="ph ph-x text-xs"></i>
                  </button>
                </div>
              </template>
              
              <!-- No filters message -->
              <div x-show="Object.keys(activeFilters).length === 0" 
                   class="text-base-content/40 text-sm italic h-10 flex items-center">
                ${noFiltersText}
              </div>
            </div>
            
            <!-- Fixed position Add Filter Button -->
            <div class="dropdown ${dropdownClass}">
              <button tabindex="0" class="${addButtonClass}">
                <i class="ph ph-plus"></i>
                ${addButtonText}
              </button>
              <ul tabindex="0" class="dropdown-content bg-base-100 rounded-box mt-2 p-1 shadow-lg border border-base-200 w-56 max-h-60 overflow-y-auto z-50">
                <li class="menu-title px-3 py-1">
                  <span class="text-xs">Available Properties</span>
                </li>
                <template x-for="prop in availableProperties" :key="prop.key">
                  <li>
                    <a @click="addFilter(prop.key)" 
                       class="flex items-center justify-between px-3 py-2 hover:bg-base-200 rounded cursor-pointer"
                       :class="{'opacity-50 cursor-not-allowed hover:bg-transparent': activeFilters[prop.key] && !allowMultiple}">
                      <div class="flex items-center gap-2">
                        <i class="ph text-base-content/60"
                           :class="getIconForType(prop.type)"></i>
                        <span x-text="prop.label"></span>
                      </div>
                      <i x-show="activeFilters[prop.key]" class="ph ph-check text-primary"></i>
                    </a>
                  </li>
                </template>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  get data() {
    const filterId = this.id;
    const options = this.options;
    const self = this;
    
    return {
      activeFilters: {},
      properties: options.properties,
      originalData: self.originalData,
      filteredData: self.filteredData,
      totalCount: self.originalData.length,
      filteredCount: self.filteredData.length,
      allowMultiple: options.allowMultiple,
      autoApply: options.autoApply,
      table: options.table,
      
      init() {
        // If using Tabulator, set up listeners
        if (this.table) {
          this.table.on("dataFiltered", (filters, rows) => {
            this.filteredCount = rows.length;
          });
          
          this.table.on("dataLoaded", () => {
            self.originalData = this.table.getData();
            this.originalData = self.originalData;
            this.totalCount = self.originalData.length;
            this.filteredCount = this.table.getDataCount('active');
          });
        }
      },
      
      get availableProperties() {
        return this.properties;
      },
      
      getIconForType(type) {
        const icons = {
          'text': 'ph-text-aa',
          'number': 'ph-number-circle',
          'select': 'ph-list',
          'boolean': 'ph-toggle-right',
          'date': 'ph-calendar'
        };
        return icons[type] || 'ph-funnel';
      },
      
      addFilter(key) {
        if (this.activeFilters[key] && !this.allowMultiple) return;
        
        const property = this.properties.find(p => p.key === key);
        if (!property) return;
        
        // Generate unique key if multiple filters allowed
        const filterKey = this.allowMultiple ? `${key}_${Date.now()}` : key;
        
        this.activeFilters[filterKey] = {
          ...property,
          originalKey: key,
          value: '',
          operator: '='
        };
        
        // Close dropdown
        document.activeElement.blur();
      },
      
      removeFilter(key) {
        delete this.activeFilters[key];
        if (this.autoApply) {
          this.applyFilters();
        }
      },
      
      clearAllFilters() {
        this.activeFilters = {};
        if (this.autoApply) {
          this.applyFilters();
        }
      },
      
      handleFilterChange() {
        if (this.autoApply) {
          this.applyFilters();
        }
      },
      
      applyFilters() {
        // If using Tabulator, use its filtering
        if (this.table) {
          this.applyTabulatorFilters();
        } else {
          // Otherwise, filter the data array
          this.applyDataFilters();
        }
        
        // Call filter change callback with filter definitions
        if (options.onFilterChange) {
          options.onFilterChange(this.activeFilters, self);
        }
      },
      
      applyTabulatorFilters() {
        this.table.clearFilter();
        
        // Group filters by key for multiple filters on same field
        const filterGroups = {};
        Object.entries(this.activeFilters).forEach(([key, filter]) => {
          const originalKey = filter.originalKey || filter.key;
          if (!filterGroups[originalKey]) {
            filterGroups[originalKey] = [];
          }
          filterGroups[originalKey].push(filter);
        });
        
        // Apply filters to Tabulator
        Object.entries(filterGroups).forEach(([key, filters]) => {
          filters.forEach(filter => {
            if (filter.value === '' && filter.type !== 'boolean') return;
            
            if (filter.type === 'text') {
              this.table.addFilter(key, "like", filter.value);
            } else if (filter.type === 'select') {
              if (filter.value) {
                this.table.addFilter(key, "=", filter.value);
              }
            } else if (filter.type === 'boolean') {
              if (filter.value === 'true') {
                this.table.addFilter(key, "=", true);
              } else if (filter.value === 'false') {
                this.table.addFilter(key, "=", false);
              }
            } else if (filter.type === 'number') {
              const numValue = parseFloat(filter.value);
              if (!isNaN(numValue)) {
                this.table.addFilter(key, filter.operator, numValue);
              }
            } else if (filter.type === 'date') {
              if (filter.value) {
                this.table.addFilter(key, filter.operator, filter.value);
              }
            }
          });
        });
      },
      
      applyDataFilters() {
        // Filter the data array directly
        self.filteredData = self.originalData.filter(item => {
          for (const [key, filter] of Object.entries(this.activeFilters)) {
            const fieldKey = filter.originalKey || filter.key;
            const itemValue = item[fieldKey];
            const filterValue = filter.value;
            
            // Skip empty filters (except boolean)
            if (!filterValue && filterValue !== false && filter.type !== 'boolean') continue;
            
            if (filter.type === 'text') {
              if (!String(itemValue).toLowerCase().includes(filterValue.toLowerCase())) {
                return false;
              }
            } else if (filter.type === 'select') {
              if (filterValue && itemValue !== filterValue) {
                return false;
              }
            } else if (filter.type === 'boolean') {
              if (filterValue === 'true' && itemValue !== true) return false;
              if (filterValue === 'false' && itemValue !== false) return false;
            } else if (filter.type === 'number') {
              const numValue = parseFloat(filterValue);
              const itemNum = parseFloat(itemValue);
              if (isNaN(numValue) || isNaN(itemNum)) continue;
              
              switch (filter.operator) {
                case '=': if (itemNum !== numValue) return false; break;
                case '>': if (itemNum <= numValue) return false; break;
                case '<': if (itemNum >= numValue) return false; break;
                case '>=': if (itemNum < numValue) return false; break;
                case '<=': if (itemNum > numValue) return false; break;
              }
            } else if (filter.type === 'date') {
              const filterDate = new Date(filterValue);
              const itemDate = new Date(itemValue);
              if (isNaN(filterDate) || isNaN(itemDate)) continue;
              
              switch (filter.operator) {
                case '=': if (itemDate.toDateString() !== filterDate.toDateString()) return false; break;
                case '>': if (itemDate <= filterDate) return false; break;
                case '<': if (itemDate >= filterDate) return false; break;
                case '>=': if (itemDate < filterDate) return false; break;
                case '<=': if (itemDate > filterDate) return false; break;
              }
            }
          }
          return true;
        });
        
        this.filteredData = self.filteredData;
        this.filteredCount = self.filteredData.length;
        
        // Call callback with filtered data
        if (options.onFilter) {
          options.onFilter(self.filteredData, self);
        }
      }
    };
  }
  
  mount() {
    const target = document.querySelector(this.selector);
    if (!target) {
      console.error(`DynamicFilter: Target element "${this.selector}" not found`);
      return false;
    }
    
    // Set the HTML
    target.innerHTML = this.html;
    
    // Make the data available globally for Alpine
    window[`dynamicFilterData_${this.id}`] = this.data;
    
    return true;
  }
  
  // Public API methods
  
  // Get current active filters
  getFilters() {
    const data = window[`dynamicFilterData_${this.id}`];
    return data ? data.activeFilters : {};
  }
  
  // Get filtered data (when not using Tabulator)
  getFilteredData() {
    return this.filteredData;
  }
  
  // Set data source
  setData(newData) {
    this.originalData = [...newData];
    this.filteredData = [...newData];
    
    const data = window[`dynamicFilterData_${this.id}`];
    if (data) {
      data.originalData = this.originalData;
      data.filteredData = this.filteredData;
      data.totalCount = this.originalData.length;
      data.filteredCount = this.filteredData.length;
      
      if (data.autoApply && Object.keys(data.activeFilters).length > 0) {
        data.applyFilters();
      }
    }
  }
  
  // Set filters programmatically
  setFilters(filters) {
    const data = window[`dynamicFilterData_${this.id}`];
    if (!data) return;
    
    data.activeFilters = {};
    Object.entries(filters).forEach(([key, value]) => {
      const property = data.properties.find(p => p.key === key);
      if (property) {
        data.activeFilters[key] = {
          ...property,
          value: value.value !== undefined ? value.value : value,
          operator: value.operator || '='
        };
      }
    });
    
    if (data.autoApply) {
      data.applyFilters();
    }
  }
  
  // Add a single filter
  addFilter(key, value = '', operator = '=') {
    const data = window[`dynamicFilterData_${this.id}`];
    if (!data) return;
    
    const property = data.properties.find(p => p.key === key);
    if (!property) return;
    
    const filterKey = data.allowMultiple ? `${key}_${Date.now()}` : key;
    data.activeFilters[filterKey] = {
      ...property,
      originalKey: key,
      value,
      operator
    };
    
    if (data.autoApply) {
      data.applyFilters();
    }
  }
  
  // Clear all filters
  clearAll() {
    const data = window[`dynamicFilterData_${this.id}`];
    if (data) {
      data.clearAllFilters();
    }
  }
  
  // Apply filters manually (if autoApply is false)
  apply() {
    const data = window[`dynamicFilterData_${this.id}`];
    if (data) {
      data.applyFilters();
    }
  }
  
  // Update properties dynamically
  updateProperties(properties) {
    const data = window[`dynamicFilterData_${this.id}`];
    if (data) {
      data.properties = properties;
      this.options.properties = properties;
      
      // Clear filters for removed properties
      Object.keys(data.activeFilters).forEach(key => {
        const filter = data.activeFilters[key];
        const originalKey = filter.originalKey || filter.key;
        if (!properties.find(p => p.key === originalKey)) {
          delete data.activeFilters[key];
        }
      });
      
      if (data.autoApply) {
        data.applyFilters();
      }
    }
  }
  
  // Destroy the component and clean up
  destroy() {
    const target = document.querySelector(this.selector);
    if (target) {
      target.innerHTML = '';
    }
    delete window[`dynamicFilterData_${this.id}`];
  }
  
  // Update component options
  update(newOptions) {
    this.options = { ...this.options, ...newOptions };
    this.mount(); // Re-mount with new options
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DynamicFilter;
}

// Also make available globally
if (typeof window !== 'undefined') {
  window.DynamicFilter = DynamicFilter;
}
