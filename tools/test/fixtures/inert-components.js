// Inert stand-ins for components a template MOUNTS but the suite under test
// does not exercise.
//
// A jsdom suite renders the real template, so every x-data name in it has to
// resolve or Alpine throws and the mount is reported as a startup problem. The
// estate's Stage view mounts the stager, which mounts pathPicker and viewer in
// turn, so a test about the estate's own bench logic would otherwise have to
// load three unrelated components and their globals to assert on a getter.
//
// Pass this INSTEAD of the real component file, after alpine-bundle.js. It only
// registers names; anything asserting on the stager's behavior must load
// lib/alpineComponents/stage.js and its dependencies for real.
document.addEventListener('alpine:init', () => {
  for (const name of ['stager', 'pathPicker', 'viewer'])
    Alpine.data(name, () => ({ template: '<div></div>' }));
});
