# Alp Framework - First Samples

Copy-paste these examples into an HTML file to try Alp. Each builds on the previous one.

> **Note:** The `🎟️GitHubToken` placeholder in the script URLs will be automatically replaced with your GitHub token if you're viewing this through a token-aware system. If copying manually, you can either replace it with your own GitHub token to avoid API rate limits, or simply remove the `?token=...` parameter entirely—the framework will still work.

---

## Example 1: Basic Counter

The simplest Alp component. Click the buttons to change the count.

**What you'll learn:** Defining components, state management, template syntax.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alp - Basic Counter</title>
</head>
<body class="p-8">
  <h1 class="text-3xl font-bold mb-4">Basic Counter</h1>

  <alp-counter></alp-counter>

  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@main/alp.js?token=🎟️GitHubToken"></script>
  <script>
    alp.define('counter', () => `
      <div class="card bg-base-200 p-6 max-w-xs">
        <div class="flex items-center gap-4">
          <button @click="count--" class="btn btn-circle">-</button>
          <span class="text-3xl font-bold" x-text="count"></span>
          <button @click="count++" class="btn btn-circle">+</button>
        </div>
      </div>
    `, { count: 0 });
  </script>
</body>
</html>
```

**Key concepts:**
- `alp.define(name, template, initialState)` creates a component
- Use `<alp-{name}>` to place the component in HTML
- `x-text="count"` displays reactive state
- `@click="count++"` handles events (Alpine.js syntax)

---

## Example 2: Persistent Note

A note that saves to IndexedDB. Your text persists across page refreshes.

**What you'll learn:** Data persistence with `save()`, `load()`, `del()`, and path binding.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alp - Persistent Note</title>
</head>
<body class="p-8">
  <h1 class="text-3xl font-bold mb-4">Persistent Note</h1>

  <!-- Default path: alp.note -->
  <alp-note></alp-note>

  <!-- Custom path: notes.shopping -->
  <alp-note path="notes.shopping" class="mt-4"></alp-note>

  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@main/alp.js?token=🎟️GitHubToken"></script>
  <script>
    alp.define('note', () => `
      <div class="card bg-base-200 p-6 max-w-md">
        <div class="text-sm opacity-60 mb-2">
          Path: <span x-text="_path"></span>
        </div>
        <textarea
          x-model="text"
          class="textarea textarea-bordered w-full h-24"
          placeholder="Type something..."
        ></textarea>
        <div class="flex gap-2 mt-4">
          <button @click="save({ text })" class="btn btn-primary btn-sm">
            Save
          </button>
          <button @click="load().then(d => d && (text = d.text))" class="btn btn-sm">
            Load
          </button>
          <button @click="del(); text = ''" class="btn btn-error btn-sm">
            Clear
          </button>
        </div>
      </div>
    `, {
      text: '',
      async onPing(occasion) {
        // Auto-load data on mount or path change
        if (occasion === 'mount' || occasion === 'path') {
          const data = await this.load();
          if (data) this.text = data.text;
        }
      }
    });
  </script>
</body>
</html>
```

**Key concepts:**
- `save({ text })` stores data at the component's path in IndexedDB
- `load()` retrieves saved data; `del()` removes it
- `path="notes.shopping"` binds a component to a specific data path
- `_path` exposes the current path for display
- `onPing('mount')` is called when the component initializes
- Multiple instances of the same component can have different paths

---

## Example 3: Connected Components with Ping

Two components that communicate. Saving in one updates the other.

**What you'll learn:** The ping system for cross-component communication.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alp - Connected Components</title>
</head>
<body class="p-8">
  <h1 class="text-3xl font-bold mb-4">Connected Components</h1>
  <p class="mb-6 opacity-70">Edit in one place, see updates everywhere.</p>

  <div class="flex gap-6 flex-wrap">
    <!-- Both components share the same path -->
    <alp-editor path="shared.profile"></alp-editor>
    <alp-display path="shared.profile"></alp-display>
  </div>

  <div class="mt-8">
    <button
      onclick="alp.ping('shared.profile', { name: 'Guest', color: '#888888' }, 'reset')"
      class="btn btn-warning"
    >
      Reset via External Ping
    </button>
  </div>

  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@main/alp.js?token=🎟️GitHubToken"></script>
  <script>
    // Editor component - allows editing and saving
    alp.define('editor', () => `
      <div class="card bg-base-200 p-6 w-72">
        <h2 class="font-bold mb-4">Editor</h2>
        <input
          x-model="name"
          class="input input-bordered w-full mb-2"
          placeholder="Name"
        >
        <input
          type="color"
          x-model="color"
          class="w-full h-10 cursor-pointer"
        >
        <button @click="save({ name, color })" class="btn btn-primary w-full mt-4">
          Save
        </button>
      </div>
    `, {
      name: '',
      color: '#3b82f6',
      async onPing(occasion, data) {
        if (occasion === 'mount' || occasion === 'path') {
          const saved = await this.load();
          if (saved) {
            this.name = saved.name;
            this.color = saved.color;
          }
        }
        // When the OTHER component saves, we get notified
        if (occasion === 'save-record') {
          this.name = data.name;
          this.color = data.color;
        }
        // Handle external reset ping
        if (occasion === 'reset') {
          this.name = data.name;
          this.color = data.color;
        }
      }
    });

    // Display component - read-only view
    alp.define('display', () => `
      <div class="card bg-base-200 p-6 w-72">
        <h2 class="font-bold mb-4">Display</h2>
        <div
          class="text-2xl font-bold p-4 rounded text-white text-center"
          :style="'background:' + color"
          x-text="name || 'No name set'"
        ></div>
        <div class="text-sm opacity-60 mt-4">
          Path: <span x-text="_path"></span>
        </div>
      </div>
    `, {
      name: '',
      color: '#888888',
      async onPing(occasion, data) {
        if (occasion === 'mount' || occasion === 'path') {
          const saved = await this.load();
          if (saved) {
            this.name = saved.name;
            this.color = saved.color;
          }
        }
        if (occasion === 'save-record') {
          this.name = data.name;
          this.color = data.color;
        }
        if (occasion === 'reset') {
          this.name = data.name;
          this.color = data.color;
        }
      }
    });
  </script>
</body>
</html>
```

**Key concepts:**
- Components at the same path receive each other's updates
- `onPing('save-record', data)` fires when any component saves to the path
- `alp.ping(path, data, occasion)` sends custom events to components at a path
- This enables reactive UIs where changes propagate automatically

---

## Next Steps

- Check the [README](README.md) for full API documentation
- Explore multi-database paths: `myDatabase/myStore:record.name`
- Use `alp.kit` for JSON editors, tables, and other utilities
- Add `?token=YOUR_GITHUB_TOKEN` to avoid API rate limits during development

Happy building!
