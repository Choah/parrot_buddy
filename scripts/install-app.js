#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const appDir = path.resolve(__dirname, '..');
const appName = 'Parrot Buddy';
const userApplications = path.join(os.homedir(), 'Applications');
const bundleDir = path.join(userApplications, `${appName}.app`);
const contentsDir = path.join(bundleDir, 'Contents');
const macosDir = path.join(contentsDir, 'MacOS');
const resourcesDir = path.join(contentsDir, 'Resources');
const launcherPath = path.join(macosDir, appName);
const iconPath = path.join(resourcesDir, 'app-icon.icns');

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function main() {
  execFileSync(process.execPath, [path.join(appDir, 'scripts', 'build-app-icon.js')], { stdio: 'inherit' });

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.copyFileSync(path.join(appDir, 'assets', 'app-icon.icns'), iconPath);

  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${xmlEscape(appName)}</string>
  <key>CFBundleIconFile</key>
  <string>app-icon</string>
  <key>CFBundleIdentifier</key>
  <string>local.parrot-buddy.agent-monitor</string>
  <key>CFBundleName</key>
  <string>${xmlEscape(appName)}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSBackgroundOnly</key>
  <false/>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`);

  fs.writeFileSync(launcherPath, `#!/bin/zsh
cd ${JSON.stringify(appDir)}
/usr/bin/env npm run launch >/tmp/parrot-buddy-app-launch.log 2>&1
`);
  fs.chmodSync(launcherPath, 0o755);

  console.log(`Installed ${bundleDir}`);
  console.log('Open it from Finder or Spotlight, then use the menu bar icon to show/hide or quit.');
}

main();
