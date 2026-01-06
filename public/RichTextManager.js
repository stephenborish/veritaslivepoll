
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

// Register the blot
Quill.register(MathLiveBlot);

// Register Image Resize Module
if (window.ImageResize) {
    Quill.register('modules/imageResize', window.ImageResize);
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
        if (type === 'stem') {
            return [
                ['bold', 'italic', 'underline', 'strike'],
                ['blockquote', 'code-block'],
                ['formula'], // Matches our custom handler name

                [{ 'header': 1 }, { 'header': 2 }],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                [{ 'script': 'sub' }, { 'script': 'super' }],
                [{ 'indent': '-1' }, { 'indent': '+1' }],
                [{ 'direction': 'rtl' }],

                [{ 'size': ['small', false, 'large', 'huge'] }],
                [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

                [{ 'color': [] }, { 'background': [] }],
                [{ 'font': [] }],
                [{ 'align': [] }],

                ['clean'],
                ['link', 'image', 'video']
            ];
        } else if (type === 'option') {
            return [
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'script': 'sub' }, { 'script': 'super' }],
                ['formula'],

                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                [{ 'indent': '-1' }, { 'indent': '+1' }],

                [{ 'color': [] }, { 'background': [] }],
                [{ 'align': [] }],

                ['link', 'image'],
                ['clean']
            ];
        }
        return [['bold', 'italic'], ['clean']];
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
