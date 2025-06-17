class DocLinksManager {
  constructor(options = {}) {
    this.options = { domain: null, includeExternal: false, ...options };
    this.urls = [];
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
    doc.head?.appendChild(base);
    
    this.options.domain ||= new URL(url).hostname;
    return doc;
  }
  
  extractLinks(doc, selector = 'a[href]') {
    const urlMap = new Map();
    
    Array.from(doc.querySelectorAll(selector)).forEach(link => {
      try {
        const url = new URL(link.href, doc.baseURI || window.location.href);
        const isInternal = this.isInternalLink(url);
        if (!isInternal && !this.options.includeExternal) return;
        
        const instance = {
          caption: link.textContent.trim() || link.href,
          url: url.href
        };
        
        if (!urlMap.has(url.href)) {
          urlMap.set(url.href, {
            href: url.href,
            pathname: url.pathname,
            search: url.search,
            hash: url.hash,
            hostname: url.hostname,
            protocol: url.protocol,
            isInternal,
            depth: url.pathname.split('/').filter(Boolean).length,
            instances: []
          });
        }
        
        urlMap.get(url.href).instances.push(instance);
      } catch (e) {}
    });
    
    // Convert to array and add aggregate caption
    return Array.from(urlMap.values()).map(urlData => ({
      ...urlData,
      // Primary caption is most common, or first if all unique
      caption: this.getMostCommonCaption(urlData.instances),
      instanceCount: urlData.instances.length
    }));
  }
  
  getMostCommonCaption(instances) {
    const counts = instances.reduce((acc, inst) => {
      acc[inst.caption] = (acc[inst.caption] || 0) + 1;
      return acc;
    }, {});
    
    return Object.entries(counts)
      .sort(([,a], [,b]) => b - a)[0][0];
  }
  
  isInternalLink(url) {
    if (!this.options.domain) return true;
    const norm = d => d.replace(/^www\./, '');
    return norm(url.hostname) === norm(this.options.domain);
  }
  
  buildTree() {
    const tree = { '/': { path: '/', children: {}, urls: [], stats: { totalUrls: 0, totalChildren: 0 } } };
    
    this.urls.forEach(url => {
      const parts = url.pathname.split('/').filter(Boolean);
      let current = tree['/'];
      let path = '';
      
      parts.forEach(part => {
        path += '/' + part;
        if (!current.children[part]) {
          current.children[part] = {
            path, name: part, children: {}, urls: [],
            stats: { totalUrls: 0, totalChildren: 0 }
          };
          current.stats.totalChildren++;
        }
        current = current.children[part];
      });
      
      current.urls.push(url);
      current.stats.totalUrls++;
      
      // Update ancestor stats
      let node = tree['/'];
      parts.forEach(part => {
        node.stats.totalUrls++;
        node = node.children[part];
      });
    });
    
    return this.tree = tree;
  }
  
  calculateStats() {
    return this.stats = {
      totalUrls: this.urls.length,
      totalInstances: this.urls.reduce((sum, url) => sum + url.instanceCount, 0),
      internalUrls: this.urls.filter(u => u.isInternal).length,
      externalUrls: this.urls.filter(u => !u.isInternal).length,
      uniquePaths: new Set(this.urls.map(u => u.pathname)).size,
      maxDepth: Math.max(...this.urls.map(u => u.depth)),
      protocols: {},
      topLevelPaths: {},
      fileTypes: {},
      ...this.urls.reduce((acc, url) => {
        // Protocols
        acc.protocols[url.protocol] = (acc.protocols[url.protocol] || 0) + 1;
        
        // Top paths
        const topPath = '/' + (url.pathname.split('/')[1] || '');
        acc.topLevelPaths[topPath] = (acc.topLevelPaths[topPath] || 0) + 1;
        
        // File types
        const ext = url.pathname.split('.').pop().toLowerCase();
        if (ext && ext.length <= 4 && ext !== url.pathname) {
          acc.fileTypes[ext] = (acc.fileTypes[ext] || 0) + 1;
        }
        
        return acc;
      }, { protocols: {}, topLevelPaths: {}, fileTypes: {} })
    };
  }
  
  getUrlsAtPath(path) {
    if (!this.tree) return [];
    const node = this.getNodeAtPath(path);
    return node ? node.urls : [];
  }
  
  getChildPaths(path) {
    if (!this.tree) return [];
    const node = this.getNodeAtPath(path);
    return node ? Object.entries(node.children).map(([name, child]) => ({
      name,
      path: child.path,
      urlCount: child.stats.totalUrls,
      childCount: child.stats.totalChildren
    })) : [];
  }
  
  getNodeAtPath(path) {
    const parts = path.split('/').filter(Boolean);
    let node = this.tree['/'];
    for (const part of parts) {
      if (!node.children[part]) return null;
      node = node.children[part];
    }
    return node;
  }
  
  getSiblings(urlOrPath) {
    if (!this.tree) return { urls: [], dirs: [] };
    
    // Handle both url objects and path strings
    const path = typeof urlOrPath === 'string' ? urlOrPath : urlOrPath.pathname;
    const parts = path.split('/').filter(Boolean);
    
    // Root level has no siblings
    if (parts.length === 0) return { urls: [], dirs: [] };
    
    // Get parent path and current segment
    const currentSegment = parts.pop();
    const parentPath = '/' + parts.join('/');
    const parentNode = this.getNodeAtPath(parentPath);
    
    if (!parentNode) return { urls: [], dirs: [] };
    
    // Get sibling URLs (excluding those with same final segment)
    const siblingUrls = parentNode.urls.filter(url => {
      const urlSegments = url.pathname.split('/').filter(Boolean);
      const urlFinal = urlSegments[urlSegments.length - 1] || '';
      return urlFinal !== currentSegment;
    });
    
    // Get sibling directories (excluding current if it's a directory)
    const siblingDirs = Object.entries(parentNode.children)
      .filter(([name]) => name !== currentSegment)
      .map(([name, child]) => ({
        name,
        path: child.path,
        urlCount: child.stats.totalUrls,
        childCount: child.stats.totalChildren
      }));
    
    return {
      currentPath: path,
      parentPath,
      urls: siblingUrls,
      dirs: siblingDirs,
      totalSiblings: siblingUrls.length + siblingDirs.length
    };
  }
  
  search(query) {
    const q = query.toLowerCase();
    return this.urls.filter(url => {
      // Search in primary caption
      if (url.caption.toLowerCase().includes(q)) return true;
      // Search in URL parts
      if (url.href.toLowerCase().includes(q) || url.pathname.toLowerCase().includes(q)) return true;
      // Search in ALL instance captions
      return url.instances.some(inst => inst.caption.toLowerCase().includes(q));
    });
  }
  
  // Get all unique captions for a given URL
  getCaptions(urlOrPath) {
    const href = typeof urlOrPath === 'string' && !urlOrPath.startsWith('/') 
      ? urlOrPath  // It's a full URL
      : this.urls.find(u => u.pathname === urlOrPath)?.href;  // It's a path
    
    const url = this.urls.find(u => u.href === href);
    if (!url) return [];
    
    // Return unique captions with their counts
    const captionCounts = url.instances.reduce((acc, inst) => {
      acc[inst.caption] = (acc[inst.caption] || 0) + 1;
      return acc;
    }, {});
    
    return Object.entries(captionCounts)
      .map(([caption, count]) => ({ caption, count }))
      .sort((a, b) => b.count - a.count);
  }
  
  getTreeSummary(node = this.tree?.['/'], indent = '') {
    if (!node) return 'No tree built yet';
    
    return Object.entries(node.children)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]) => {
        const stats = `[${child.stats.totalUrls}U, ${child.stats.totalChildren}C]`;
        let result = `${indent}├── ${name} ${stats}\n`;
        if (indent.length < 12 && child.stats.totalChildren > 0) {
          result += this.getTreeSummary(child, indent + '│   ');
        }
        return result;
      }).join('');
  }
  
  async process(url) {
    const doc = await this.fetchPage(url);
    this.urls = this.extractLinks(doc);
    console.log(`Extracted ${this.urls.length} unique URLs (${this.urls.reduce((sum, u) => sum + u.instanceCount, 0)} total instances)`);
    
    this.buildTree();
    this.calculateStats();
    
    return { urls: this.urls, tree: this.tree, stats: this.stats };
  }
  
  printSummary() {
    const { totalUrls, totalInstances, internalUrls, externalUrls, uniquePaths, maxDepth, topLevelPaths } = this.stats;
    
    console.log(`
=== Document Link Manager Summary ===
Domain: ${this.options.domain}
Unique URLs: ${totalUrls} (${totalInstances} total instances)
Internal/External: ${internalUrls}/${externalUrls}
Unique Paths: ${uniquePaths}, Max Depth: ${maxDepth}

Top Paths:`);
    
    Object.entries(topLevelPaths)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([path, count]) => console.log(`  ${path}: ${count}`));
    
    console.log('\nTree Structure:\n' + this.getTreeSummary());
  }
}

// Usage
const docManager = new DocLinksManager({ domain: 'www.loc.gov' });
docManager.process('https://www.loc.gov').then(() => {
  console.log('✅ Ready!');
  docManager.printSummary();
  console.log('\nCommands: search("term"), getChildPaths("/"), getUrlsAtPath("/path"), getSiblings("/path"), getCaptions(url)');
}).catch(e => console.error('❌ Failed:', e));

window.docManager = docManager;
