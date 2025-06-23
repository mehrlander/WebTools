<!DOCTYPE html>
<html lang="en" data-theme="emerald">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SmartTextArea from GitHub CDN</title>
  
  <!-- Required dependencies -->
  <link href="https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <script src="https://cdn.jsdelivr.net/npm/@phosphor-icons/web"></script>
  <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
  
  <!-- Load SmartTextArea component from GitHub -->
  <script src="https://cdn.jsdelivr.net/gh/mehrlander/WebTools@main/AlpineComponents/SmartTextArea.js" defer></script>
</head>
<body class="p-6 bg-base-100 text-base-content max-w-4xl mx-auto">
  <h1 class="text-2xl font-bold mb-6">SmartTextArea loaded from GitHub</h1>
  
  <!-- Basic usage -->
  <div class="mb-6">
    <h2 class="text-lg font-semibold mb-2">Basic Usage</h2>
    <smart-textarea 
      store-id="editor1"
      placeholder="Enter text here..."
      height="300">
    </smart-textarea>
  </div>

  <!-- With initial value -->
  <div class="mb-6">
    <h2 class="text-lg font-semibold mb-2">With Initial Value</h2>
    <smart-textarea 
      store-id="code-editor"
      placeholder="This has initial content..."
      height="250"
      value="// Note: store-id='code-editor' becomes $code_editor
// You can edit this or switch to view mode.">
    </smart-textarea>
  </div>

  <!-- External control buttons -->
  <div class="mb-6">
    <h2 class="text-lg font-semibold mb-2">External Control</h2>
    <div class="flex gap-2 mb-2">
      <button onclick="$editor1.content = 'Content set externally!'" 
              class="btn btn-sm btn-primary">Set Content</button>
      <button onclick="$editor1.toggleWrap()" 
              class="btn btn-sm btn-secondary">Toggle Wrap</button>
      <button onclick="console.log($editor1)" 
              class="btn btn-sm btn-info">Log Store</button>
    </div>
    <p class="text-sm text-base-content/60">
      Access any textarea via: <code>$store-id</code> (e.g., <code>$editor1</code>)<br>
      <span class="text-xs">Note: Hyphens in store-id become underscores in $ reference (e.g., store-id="my-editor" → $my_editor)</span>
    </p>
  </div>

  <div class="card bg-base-200 shadow-xl p-4 mb-6">
    <h3 class="font-semibold mb-2">Try in Console:</h3>
    <code class="text-sm">
      $editor1.content = "Hello World"<br>
      $editor1.setMode(true)  // Switch to view mode<br>
      $editor1.stats  // Get character/word/line counts<br>
      $code_editor.toggleWrap()  // Toggle word wrap (note: hyphen becomes underscore)
    </code>
  </div>

  <script>
    // Example of monitoring store changes
    document.addEventListener('alpine:init', () => {
      // Wait a bit for components to initialize
      setTimeout(() => {
        // Monitor editor1 for changes using the $ syntax
        Alpine.effect(() => {
          if (window.$editor1 && $editor1.content) {
            console.log('Editor1 content changed:', {
              length: $editor1.content.length,
              mode: $editor1.isViewMode ? 'view' : 'edit'
            });
          }
        });
      }, 100);
    });
  </script>
</body>
</html>
