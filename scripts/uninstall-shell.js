#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const zshrc = path.join(os.homedir(), '.zshrc');
const appDir = path.resolve(__dirname, '..');
const shellPath = path.join(appDir, 'shell', 'parrot-buddy.zsh');

function zshQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const sourceLine = `source ${zshQuote(shellPath)}`;

if (!fs.existsSync(zshrc)) {
  console.log('~/.zshrc was not found.');
  process.exit(0);
}

const next = fs
  .readFileSync(zshrc, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== sourceLine)
  .join('\n')
  .replace(/\n# Parrot Buddy terminal integration\n\n/g, '\n');

fs.writeFileSync(zshrc, next.endsWith('\n') ? next : `${next}\n`);
console.log('Parrot Buddy zsh integration removed from ~/.zshrc.');
