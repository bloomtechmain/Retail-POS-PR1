/**
 * electron-builder afterPack hook.
 * Obfuscates JS files in the BUILD OUTPUT only — source files are never modified.
 * Runs after electron-builder copies files but before creating the installer.
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// Safe obfuscation options for Node.js CommonJS modules
const OPTIONS = {
  compact: true,
  controlFlowFlattening: false,      // Skip — can break async/Promise chains
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,              // Don't rename exports/module.exports
  selfDefending: false,              // Skip — can cause issues in Node.js
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false,
};

function obfuscateFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, OPTIONS);
  fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8');
}

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      callback(fullPath);
    }
  }
}

exports.default = async function afterPack(context) {
  const appDir = path.join(context.appOutDir, 'resources', 'app');
  let count = 0;

  // 1. Obfuscate all compiled backend JS in the build output
  const backendDist = path.join(appDir, 'backend', 'dist');
  walkDir(backendDist, (file) => {
    obfuscateFile(file);
    count++;
  });
  console.log(`[afterPack] Backend: ${count} files obfuscated`);

  // 2. Obfuscate electron/license.js in the build output
  const licenseFile = path.join(appDir, 'electron', 'license.js');
  if (fs.existsSync(licenseFile)) {
    obfuscateFile(licenseFile);
    count++;
    console.log('[afterPack] License: electron/license.js obfuscated');
  }

  console.log(`[afterPack] Done. ${count} files protected.`);
};
