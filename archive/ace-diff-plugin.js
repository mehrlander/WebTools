/**
 * Ace Editor Diff Plugin
 * A comprehensive plugin for displaying text differences in Ace Editor
 * Supports both unified and inline diff views with customizable styling
 * 
 * @requires ace/ace
 * @requires diff-match-patch
 */
(function(ace) {
    'use strict';
    
    // Ensure dependencies are available
    if (!ace) {
        console.error('Ace Editor is required for ace-diff-plugin');
        return;
    }
    
    if (!window.diff_match_patch) {
        console.error('diff-match-patch is required for ace-diff-plugin');
        return;
    }
    
    const Range = ace.require('ace/range').Range;
    const diff_match_patch = window.diff_match_patch;
    
    // Define the plugin module
    ace.define('ace/ext/diff', ['require', 'exports', 'module'], function(require, exports, module) {
        
        /**
         * AceDiffPlugin Class
         * Main plugin class that handles diff visualization in Ace Editor
         */
        class AceDiffPlugin {
            constructor(editor, options = {}) {
                if (!editor) {
                    throw new Error('Editor instance is required');
                }
                
                this.editor = editor;
                this.session = editor.getSession();
                this.dmp = new diff_match_patch();
                
                // Plugin state
                this.markers = [];
                this.gutterDecorations = [];
                this.originalText = '';
                this.modifiedText = '';
                this.lastDiffs = null;
                
                // Default options with theme integration
                this.options = {
                    mode: 'unified', // 'unified' or 'inline'
                    readOnly: true,
                    showGutter: true,
                    syntaxMode: 'auto', // 'auto' or specific mode like 'javascript'
                    colors: {
                        added: 'rgba(34, 197, 94, 0.15)',
                        deleted: 'rgba(239, 68, 68, 0.15)',
                        addedGutter: 'rgba(34, 197, 94, 0.2)',
                        deletedGutter: 'rgba(239, 68, 68, 0.2)',
                        addedInline: 'rgba(34, 197, 94, 0.25)',
                        deletedInline: 'rgba(239, 68, 68, 0.25)'
                    },
                    cssPrefix: 'ace-diff',
                    debounceDelay: 300,
                    cleanupSemantic: true,
                    ...options
                };
                
                // Generate unique ID for this instance
                this.instanceId = `${this.options.cssPrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                this.styleId = `${this.instanceId}-styles`;
                
                // Initialize
                this._init();
            }
            
            /**
             * Initialize the plugin
             * @private
             */
            _init() {
                // Set editor options
                if (this.options.readOnly) {
                    this.editor.setReadOnly(true);
                }
                
                // Disable syntax checking for diff mode
                this.session.setUseWorker(false);
                
                // Set up gutter visibility
                this.editor.renderer.setShowGutter(this.options.showGutter);
                
                // Inject initial styles
                this._injectStyles();
                
                // Store original editor state for cleanup
                this._originalEditorState = {
                    readOnly: this.editor.getReadOnly(),
                    mode: this.session.getMode().$id,
                    useWorker: this.session.getUseWorker()
                };
            }
            
            /**
             * Main API method to show diff between two texts
             * @param {string} originalText - Original text
             * @param {string} modifiedText - Modified text
             * @param {string} [mode] - Optional mode override ('unified' or 'inline')
             */
            showDiff(originalText, modifiedText, mode = null) {
                this.originalText = originalText || '';
                this.modifiedText = modifiedText || '';
                
                if (mode && (mode === 'unified' || mode === 'inline')) {
                    this.options.mode = mode;
                }
                
                // Clear previous diff
                this.clear();
                
                // Calculate diff
                const diffs = this.dmp.diff_main(this.originalText, this.modifiedText);
                
                if (this.options.cleanupSemantic) {
                    this.dmp.diff_cleanupSemantic(diffs);
                }
                
                this.lastDiffs = diffs;
                
                // Apply appropriate diff view
                if (this.options.mode === 'unified') {
                    this._showUnifiedDiff(diffs);
                } else {
                    this._showInlineDiff(diffs);
                }
                
                // Emit event
                this._emit('diff-updated', {
                    mode: this.options.mode,
                    stats: this.getStats()
                });
            }
            
            /**
             * Clear all diff markers and content
             */
            clear() {
                // Remove all markers
                this.markers.forEach(markerId => {
                    try {
                        this.session.removeMarker(markerId);
                    } catch (e) {
                        // Marker might already be removed
                    }
                });
                this.markers = [];
                
                // Clear gutter decorations
                this.gutterDecorations.forEach(({ row, className }) => {
                    try {
                        this.session.removeGutterDecoration(row, className);
                    } catch (e) {
                        // Decoration might already be removed
                    }
                });
                this.gutterDecorations = [];
                
                // Clear annotations
                this.session.clearAnnotations();
                
                // Force renderer update
                this.editor.renderer.updateFull(true);
            }
            
            /**
             * Change display mode
             * @param {string} mode - 'unified' or 'inline'
             */
            setMode(mode) {
                if (mode === 'unified' || mode === 'inline') {
                    const previousMode = this.options.mode;
                    this.options.mode = mode;
                    
                    // Re-render if we have existing diffs
                    if (this.lastDiffs && previousMode !== mode) {
                        this.showDiff(this.originalText, this.modifiedText);
                    }
                }
            }
            
            /**
             * Update plugin colors
             * @param {Object} colors - Color configuration object
             */
            setColors(colors) {
                this.options.colors = { ...this.options.colors, ...colors };
                this._updateStyles();
                
                // Re-apply diff if exists
                if (this.lastDiffs) {
                    this.showDiff(this.originalText, this.modifiedText);
                }
            }
            
            /**
             * Get diff statistics
             * @returns {Object} Statistics object
             */
            getStats() {
                if (!this.lastDiffs) {
                    return { additions: 0, deletions: 0, changes: 0 };
                }
                
                let additions = 0;
                let deletions = 0;
                
                this.lastDiffs.forEach(([op, text]) => {
                    if (op === 1) {
                        additions += text.length;
                    } else if (op === -1) {
                        deletions += text.length;
                    }
                });
                
                return {
                    additions,
                    deletions,
                    changes: this.markers.length
                };
            }
            
            /**
             * Navigate to next change
             */
            nextChange() {
                const currentRow = this.editor.getCursorPosition().row;
                const changes = this._getChangePositions();
                
                const nextChange = changes.find(pos => pos.row > currentRow);
                if (nextChange) {
                    this.editor.gotoLine(nextChange.row + 1, 0, true);
                    this.editor.focus();
                }
            }
            
            /**
             * Navigate to previous change
             */
            prevChange() {
                const currentRow = this.editor.getCursorPosition().row;
                const changes = this._getChangePositions();
                
                const prevChange = changes.reverse().find(pos => pos.row < currentRow);
                if (prevChange) {
                    this.editor.gotoLine(prevChange.row + 1, 0, true);
                    this.editor.focus();
                }
            }
            
            /**
             * Clean up and destroy the plugin
             */
            destroy() {
                // Clear all diff content
                this.clear();
                
                // Remove styles
                this._removeStyles();
                
                // Restore original editor state
                if (this._originalEditorState) {
                    this.editor.setReadOnly(this._originalEditorState.readOnly);
                    this.session.setMode(this._originalEditorState.mode);
                    this.session.setUseWorker(this._originalEditorState.useWorker);
                }
                
                // Clear references
                this.editor = null;
                this.session = null;
                this.dmp = null;
                this.lastDiffs = null;
                
                this._emit('destroyed');
            }
            
            /**
             * Show unified diff view
             * @private
             */
            _showUnifiedDiff(diffs) {
                // Set diff mode for syntax highlighting
                this.session.setMode('ace/mode/diff');
                
                // Create unified diff
                const result = this._createUnifiedDiff(diffs);
                
                // Set content
                this.editor.setValue(result.text, -1);
                
                // Apply markers with slight delay to ensure content is rendered
                setTimeout(() => {
                    this._applyUnifiedMarkers(result.markers);
                }, 10);
            }
            
            /**
             * Show inline diff view
             * @private
             */
            _showInlineDiff(diffs) {
                // Determine syntax mode
                const mode = this._determineSyntaxMode();
                this.session.setMode(mode);
                
                // Create inline diff
                const result = this._createInlineDiff(diffs);
                
                // Set content
                this.editor.setValue(result.text, -1);
                
                // Apply markers with slight delay
                setTimeout(() => {
                    this._applyInlineMarkers(result.markers);
                }, 10);
            }
            
            /**
             * Create unified diff from diffs array
             * @private
             */
            _createUnifiedDiff(diffs) {
                const lines = [];
                const markers = [];
                let lineNumber = 0;
                let additions = 0;
                let deletions = 0;
                
                diffs.forEach(([operation, text]) => {
                    const textLines = text.split('\n');
                    
                    // Remove empty last line if exists
                    if (textLines[textLines.length - 1] === '') {
                        textLines.pop();
                    }
                    
                    textLines.forEach(line => {
                        let prefix = '  ';
                        let markerType = null;
                        
                        if (operation === -1) {
                            prefix = '- ';
                            markerType = 'deleted';
                            deletions++;
                        } else if (operation === 1) {
                            prefix = '+ ';
                            markerType = 'added';
                            additions++;
                        }
                        
                        lines.push(prefix + line);
                        
                        if (markerType) {
                            markers.push({
                                row: lineNumber,
                                type: markerType
                            });
                        }
                        
                        lineNumber++;
                    });
                });
                
                return {
                    text: lines.join('\n'),
                    markers,
                    stats: { additions, deletions }
                };
            }
            
            /**
             * Create inline diff from diffs array
             * @private
             */
            _createInlineDiff(diffs) {
                let text = '';
                const markers = [];
                let position = 0;
                
                diffs.forEach(([operation, content]) => {
                    const startPos = position;
                    
                    if (operation === 0) {
                        // Unchanged text
                        text += content;
                        position += content.length;
                    } else if (operation === -1) {
                        // Deleted text
                        text += content;
                        markers.push({
                            start: startPos,
                            end: position + content.length,
                            type: 'deleted'
                        });
                        position += content.length;
                    } else if (operation === 1) {
                        // Added text
                        text += content;
                        markers.push({
                            start: startPos,
                            end: position + content.length,
                            type: 'added'
                        });
                        position += content.length;
                    }
                });
                
                return { text, markers };
            }
            
            /**
             * Apply markers for unified diff
             * @private
             */
            _applyUnifiedMarkers(markers) {
                const markedLines = new Set();
                
                markers.forEach(marker => {
                    // Skip if line already marked
                    if (markedLines.has(marker.row)) return;
                    markedLines.add(marker.row);
                    
                    // Get line content
                    const line = this.session.getLine(marker.row);
                    if (line === undefined) return;
                    
                    // Create range for full line
                    const range = new Range(marker.row, 0, marker.row, line.length);
                    
                    // Add marker
                    const className = `${this.options.cssPrefix}-${marker.type}-line`;
                    const markerId = this.session.addMarker(range, className, 'fullLine', true);
                    this.markers.push(markerId);
                    
                    // Add gutter decoration
                    if (this.options.showGutter) {
                        const gutterClass = `${this.options.cssPrefix}-gutter-${marker.type}`;
                        this.session.addGutterDecoration(marker.row, gutterClass);
                        this.gutterDecorations.push({ row: marker.row, className: gutterClass });
                    }
                });
            }
            
            /**
             * Apply markers for inline diff
             * @private
             */
            _applyInlineMarkers(markers) {
                // Sort markers by start position
                markers.sort((a, b) => a.start - b.start);
                
                // Track processed ranges to avoid overlaps
                let lastEnd = -1;
                
                markers.forEach(marker => {
                    // Skip overlapping markers
                    if (marker.start < lastEnd) return;
                    lastEnd = marker.end;
                    
                    try {
                        // Convert positions to row/column
                        const startPos = this.session.getDocument().indexToPosition(marker.start);
                        const endPos = this.session.getDocument().indexToPosition(marker.end);
                        
                        // Create range
                        const range = new Range(
                            startPos.row,
                            startPos.column,
                            endPos.row,
                            endPos.column
                        );
                        
                        // Add marker
                        const className = `${this.options.cssPrefix}-inline-${marker.type}`;
                        const markerId = this.session.addMarker(range, className, 'text', false);
                        this.markers.push(markerId);
                    } catch (e) {
                        console.warn('Failed to apply inline marker:', e);
                    }
                });
            }
            
            /**
             * Determine syntax mode for inline diff
             * @private
             */
            _determineSyntaxMode() {
                if (this.options.syntaxMode === 'auto') {
                    // Try to detect from file extension or content
                    const firstLine = this.originalText.split('\n')[0] || '';
                    
                    if (firstLine.includes('<!DOCTYPE') || firstLine.includes('<html')) {
                        return 'ace/mode/html';
                    } else if (this.originalText.includes('function') || this.originalText.includes('const')) {
                        return 'ace/mode/javascript';
                    } else if (this.originalText.includes('def ') || this.originalText.includes('import ')) {
                        return 'ace/mode/python';
                    }
                    
                    // Default to text
                    return 'ace/mode/text';
                } else {
                    return `ace/mode/${this.options.syntaxMode}`;
                }
            }
            
            /**
             * Get positions of all changes
             * @private
             */
            _getChangePositions() {
                const positions = [];
                const markers = this.session.getMarkers(false);
                
                Object.values(markers).forEach(marker => {
                    if (marker.clazz && marker.clazz.includes(this.options.cssPrefix)) {
                        positions.push({
                            row: marker.range.start.row,
                            type: marker.clazz.includes('added') ? 'added' : 'deleted'
                        });
                    }
                });
                
                return positions.sort((a, b) => a.row - b.row);
            }
            
            /**
             * Inject CSS styles
             * @private
             */
            _injectStyles() {
                this._removeStyles();
                
                const style = document.createElement('style');
                style.id = this.styleId;
                style.textContent = this._generateCSS();
                document.head.appendChild(style);
            }
            
            /**
             * Update CSS styles
             * @private
             */
            _updateStyles() {
                const style = document.getElementById(this.styleId);
                if (style) {
                    style.textContent = this._generateCSS();
                }
            }
            
            /**
             * Remove CSS styles
             * @private
             */
            _removeStyles() {
                const style = document.getElementById(this.styleId);
                if (style) {
                    style.remove();
                }
            }
            
            /**
             * Generate CSS for the plugin
             * @private
             */
            _generateCSS() {
                const p = this.options.cssPrefix;
                const c = this.options.colors;
                const id = this.editor.container.id;
                
                return `
                    /* Unified diff styles */
                    #${id} .${p}-added-line {
                        position: absolute;
                        background: ${c.added} !important;
                        z-index: 5;
                        width: 100%;
                        pointer-events: none;
                    }
                    #${id} .${p}-deleted-line {
                        position: absolute;
                        background: ${c.deleted} !important;
                        z-index: 5;
                        width: 100%;
                        pointer-events: none;
                    }
                    #${id} .${p}-gutter-added {
                        background: ${c.addedGutter} !important;
                    }
                    #${id} .${p}-gutter-deleted {
                        background: ${c.deletedGutter} !important;
                    }
                    
                    /* Inline diff styles */
                    #${id} .${p}-inline-added {
                        position: absolute;
                        background: ${c.addedInline} !important;
                        z-index: 5;
                        pointer-events: none;
                        border-radius: 2px;
                    }
                    #${id} .${p}-inline-deleted {
                        position: absolute;
                        background: ${c.deletedInline} !important;
                        text-decoration: line-through !important;
                        z-index: 5;
                        pointer-events: none;
                        border-radius: 2px;
                    }
                    
                    /* Ensure proper layering */
                    #${id} .ace_marker-layer .${p}-added-line,
                    #${id} .ace_marker-layer .${p}-deleted-line,
                    #${id} .ace_marker-layer .${p}-inline-added,
                    #${id} .ace_marker-layer .${p}-inline-deleted {
                        pointer-events: none;
                    }
                    
                    /* Optional: Animation for markers */
                    #${id} .ace_marker-layer > div[class*="${p}-"] {
                        transition: opacity 0.2s ease-in-out;
                    }
                `;
            }
            
            /**
             * Emit custom events
             * @private
             */
            _emit(eventName, data = {}) {
                if (this.editor && this.editor.container) {
                    const event = new CustomEvent(`ace-diff-${eventName}`, {
                        detail: {
                            plugin: this,
                            ...data
                        }
                    });
                    this.editor.container.dispatchEvent(event);
                }
            }
        }
        
        /**
         * Factory function to create a new diff plugin instance
         * @param {Object} editor - Ace editor instance
         * @param {Object} options - Plugin options
         * @returns {AceDiffPlugin} Plugin instance
         */
        function createDiff(editor, options) {
            return new AceDiffPlugin(editor, options);
        }
        
        /**
         * Convenience method to extract theme colors from CSS variables
         * Useful for Tailwind/DaisyUI integration
         */
        function getThemeColors() {
            const computedStyle = getComputedStyle(document.documentElement);
            const getColor = (varName, opacity = 1) => {
                const color = computedStyle.getPropertyValue(varName);
                if (color.includes('rgb')) {
                    return color.replace(')', ` / ${opacity})`);
                } else if (color) {
                    // Convert hex to rgba
                    const r = parseInt(color.slice(1, 3), 16);
                    const g = parseInt(color.slice(3, 5), 16);
                    const b = parseInt(color.slice(5, 7), 16);
                    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
                }
                return null;
            };
            
            return {
                added: getColor('--color-success', 0.15) || 'rgba(34, 197, 94, 0.15)',
                deleted: getColor('--color-error', 0.15) || 'rgba(239, 68, 68, 0.15)',
                addedGutter: getColor('--color-success', 0.2) || 'rgba(34, 197, 94, 0.2)',
                deletedGutter: getColor('--color-error', 0.2) || 'rgba(239, 68, 68, 0.2)',
                addedInline: getColor('--color-success', 0.25) || 'rgba(34, 197, 94, 0.25)',
                deletedInline: getColor('--color-error', 0.25) || 'rgba(239, 68, 68, 0.25)'
            };
        }
        
        // Export public API
        exports.AceDiffPlugin = AceDiffPlugin;
        exports.createDiff = createDiff;
        exports.getThemeColors = getThemeColors;
        
        // Also attach to ace.ext namespace for convenience
        if (!ace.ext) ace.ext = {};
        ace.ext.diff = {
            AceDiffPlugin,
            createDiff,
            getThemeColors
        };
    });
    
})(window.ace);