# Quickstart

```bash
npm install
npm run launch
```

The default view is a transparent yellow lovebird pet. Click `?` to open the compact guide and recent task list.

Stop the app:

```bash
npm run stop
```

Run a tracked terminal command:

```bash
./parrot-buddy -- node -e "setTimeout(()=>{console.log('done')}, 1200)"
```

Everything after `--` is the command to run. `--label` is optional and only changes the display name.

Run two tracked commands at once:

```bash
node bin/buddy-run.js --label "Slow pass" -- node -e "setTimeout(()=>process.exit(0), 3000)" &
node bin/buddy-run.js --label "Fast fail" -- node -e "setTimeout(()=>process.exit(1), 1000)"
```

Use from VS Code:

1. Open this folder in VS Code.
2. Run `Terminal: Run Task`.
3. Pick one of the Parrot Buddy example tasks.

Read the local guide:

```bash
open GUIDE.md
```
