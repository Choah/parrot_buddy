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
const block = [
  '',
  '# Parrot Buddy terminal integration',
  sourceLine
].join('\n');

const current = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, 'utf8') : '';

if (current.includes(sourceLine)) {
  console.log('Parrot Buddy zsh integration is already installed.');
  console.log('Open a new terminal, or run: source ~/.zshrc');
  process.exit(0);
}

fs.appendFileSync(zshrc, `${block}\n`);
console.log('Parrot Buddy zsh integration added to ~/.zshrc.');
console.log('Open a new terminal, or run: source ~/.zshrc');
