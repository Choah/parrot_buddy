#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const appDir = path.resolve(__dirname, '..');
const assetsDir = path.join(appDir, 'assets');
const svgPath = path.join(assetsDir, 'app-icon.svg');
const traySvgPath = path.join(assetsDir, 'tray-icon.svg');
const iconsetPath = path.join(assetsDir, 'app-icon.iconset');
const pngPath = path.join(assetsDir, 'app-icon.png');
const trayPath = path.join(assetsDir, 'tray-icon.png');
const icnsPath = path.join(assetsDir, 'app-icon.icns');

function sips(inputPath, size, outPath) {
  execFileSync('sips', ['-z', String(size), String(size), '-s', 'format', 'png', inputPath, '--out', outPath], {
    stdio: 'ignore'
  });
}

function main() {
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.rmSync(iconsetPath, { recursive: true, force: true });
  fs.mkdirSync(iconsetPath);

  const sizes = [
    [16, 1],
    [16, 2],
    [32, 1],
    [32, 2],
    [128, 1],
    [128, 2],
    [256, 1],
    [256, 2],
    [512, 1],
    [512, 2]
  ];

  for (const [points, scale] of sizes) {
    const pixels = points * scale;
    const suffix = scale === 1 ? '' : '@2x';
    sips(svgPath, pixels, path.join(iconsetPath, `icon_${points}x${points}${suffix}.png`));
  }

  sips(svgPath, 1024, pngPath);
  sips(fs.existsSync(traySvgPath) ? traySvgPath : svgPath, 22, trayPath);
  execFileSync('iconutil', ['-c', 'icns', iconsetPath, '-o', icnsPath], { stdio: 'ignore' });
  fs.rmSync(iconsetPath, { recursive: true, force: true });

  console.log(`Built ${path.relative(appDir, pngPath)}`);
  console.log(`Built ${path.relative(appDir, trayPath)}`);
  console.log(`Built ${path.relative(appDir, icnsPath)}`);
}

main();
