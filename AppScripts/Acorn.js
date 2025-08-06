{
  name: 'Acorn',
  async init() {
    if (!this.acorn) {
      this.acorn = await import('https://unpkg.com/acorn@8.11.3/dist/acorn.mjs');
    }
    
    this.validateJavaScript = (text) => {
      try { 
        this.acorn.parse(text, { ecmaVersion: 2022 }); 
        return { isValid: true, error: null };
      } catch (error) { 
        return { isValid: false, error };
      }
    };
    
    this.parseJavaScript = (text, options = {}) => {
      return this.acorn.parse(text, { ecmaVersion: 2022, ...options });
    };
    
    this.isValidJavaScript = (text) => {
      return this.validateJavaScript(text).isValid;
    };
    
    this.getJavaScriptError = (text) => {
      const result = this.validateJavaScript(text);
      return result.error ? result.error.message.split('\n')[0] : null;
    };
  }
}
