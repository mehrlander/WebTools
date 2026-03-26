{
name: 'My Custom Tab',
icon: 'ph ph-rocket',  // optional
content: function() {
  return `<div class="p-6">
    <h2 class="text-xl mb-4">My Custom Content</h2>
    <p>This tab was loaded from GitHub!</p>
    <button @click="console.log('Clicked!')" class="btn btn-primary mt-4">
      Test Button
    </button>
  </div>`;
}
}
