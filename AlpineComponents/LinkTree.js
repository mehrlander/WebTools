/**
 * LinkTree - A self-mounting link tree component for same-domain navigation
 * Requires: Alpine.js (with collapse plugin), DaisyUI, Phosphor Icons, Lodash
 * 
 * Usage:
 *   new LinkTree('#my-tree', { links: [...] });
 *   new LinkTree('#my-tree', { selector: 'a[href]', domain: 'example.com' });
 */
class LinkTree {
  // Extract links from a page given a selector
  static extractLinks(selector = 'a[href]', filterDomain = null, doc = document) {
    return Array.from(doc.querySelectorAll(selector))
      .map(link => {
        try {
          // For parsed documents, we need to resolve URLs properly
          const baseURL = doc.baseURI || (doc.querySelector('base') && doc.querySelector('base').href) || window.location.href;
          const url = new URL(link.href, baseURL);
          
          const normalizeDomain = d => d.replace(/^www\./, '');
          if (!filterDomain || normalizeDomain(url.hostname) === normalizeDomain(filterDomain)) {
            return {
              text: link.textContent.trim() || link.href,
              href: url.href,
              pathname: url.pathname,
              search: url.search,
              hash: url.hash,
              hostname: url.hostname
            };
          }
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  }
  
  // Remove duplicate links based on href
  static dedupeLinks(links) {
    return Array.from(new Map(links.map(link => [link.href, link])).values());
  }
  
  constructor(selector, options = {}) {
    // Convert selector to a safe ID
    this.id = selector.replace(/[^a-zA-Z0-9]/g, '_');
    this.selector = selector;
    
    // Process options
    this.options = {
      links: [],
      linkSelector: null,
      domain: null,
      document: null,  // Optional document to extract from
      autoExpand: true,
      searchable: true,
      showCounts: true,
      containerClass: 'card bg-base-200',
      bodyClass: 'card-body',
      treeClass: 'text-sm font-mono',
      emptyMessage: 'No links found',
      ...options
    };
    
    // Extract links if needed
    if (this.options.linkSelector) {
      const doc = this.options.document || document;
      const extracted = LinkTree.extractLinks(this.options.linkSelector, this.options.domain, doc);
      this.options.links = LinkTree.dedupeLinks(extracted);
    } else if (this.options.links.length > 0) {
      this.options.links = LinkTree.dedupeLinks(this.options.links);
    }
    
    // Auto-mount on creation
    this.mount();
  }
  
  get html() {
    const { containerClass, bodyClass, treeClass, searchable, links, emptyMessage } = this.options;
    
    if (links.length === 0) {
      return `
        <div class="${containerClass}">
          <div class="${bodyClass}">
            <div class="text-base-content/60 text-center py-8">
              <i class="ph ph-tree-structure text-4xl mb-2"></i>
              <p>${emptyMessage}</p>
            </div>
          </div>
        </div>
      `;
    }
    
    return `
      <div class="${containerClass}" x-data="linkTreeData_${this.id}">
        <div class="${bodyClass}">
          ${searchable ? `
            <div class="mb-4">
              <label class="input input-bordered input-sm flex items-center gap-2">
                <i class="ph ph-magnifying-glass"></i>
                <input type="text" class="grow" placeholder="Search links..." 
                       x-model="searchTerm" 
                       @input="$nextTick(() => buildTree())" />
                <kbd class="kbd kbd-sm" x-show="searchTerm">
                  <span x-text="filteredLinks.length"></span> / <span x-text="allLinks.length"></span>
                </kbd>
              </label>
            </div>
          ` : ''}
          
          <div class="flex gap-2 mb-3">
            <button @click="expandAll" class="btn btn-xs btn-ghost">
              <i class="ph ph-arrows-out-simple"></i>
              Expand All
            </button>
            <button @click="collapseAll" class="btn btn-xs btn-ghost">
              <i class="ph ph-arrows-in-simple"></i>
              Collapse All
            </button>
          </div>
          
          <div id="tree_${this.id}" class="${treeClass}"></div>
        </div>
      </div>
    `;
  }
  
  get data() {
    const { links, autoExpand, showCounts } = this.options;
    const treeId = this.id;
    
    return {
      allLinks: links,
      searchTerm: '',
      selectedLink: null,
      treeContainer: null,
      autoExpand,
      showCounts,
      
      init() {
        this.treeContainer = document.getElementById(`tree_${treeId}`);
        this.buildTree();
      },
      
      get filteredLinks() {
        if (!this.searchTerm) return this.allLinks;
        const term = this.searchTerm.toLowerCase();
        return this.allLinks.filter(link => 
          link.text.toLowerCase().includes(term) || 
          link.href.toLowerCase().includes(term) ||
          link.pathname.toLowerCase().includes(term)
        );
      },
      
      buildTree() {
        const links = this.filteredLinks;
        const tree = { '/': { children: {}, links: [] } };
        
        // Build tree structure
        links.forEach(link => {
          const parts = link.pathname.split('/').filter(Boolean);
          let current = tree['/'];
          let path = '';
          
          parts.forEach((part) => {
            path += '/' + part;
            if (!current.children[part]) {
              current.children[part] = {
                children: {},
                links: [],
                fullPath: path
              };
            }
            current = current.children[part];
          });
          
          current.links.push(link);
        });
        
        // Generate HTML
        const html = `<ul>${this.renderNode('/', tree['/'], true)}</ul>`;
        this.treeContainer.innerHTML = html;
        
        // Re-initialize Alpine components
        this.$nextTick(() => {
          Alpine.initTree(this.treeContainer);
        });
      },
      
      renderNode(name, node, isRoot = false) {
        const hasContent = Object.keys(node.children).length > 0 || node.links.length > 0;
        if (!hasContent) return '';
        
        const childrenHtml = Object.entries(node.children)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([childName, childNode]) => this.renderNode(childName, childNode))
          .join('');
        
        const linksHtml = node.links
          .sort((a, b) => a.pathname.localeCompare(b.pathname))
          .map(link => {
            const linkDataEscaped = _.escape(JSON.stringify(link));
            const filename = this.getFilename(link);
            const searchHash = link.search + link.hash;
            
            return `
              <li class="ml-1">
                <div @click="selectLink(${linkDataEscaped})" 
                     class="flex items-center gap-1 cursor-pointer hover:bg-base-300 rounded px-1 py-0.5">
                  <i class="ph ph-link text-info text-xs w-3 ml-3"></i>
                  <span class="text-accent">${_.escape(filename)}</span>
                  ${searchHash ? `<span class="text-xs text-base-content/40">${_.escape(searchHash)}</span>` : ''}
                  <span class="text-xs text-base-content/60 ml-2 italic truncate max-w-xs" 
                        title="${_.escape(link.text)}">${_.escape(link.text)}</span>
                </div>
              </li>
            `;
          })
          .join('');
        
        const itemCount = Object.keys(node.children).length + node.links.length;
        
        return `
          <li x-data="{open:${this.autoExpand ? 'true' : 'false'}}" class="ml-1">
            <div @click="open=!open" 
                 class="flex items-center gap-1 cursor-pointer select-none hover:bg-base-300 rounded px-1 py-0.5">
              <i x-show="!open" class="ph ph-caret-right text-xs w-3 text-base-content/70"></i>
              <i x-show="open" class="ph ph-caret-down text-xs w-3 text-base-content/70"></i>
              <i class="ph ph-folder text-warning"></i>
              <span class="text-primary">${isRoot ? '/' : _.escape(name)}</span>
              ${this.showCounts ? `<span class="text-xs text-base-content/60 ml-2">(${itemCount})</span>` : ''}
            </div>
            <ul x-show="open" x-collapse class="ml-2 pl-2 border-l border-base-300 mt-1 space-y-0.5">
              ${childrenHtml}
              ${linksHtml}
            </ul>
          </li>
        `;
      },
      
      getFilename(link) {
        const parts = link.pathname.split('/').filter(Boolean);
        return parts[parts.length - 1] || '/';
      },
      
      selectLink(linkData) {
        this.selectedLink = linkData;
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('link-selected', { 
          detail: { 
            link: linkData,
            treeId: treeId
          } 
        }));
      },
      
      expandAll() {
        this.treeContainer.querySelectorAll('[x-data]').forEach(el => {
          const component = Alpine.$data(el);
          if (component && typeof component.open !== 'undefined') {
            component.open = true;
          }
        });
      },
      
      collapseAll() {
        this.treeContainer.querySelectorAll('[x-data]').forEach(el => {
          const component = Alpine.$data(el);
          if (component && typeof component.open !== 'undefined') {
            component.open = false;
          }
        });
      }
    };
  }
  
  mount() {
    const target = document.querySelector(this.selector);
    if (!target) {
      console.error(`LinkTree: Target element "${this.selector}" not found`);
      return false;
    }
    
    // Set the HTML
    target.innerHTML = this.html;
    
    // Make the data available globally for Alpine
    window[`linkTreeData_${this.id}`] = this.data;
    
    return true;
  }
  
  // Get currently selected link
  getSelected() {
    const data = window[`linkTreeData_${this.id}`];
    return data ? data.selectedLink : null;
  }
  
  // Programmatically select a link by href
  selectByHref(href) {
    const data = window[`linkTreeData_${this.id}`];
    if (data) {
      const link = data.allLinks.find(l => l.href === href);
      if (link) {
        data.selectLink(link);
      }
    }
  }
  
  // Update search term
  search(term) {
    const data = window[`linkTreeData_${this.id}`];
    if (data) {
      data.searchTerm = term;
      data.buildTree();
    }
  }
  
  // Destroy the component and clean up
  destroy() {
    const target = document.querySelector(this.selector);
    if (target) {
      target.innerHTML = '';
    }
    delete window[`linkTreeData_${this.id}`];
  }
  
  // Update component options
  update(newOptions) {
    this.options = { ...this.options, ...newOptions };
    
    // Re-extract links if needed
    if (newOptions.linkSelector || newOptions.links) {
      if (newOptions.linkSelector) {
        const doc = this.options.document || document;
        const extracted = LinkTree.extractLinks(newOptions.linkSelector, this.options.domain, doc);
        this.options.links = LinkTree.dedupeLinks(extracted);
      } else {
        this.options.links = LinkTree.dedupeLinks(newOptions.links);
      }
    }
    
    this.mount(); // Re-mount with new options
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LinkTree;
}

// Also make available globally
if (typeof window !== 'undefined') {
  window.LinkTree = LinkTree;
}
