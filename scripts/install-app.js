#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const appDir = path.resolve(__dirname, '..');
const appName = 'Parrot Buddy';
const systemApplications = '/Applications';
const userApplications = path.join(os.homedir(), 'Applications');
const requestedApplications = process.env.PARROT_BUDDY_APP_DIR;
const useUserApplications = process.argv.includes('--user');
const useSystemApplications = process.argv.includes('--system');

function canInstallTo(directory) {
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.accessSync(directory, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function installRoot() {
  if (requestedApplications) return requestedApplications;
  if (useUserApplications) return userApplications;
  if (useSystemApplications) return systemApplications;
  return canInstallTo(systemApplications) ? systemApplications : userApplications;
}

const applicationsDir = installRoot();
const bundleDir = path.join(applicationsDir, `${appName}.app`);
const contentsDir = path.join(bundleDir, 'Contents');
const macosDir = path.join(contentsDir, 'MacOS');
const resourcesDir = path.join(contentsDir, 'Resources');
const launcherPath = path.join(macosDir, appName);
const iconPath = path.join(resourcesDir, 'app-icon.icns');
const launchScriptPath = path.join(appDir, 'scripts', 'launch.js');

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function main() {
  execFileSync(process.execPath, [path.join(appDir, 'scripts', 'build-app-icon.js')], { stdio: 'inherit' });

  fs.mkdirSync(applicationsDir, { recursive: true });
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
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(launchScriptPath)} >/tmp/parrot-buddy-app-launch.log 2>&1
`);
  fs.chmodSync(launcherPath, 0o755);

  console.log(`Installed ${bundleDir}`);
  if (applicationsDir !== systemApplications) {
    console.log(`Note: /Applications was not writable, so the app was installed in ${applicationsDir}`);
  }
  console.log('Open it from Finder or Spotlight, then use the menu bar icon to show/hide or quit.');
}

main();
