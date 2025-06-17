/**
 * DocLinksManager - Extract and organize links from web pages
 * Usage: const manager = new DocLinksManager(); await manager.process(url);
 */
class DocLinksManager {
  constructor(options = {}) {
    this.options = Object.assign({ 
      domain: null, 
      includeExternal: false,
      filter: null // Filter function: (url) => boolean
    }, options);
    this.urls = [];
    this.urlMap = new Map();
    this.processedPages = new Set();
    this.tree = null;
    this.stats = {};
  }
  
  async fetchPage(url) {
    console.log(`Fetching ${url}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed: ${response.status}`);
    
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const base = doc.createElement('base');
    base.href = url;
    if (doc.head) doc.head.appendChild(base);
    
    this.options.domain = this.options.domain || new URL(url).hostname;
    return doc;
  }
  
  extractLinks(doc, selector = 'a[href]') {
    Array.from(doc.querySelectorAll(selector)).forEach(link => {
      try {
        const url = new URL(link.href, doc.baseURI || window.location.href);
        const isInternal = this.isInternalLink(url);
        if (!isInternal && !this.options.includeExternal) return;
        
        const caption = link.textContent.trim() || link.href;
        
        if (!this.urlMap.has(url.href)) {
          this.urlMap.set(url.href, {
            href: url.href,
            pathname: url.pathname,
            search: url.search,
            hash: url.hash,
            hostname: url.hostname,
            protocol: url.protocol,
            isInternal,
            depth: url.pathname.split('/').filter(Boolean).length,
            captions: new Map()
          });
        }
        
        const urlData = this.urlMap.get(url.href);
        urlData.captions.set(caption, (urlData.captions.get(caption) || 0) + 1);
      } catch (e) {}
    });
  }
  
  setFilter(filterFn) {
    this.options.filter = filterFn;
    // Re-build if we already have data
    if (this.urls.length > 0) {
      this.finalizeUrls();
      this.buildTree();
      this.calculateStats();
    }
  }
  
  finalizeUrls() {
    this.urls = Array.from(this.urlMap.values()).map(urlData => {
      const result = Object.assign({}, urlData);
      
      // Convert captions Map to array and find most common
      const captionArray = Array.from(urlData.captions.entries())
        .map(([caption, count]) => ({ caption, count }))
        .sort((a, b) => b.count - a.count);
      
      result.caption = captionArray[0]?.caption || urlData.href;
      result.allCaptions = captionArray;
      result.instanceCount = captionArray.reduce((sum, c) => sum + c.count, 0);
      
      // Remove the Map from the final object
      delete result.captions;
      
      return result;
    });
    
    // Apply filter if set
    if (this.options.filter) {
      this.urls = this.urls.filter(this.options.filter);
    }
  }
  
  isInternalLink(url) {
    if (!this.options.domain) return true;
    const norm = d => d.replace(/^www\./, '');
    return norm(url.hostname) === norm(this.options.domain);
  }
  
  buildTree() {
    const tree = {};
    
    // Initialize root
    tree['/'] = {
      path: '/',
      name: '/',
      parent: null,
      children: [],
      urls: [], // Changed from single url to array
      stats: { urlCount: 0, childUrls: 0 }
    };
    
    // Build tree structure from filtered URLs
    this.urls.forEach(url => {
      // Normalize pathname - remove trailing slash unless it's root
      const normalizedPath = url.pathname.replace(/\/$/, '') || '/';
      const parts = normalizedPath.split('/').filter(Boolean);
      
      // Determine which node this URL belongs to
      let targetPath = '/';
      
      if (parts.length > 0) {
        // Build path hierarchy
        let currentPath = '';
        
        parts.forEach((part, index) => {
          const previousPath = currentPath || '/';
          currentPath += '/' + part;
          
          if (!tree[currentPath]) {
            tree[currentPath] = {
              path: currentPath,
              name: part,
              parent: previousPath,
              children: [],
              urls: [],
              stats: { urlCount: 0, childUrls: 0 }
            };
            
            // Add to parent's children
            if (!tree[previousPath].children.includes(currentPath)) {
              tree[previousPath].children.push(currentPath);
            }
          }
        });
        
        targetPath = currentPath;
      }
      
      // Add URL to the appropriate node
      if (tree[targetPath]) {
        tree[targetPath].urls.push(url);
        tree[targetPath].stats.urlCount++;
        
        // Update child URL counts up the tree
        let node = tree[targetPath];
        while (node) {
          node.stats.childUrls++;
          node = node.parent ? tree[node.parent] : null;
        }
      }
    });
    
    return this.tree = tree;
  }
  
