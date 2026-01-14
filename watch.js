const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');

console.log(`Watching ${SRC_DIR} for changes...`);

let debounceTimer;

fs.watch(SRC_DIR, (eventType, filename) => {
    if (filename && !filename.startsWith('.')) {
        // Debounce to prevent multiple builds for single save
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            console.log(`\nDetected change in ${filename}. Rebuilding...`);
            exec('node builder.js', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Build error: ${error}`);
                    return;
                }
                console.log(stdout);
                if (stderr) console.error(stderr);
                console.log(`[${new Date().toLocaleTimeString()}] Waiting for changes...`);
            });
        }, 100);
    }
});
