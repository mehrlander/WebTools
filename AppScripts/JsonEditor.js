{
  name: 'JsonEditor',
  async init() {
    console.log('Loading JSON Editor library...');
    
    // Create a promise that will resolve when the library is loaded
    this.jsonEditorLoaded = new Promise(async (resolve, reject) => {
      try {
        // Dynamically import the JSON editor
        const module = await import('https://unpkg.com/vanilla-jsoneditor@latest/standalone.js');
        
        // Make createJSONEditor available globally through a shared space
        if (!window.DataJarLibs) window.DataJarLibs = {};
        window.DataJarLibs.createJSONEditor = module.createJSONEditor;
        
        console.log('JSON Editor library loaded successfully');
        resolve(module.createJSONEditor);
      } catch (error) {
        console.error('Failed to load JSON Editor:', error);
        reject(error);
      }
    });
  }
}
