// ==UserScript==
// @name        wt probe-require
// @description Does the iOS Userscripts build fetch a remote @require? A bar at the top of the page says yes; nothing says no.
// @match       https://github.com/*
// @match       https://mehrlander.github.io/*
// @require     https://cdn.jsdelivr.net/gh/mehrlander/web-tools@03b527a4796b48bb5e960cb72d42c0111f31b9dd/userscripts/lib/probe-bar.js
// @run-at      document-end
// ==/UserScript==
window.wtProbeBar({ route: 'userscript', ref: '03b527a4796b48bb5e960cb72d42c0111f31b9dd' });
