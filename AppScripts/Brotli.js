{
  name: 'Brotli',
  async init() {
    if (!this.brotli) {
      this.brotli = await import('https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module').then(m => m.default);
    }
    
    this.compress = async (text) => {
      try {
        const compressed = this.brotli.compress(new TextEncoder().encode(text));
        return 'BR64:' + btoa(String.fromCharCode(...compressed));
      } catch (error) {
        console.error('Compression failed:', error);
        return text;
      }
    };
    
    this.decompress = async (text) => {
      if (!text.startsWith('BR64:')) {
        throw new Error('Invalid BR64 format');
      }
      
      try {
        const base64Data = text.slice(5);
        const binaryData = atob(base64Data);
        const uint8Array = Uint8Array.from(binaryData, c => c.charCodeAt(0));
        return new TextDecoder().decode(this.brotli.decompress(uint8Array));
      } catch (error) {
        console.error('Decompression failed:', error);
        return null;
      }
    };
    
    this.isCompressed = (text) => {
      return text.startsWith('BR64:');
    };
  }
}
