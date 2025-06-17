/**
 * DocLinksManager - Extract and organize links from web pages
 * Usage: const manager = new DocLinksManager(); await manager.process(url);
 */
class DocLinksManager {
  constructor(options = {}) {
    this.options = Object.assign({ domain: null, includeExternal: false }, options);
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
        
        const instance = {
          caption: link.textContent.trim() || link.href,
          url: url.href
        };
        
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
            instances: []
          });
        }
        
        this.urlMap.get(url.href).instances.push(instance);
      } catch (e) {}
    });
  }
  
  finalizeUrls() {
    this.urls = Array.from(this.urlMap.values()).map(urlData => {
      const result = Object.assign({}, urlData);
      result.caption = this.getMostCommonCaption(urlData.instances);
      result.instanceCount = urlData.instances.length;
      return result;
    });
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
      
      let node = tree['/'];
      parts.forEach(part => {
        node.stats.totalUrls++;
        node = node.children[part];
      });
    });
    
    return this.tree = tree;
  }
  
  calculateStats() {
    const depths = this.urls.map(u => u.depth);
    
    const stats = {
      pagesProcessed: this.processedPages.size,
      totalUrls: this.urls.length,
      totalInstances: this.urls.reduce((sum, url) => sum + url.instanceCount, 0),
      internalUrls: this.urls.filter(u => u.isInternal).length,
      externalUrls: this.urls.filter(u => !u.isInternal).length,
      uniquePaths: new Set(this.urls.map(u => u.pathname)).size,
      maxDepth: depths.length > 0 ? Math.max.apply(null, depths) : 0,
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
    
    const path = typeof urlOrPath === 'string' ? urlOrPath : urlOrPath.pathname;
    const parts = path.split('/').filter(Boolean);
    
    if (parts.length === 0) return { urls: [], dirs: [] };
    
    const currentSegment = parts.pop();
    const parentPath = '/' + parts.join('/');
    const parentNode = this.getNodeAtPath(parentPath);
    
    if (!parentNode) return { urls: [], dirs: [] };
    
    const siblingUrls = parentNode.urls.filter(url => {
      const urlSegments = url.pathname.split('/').filter(Boolean);
      const urlFinal = urlSegments[urlSegments.length - 1] || '';
      return urlFinal !== currentSegment;
    });
    
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
      if (url.caption.toLowerCase().includes(q)) return true;
      if (url.href.toLowerCase().includes(q) || url.pathname.toLowerCase().includes(q)) return true;
      return url.instances.some(inst => inst.caption.toLowerCase().includes(q));
    });
  }
  
  getCaptions(urlOrPath) {
    let href;
    if (typeof urlOrPath === 'string' && !urlOrPath.startsWith('/')) {
      href = urlOrPath;
    } else {
      const found = this.urls.find(u => u.pathname === urlOrPath);
      href = found ? found.href : null;
    }
    
    const url = this.urls.find(u => u.href === href);
    if (!url) return [];
    
    const captionCounts = url.instances.reduce((acc, inst) => {
      acc[inst.caption] = (acc[inst.caption] || 0) + 1;
      return acc;
    }, {});
    
    return Object.entries(captionCounts)
      .map(([caption, count]) => ({ caption, count }))
      .sort((a, b) => b.count - a.count);
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
  
  getTreeSummary(node = this.tree['/'], indent = '') {
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
    this.processedPages.clear();
    this.urlMap.clear();
    
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
    
    console.log(`Added ${url} - Total: ${this.urls.length} unique URLs (${this.urls.reduce((sum, u) => sum + u.instanceCount, 0)} instances)`);
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
    const { pagesProcessed, totalUrls, totalInstances, internalUrls, externalUrls, uniquePaths, maxDepth, topLevelPaths } = this.stats;
    
    console.log(`
=== Document Links Manager Summary ===
Domain: ${this.options.domain}
Pages Processed: ${pagesProcessed}
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocLinksManager;
}

if (typeof window !== 'undefined') {
  window.DocLinksManager = DocLinksManager;
}
