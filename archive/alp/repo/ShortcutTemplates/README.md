# Shortcut Templates

HTML templates designed to be fetched and filled by Apple Shortcuts with dynamic data.

## How It Works

1. **Fetch the template** from GitHub via raw URL
2. **Replace the placeholder** `📲Input` with your JSON data
3. **Display the result** in a WebView or save as HTML

## Templates

### json-viewer.html

Interactive JSON viewer/editor with:
- Tree and text view of JSON data
- Navigation controls (d-pad)
- Zoom slider (50-100%)
- Copy and extract functionality
- Touch-optimized for mobile

**Placeholder:** `📲Input`

**Usage in Apple Shortcuts:**

```
1. Get contents of URL
   → https://raw.githubusercontent.com/YOUR_USERNAME/Alp/main/ShortcutTemplates/json-viewer.html

2. Replace Text
   Find: 📲Input
   Replace with: [Your JSON data as text with proper formatting]

3. Show Web Page or Quick Look
   → Display the modified HTML
```

**Example replacement:**

Replace `📲Input` with:
```javascript
{json: {"name": "example", "data": [1, 2, 3]}}
```

Result:
```javascript
window.data = {json: {"name": "example", "data": [1, 2, 3]}};
```

## Template Structure

All templates use the `📲Input` placeholder which should be replaced with valid JavaScript values. The placeholder appears in a `<script>` tag where data is assigned to `window.data`.

## Creating New Templates

To create a new template:

1. Create an HTML file in this directory
2. Add `📲Input` placeholder where dynamic data should be injected
3. Ensure the placeholder is in a valid JavaScript context
4. Document the template in this README

## Notes

- Templates use CDN-hosted libraries (Tailwind, jQuery, Phosphor Icons, vanilla-jsoneditor)
- Designed for mobile WebView display
- All JavaScript is inline for portability
- No server-side processing required