  calculateStats() {
    const depths = this.urls.map(u => u.depth);
    
    const stats = {
      pagesProcessed: this.processedPages.size,
      totalUrls: this.urls.length,
      filteredUrls: this.urlMap.size - this.urls.length,
      totalInstances: this.urls.reduce((sum, url) => sum + url.instanceCount, 0),
      internalUrls: this.urls.filter(u => u.isInternal).length,
      externalUrls: this.urls.filter(u => !u.isInternal).length,
      uniquePaths: new Set(this.urls.map(u => u.pathname)).size,
      maxDepth: depths.length > 0 ? Math.max(...depths) : 0,
      protocols: {},
      topLevelPaths: {},
      fileTypes: {}
    };
    
    this.urls.forEach(url => {
      stats.protocols[url.protocol] = (stats.protocols[url.protocol] || 0) + 1;
      
      const topPath = '/' + (url.pathname.split('/')[1] || '');
      stats.topLevelPaths[topPath] = (stats.topLevelPaths[topPath] || 0) + 1;
      
      const ext = url.pathname.split('.').pop().toLowerCase();
      if (ext && ext.length <= 4 && ext !== url.pathname) {
        stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
      }
    });
    
    return this.stats = stats;
  }
  
  getUrl(path) {
    if (!this.tree) return null;
    const node = this.tree[path];
    return node ? node.urls[0] || null : null; // Return first URL if any
  }
  
  getUrlsAtPath(path) {
    if (!this.tree) return [];
    const node = this.tree[path];
    return node ? node.urls : [];
  }
  
  getChildPaths(path) {
    if (!this.tree) return [];
    const node = this.tree[path];
    if (!node) return [];
    
    return node.children
      .map(childPath => this.tree[childPath])
      .filter(child => child)
      .map(child => ({
        name: child.name,
        path: child.path,
        urlCount: child.stats.urlCount,
        childUrls: child.stats.childUrls
      }));
  }
  
  getSiblings(urlOrPath) {
    if (!this.tree) return { urls: [], paths: [] };
    
    let targetPath;
    if (typeof urlOrPath === 'string') {
      targetPath = urlOrPath;
    } else {
      // For URL objects, normalize the pathname
      targetPath = urlOrPath.pathname.replace(/\/$/, '') || '/';
    }
    
    const targetNode = this.tree[targetPath];
    if (!targetNode || !targetNode.parent) return { urls: [], paths: [] };
    
    const parentNode = this.tree[targetNode.parent];
    if (!parentNode) return { urls: [], paths: [] };
    
    const siblings = parentNode.children
      .filter(childPath => childPath !== targetPath)
      .map(childPath => this.tree[childPath])
      .filter(child => child);
    
    // Flatten all URLs from sibling nodes
    const siblingUrls = siblings.reduce((urls, sibling) => {
      return urls.concat(sibling.urls);
    }, []);
    
    return {
      currentPath: targetPath,
      parentPath: targetNode.parent,
      urls: siblingUrls,
      paths: siblings.map(s => ({
        name: s.name,
        path: s.path,
        urlCount: s.stats.urlCount,
        childUrls: s.stats.childUrls
      }))
    };
  }
  
  search(query) {
    const q = query.toLowerCase();
    return this.urls.filter(url => {
      if (url.caption.toLowerCase().includes(q)) return true;
      if (url.href.toLowerCase().includes(q) || url.pathname.toLowerCase().includes(q)) return true;
      return url.allCaptions.some(({ caption }) => caption.toLowerCase().includes(q));
    });
  }
  
