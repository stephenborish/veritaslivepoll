
// Custom Blot for MathLive
const Embed = Quill.import('blots/embed');

class MathLiveBlot extends Embed {
    static create(value) {
        const node = super.create(value);

        // Create the math-field element
        // We treat 'value' as the initial LaTeX content
        if (typeof value === 'string') {
            node.value = value;
        }

        // Enable virtual keyboard and basic configuration
        node.setAttribute('virtual-keyboard-mode', 'manual');

        // Optional: Customize MathLive (e.g. keybindings, smartMode)
        // node.smartMode = true;

        return node;
    }

    static value(node) {
        return node.value;
    }
}

MathLiveBlot.blotName = 'mathlive'; // format name
MathLiveBlot.tagName = 'math-field'; // renders as <math-field>
MathLiveBlot.className = 'math-field-blot'; // optional class

// Register the blot if not already registered
if (!Quill.imports['test/mathlive']) {
    Quill.register(MathLiveBlot);
}

// Register Font Whitelist
var Font = Quill.import('formats/font');
Font.whitelist = ['sans-serif', 'serif', 'monospace', 'computer-modern'];
Quill.register(Font, true);

// Register Image Resize Module safely
if (window.ImageResize) {
    if (!Quill.imports['modules/imageResize']) {
        Quill.register('modules/imageResize', window.ImageResize);
    }
} else {
    console.warn('ImageResize module not found');
}

export class RichTextManager {
    constructor() {
        this.instances = {};
    }

    /**
     * Initialize a Quill editor on a target element.
     * @param {string} elementId 
     * @param {string} type 
     * @param {string} [placeholder] 
     * @returns {Object} The Quill instance.
     */
    initialize(elementId, type = 'stem', placeholder = '') {
        const toolbarOptions = this.getToolbarConfig(type);

        const element = document.getElementById(elementId);
        if (!element) return null;

        if (this.instances[elementId]) {
            return this.instances[elementId];
        }

        const quill = new Quill(`#${elementId}`, {
            theme: 'snow',
            placeholder: placeholder,
            modules: {
                imageResize: {
                    displaySize: true
                },
                toolbar: {
                    container: toolbarOptions,
                    handlers: {
                        // Override the 'formula' button handler
                        'formula': function () {
                            // Get cursor position
                            const range = this.quill.getSelection(true);

                            // Insert the custom MathLive blot
                            // Initial value can be empty string or a placeholder placeholder like f(x)
                            this.quill.insertEmbed(range.index, 'mathlive', '');

                            // Move cursor after the inserted blot
                            this.quill.setSelection(range.index + 1);
                        }
                    }
                }
            }
        });

        this.instances[elementId] = quill;
        return quill;
    }

    getToolbarConfig(type) {
        // Simplified Toolbar - Single Line for both stems and options
        // Removed: header, blockquote, code-block, indent, direction, video
        // Retained: Font, Bold, Italic, Underline, Strike, Formula, Sub/Super, List, Color, Highlight(Background), Align, Clean, Link, Image
        return [
            [{ 'font': ['sans-serif', 'serif', 'monospace', 'computer-modern'] }], // Added Font
            ['bold', 'italic', 'underline', 'strike'],
            ['formula'],
            [{ 'script': 'sub' }, { 'script': 'super' }],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            [{ 'color': [] }, { 'background': [] }], // Restored Highlight
            [{ 'align': [] }],
            ['link', 'image'],
            ['clean']
        ];
    }

    getContent(elementId) {
        const quill = this.instances[elementId];
        return quill ? quill.root.innerHTML : '';
    }

    getText(elementId) {
        const quill = this.instances[elementId];
        return quill ? quill.getText() : '';
    }

    setContent(elementId, html) {
        const quill = this.instances[elementId];
        if (quill) {
            // Use clipboard for HTML
            // Note: dangerouslyPasteHTML is standard Quill API (renamed in 2.0 but this is 1.3.6)
            quill.clipboard.dangerouslyPasteHTML(html);
        }
    }

    destroy(elementId) {
        if (this.instances[elementId]) {
            // Quill doesn't have a strict destroy that removes DOM, but we can clear instance
            delete this.instances[elementId];
        }
    }
}

export const richTextManager = new RichTextManager();
