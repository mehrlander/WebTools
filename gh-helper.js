export default class GH {
  constructor(conf = {}) {
    this.token = conf.token || '';
    this.repo = conf.repo || ''; // Format: 'owner/name'
    this.ref = conf.ref || 'main'; // Branch or Commit SHA
  }

  // 1. Smart Headers (Safe for Shortcuts)
  // If the token is still the '🎟' placeholder, we treat it as empty/public.
  get headers() {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (this.token && !this.token.includes('🎟')) {
      h.Authorization = `Bearer ${this.token.trim()}`;
    }
    return h;
  }

  // 2. The Request Engine
  // - Starts with '/': Global request (e.g., /user/repos)
  // - Starts with 'http': Full URL (e.g., pagination)
  // - Otherwise: Repo-scoped request (e.g., contents/file.js)
  async req(path, opts = {}) {
    const base = path.startsWith('/') 
      ? 'https://api.github.com' 
      : `https://api.github.com/repos/${this.repo}`;
    
    const url = path.startsWith('http') 
      ? path 
      : `${base}/${path.replace(/^\//, '')}`;

    const res = await fetch(url, { headers: this.headers, ...opts });
    
    if (!res.ok) {
      // Useful for debugging rate limits or permissions
      const limit = res.headers.get('x-ratelimit-remaining');
      throw new Error(`GitHub Error ${res.status} (Rate Rem: ${limit})`);
    }
    return res.json();
  }

  // 3. List Repositories
  // Returns the list including the 'private' property you need for the lock icon
  async repos(user = 'anthropics') {
    // If we have a valid token, get OUR repos. If not, get USER'S public repos.
    const endpoint = this.headers.Authorization ? '/user/repos' : `/users/${user}/repos`;
    return this.req(`${endpoint}?sort=updated&per_page=100`);
  }

  // 4. List Files (ls)
  async ls(path = '') {
    const data = await this.req(`contents/${path}?ref=${this.ref}`);
    if (!Array.isArray(data)) throw new Error('Path is not a directory');
    
    // Sort: Folders first, then files (alphabetical)
    return data.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'dir' ? -1 : 1;
    });
  }

  // 5. Get File Content (cat)
  async get(path) {
    const data = await this.req(`contents/${path}?ref=${this.ref}`);
    if (Array.isArray(data)) throw new Error('Path is a directory');
    return {
      text: this.decode(data.content),
      sha: data.sha,
      size: data.size,
      url: data.html_url
    };
  }

  // 6. Get History/Commits
  async history(path, limit = 20) {
    const data = await this.req(`commits?path=${encodeURIComponent(path)}&sha=${this.ref}&per_page=${limit}`);
    return data.map(c => ({
      sha: c.sha,
      msg: c.commit.message.split('\n')[0].slice(0, 80),
      date: c.commit.committer.date,
      ago: this.ago(c.commit.committer.date),
      author: c.commit.author.name
    }));
  }

  // --- Utilities ---

  // Robust Base64 decoder (handles emojis/UTF-8 correctly)
  decode(str) {
    const binString = atob(str.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binString, c => c.charCodeAt(0)));
  }

  // "Time Ago" formatter
  ago(dateStr) {
    const s = (Date.now() - new Date(dateStr)) / 1000;
    const intervals = { y: 31536000, mo: 2592000, d: 86400, h: 3600, m: 60 };
    for (const [unit, v] of Object.entries(intervals)) {
      if (s >= v) return `${Math.floor(s/v)}${unit} ago`;
    }
    return 'just now';
  }

  // Parse a GitHub URL from clipboard
  parseUrl(url) {
    const m = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/(?:tree|blob)\/([^\/]+))?(?:\/(.+))?/);
    if (!m) return null;
    return { 
      repo: `${m[1]}/${m[2]}`, 
      ref: m[3] || 'main', 
      path: (m[4] || '').replace(/\/$/, '') 
    };
  }
}