  getCaptions(urlOrPath) {
    const url = this.urls.find(u => 
      u.href === urlOrPath || 
      u.pathname === urlOrPath ||
      (typeof urlOrPath === 'object' && u.href === urlOrPath.href)
    );
    
    return url ? url.allCaptions : [];
  }
  
  clear() {
    this.urls = [];
    this.urlMap.clear();
    this.processedPages.clear();
    this.tree = null;
    this.stats = {};
  }
  
  getProcessedPages() {
    return Array.from(this.processedPages);
  }
  
  getTreeSummary(maxDepth = 3) {
    if (!this.tree) return 'No tree built yet';
    
    const renderNode = (node, depth = 0, indent = '') => {
      if (depth > maxDepth) return '';
      
      let result = '';
      if (node.path !== '/') {
        const icon = node.stats.urlCount > 0 ? '📄' : '📁';
        const urlInfo = node.stats.urlCount > 0 ? ` [${node.stats.urlCount} direct]` : '';
        result = `${indent}├── ${icon} ${node.name} (${node.stats.childUrls} urls${urlInfo})\n`;
      }
      
      // Sort children and render
      const children = node.children
        .map(childPath => this.tree[childPath])
        .filter(child => child)
        .sort((a, b) => {
          // Directories with URLs first, then empty directories
          if ((a.stats.urlCount > 0) !== (b.stats.urlCount > 0)) {
            return a.stats.urlCount > 0 ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      
      children.forEach(child => {
        result += renderNode(child, depth + 1, node.path === '/' ? '' : indent + '│   ');
      });
      
      return result;
    };
    
    return renderNode(this.tree['/']);
  }
  
  async process(url) {
    this.clear();
    await this.addPage(url);
    return { urls: this.urls, tree: this.tree, stats: this.stats };
  }
  
  async addPage(url) {
    if (this.processedPages.has(url)) {
      console.log(`Already processed: ${url}`);
      return;
    }
    
    const doc = await this.fetchPage(url);
    this.extractLinks(doc);
    this.processedPages.add(url);
    
    this.finalizeUrls();
    this.buildTree();
    this.calculateStats();
    
    console.log(`Added ${url} - Total: ${this.urls.length} unique URLs${this.stats.filteredUrls ? ` (${this.stats.filteredUrls} filtered out)` : ''}`);
  }
  
  async addPages(urls) {
    for (const url of urls) {
      await this.addPage(url);
    }
  }
  
  getUnprocessedInternalUrls() {
    return this.urls
      .filter(url => url.isInternal && !this.processedPages.has(url.href))
      .map(url => url.href);
  }
  
  async crawl(startUrl, maxPages = 10) {
    await this.process(startUrl);
    
    while (this.processedPages.size < maxPages) {
      const unprocessed = this.getUnprocessedInternalUrls();
      if (unprocessed.length === 0) break;
      
      await this.addPage(unprocessed[0]);
    }
    
    console.log(`Crawled ${this.processedPages.size} pages`);
  }
  
  printSummary() {
    const { pagesProcessed, totalUrls, filteredUrls, totalInstances, internalUrls, externalUrls, uniquePaths, maxDepth, topLevelPaths } = this.stats;
    
    console.log(`
=== Document Links Manager Summary ===
Domain: ${this.options.domain}
Pages Processed: ${pagesProcessed}
Unique URLs: ${totalUrls}${filteredUrls ? ` (${filteredUrls} filtered out)` : ''}
Total Instances: ${totalInstances}
Internal/External: ${internalUrls}/${externalUrls}
Unique Paths: ${uniquePaths}, Max Depth: ${maxDepth}

Top Paths:`);
    
    Object.entries(topLevelPaths)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([path, count]) => console.log(`  ${path}: ${count}`));
    
    console.log('\nTree Structure:');
    console.log(`Root (/) - ${this.tree['/'].stats.childUrls} total urls, ${this.tree['/'].stats.urlCount} at root`);
    console.log(this.getTreeSummary());
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocLinksManager;
}

if (typeof window !== 'undefined') {
  window.DocLinksManager = DocLinksManager;
}
