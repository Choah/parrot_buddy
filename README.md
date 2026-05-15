# Parrot Buddy

<p align="center">
  <img src="./assets/app-icon.png" width="180" alt="Parrot Buddy app icon" />
</p>

Codex와 Claude Code가 지금 작업 중인지, 확인을 기다리는지, 끝났는지 메뉴바 앵무새와 작은 데스크톱 pet으로 보여주는 macOS 앱입니다.

<img src="./assets/parrot-buddy-demo.gif" width="720" alt="Parrot Buddy demo" />

---

## 한국어 가이드

### 1. 요구사항

- macOS
- Node.js 20 이상 권장
- npm
- Git

Node.js가 없다면 먼저 설치하세요.

```bash
node --version
npm --version
```

### 2. 설치

```bash
git clone https://github.com/Choah/parrot_buddy.git
cd parrot_buddy
npm install
npm run install:app
```

`npm run install:app`은 Finder와 Spotlight에서 열 수 있는 macOS 앱을 만듭니다.

기본 설치 위치:

```text
/Applications/Parrot Buddy.app
```

`/Applications`에 쓸 권한이 없으면 자동으로 아래 위치에 설치됩니다.

```text
~/Applications/Parrot Buddy.app
```

사용자 Applications 폴더에 강제로 설치하려면:

```bash
npm run install:app -- --user
```

### 3. 실행

설치 후 다음 중 하나로 실행하세요.

- Finder에서 `Applications > Parrot Buddy.app` 더블클릭
- Spotlight에서 `Parrot Buddy` 검색 후 실행
- 터미널에서 실행:

```bash
npm run launch
```

앱은 Dock에 뜨지 않고, macOS 상단 메뉴바에 작은 앵무새 아이콘으로 표시됩니다.

종료:

```bash
npm run stop
```

상태 확인:

```bash
curl http://127.0.0.1:17872/health
```

### 4. 처음 실행하면 보이는 것

- 흰색 `window size` 외곽선은 실제 Parrot Buddy 창 크기입니다.
- 이 영역은 투명해 보여도 뒤에 있는 앱 클릭을 막을 수 있습니다.
- 그래서 앵무새와 상태 박스를 감싸는 최소 크기로 두는 것이 좋습니다.
- `window size` 옆 `guide` 버튼을 누르면 앱 안에서 사용법을 볼 수 있습니다.

### 5. 조작법

- 앵무새 드래그: 창 안에서 앵무새 위치 조정
- Command를 누른 채 앵무새 드래그: Parrot Buddy 창 전체 이동
- Guide 제목 줄 드래그: guide가 열린 상태에서 창 전체 이동
- 앵무새 우클릭 또는 Option을 누른 채 앵무새 클릭: 흰색 `window size` 외곽선 숨기기/다시 표시
- 상태 박스 드래그: Parrot Buddy 창 전체 이동
- 상태 박스 왼쪽/오른쪽 아래 핸들: 상태 박스 크기 조정
- 상태 박스 오른쪽 위 `×`: 상태 박스 숨기기
- 상태 박스가 숨겨진 상태에서 앵무새 클릭: 상태 박스 다시 표시
- 앵무새 빠르게 3회 클릭: guide 열기/닫기
- 외곽선 모서리 드래그: 실제 투명 창 크기 수동 조정
- Esc: guide 또는 창 크기 조정 모드 닫기

앵무새를 옮기거나 상태 박스 크기를 조절하면 흰색 창 영역이 내용에 맞춰 자동으로 줄거나 늘어납니다.

### 6. 메뉴바 사용

상단 메뉴바의 앵무새 아이콘을 클릭하면 현재 agent 상태와 메뉴가 보입니다.

- `Show Floating Bird`: 앵무새 창 보이기
- `Hide Bird`: 앵무새 창 숨기기
- `Restart Agent Monitor`: Codex/Claude 감시 재시작
- `Quit`: 앱 완전 종료

Codex 또는 Claude Code가 작업 중이거나 확인을 기다리는 동안에는 메뉴바 아이콘이 흔들립니다.

### 7. 상태 의미

- `working`: Codex 또는 Claude Code가 작업 중
- `confirm`: 승인, 충돌 처리, 실행 허가 같은 사용자 확인을 기다림
- `ready`: 프로세스는 켜져 있고 대기 중
- `stopped`: 관련 프로세스나 live lock을 찾지 못함

### 8. 감시 대상

Codex:

```text
~/.codex/sessions/**/*.jsonl
Codex CLI processes
Codex VS Code app-server process
```

Claude Code:

```text
~/.claude/hooks/peon-ping/.state.json
~/.claude/projects/**/*.jsonl
~/.claude/transcripts/**/*.jsonl
Claude Code processes
Claude IDE lock files
```

대화 전문은 UI에 표시하지 않습니다. 상태 판단에 필요한 lifecycle event, timestamp, cwd, process 정보만 사용합니다.

### 9. 문제 해결

앱이 이상하게 남아 있거나 실행이 안 되면:

```bash
npm run stop
npm run launch
```

앱 클릭 실행 로그:

```bash
cat /tmp/parrot-buddy-app-launch.log
cat /tmp/parrot-buddy.log
```

앱을 다시 설치:

```bash
npm run install:app
```

### 10. 개발

```bash
npm test
npm run build:icon
npm run start
```

Optional shell helper는 별도 로컬 명령을 Parrot Buddy bridge에 직접 등록하고 싶을 때만 설치하세요.

```bash
npm run install:shell
npm run uninstall:shell
```

---

## English Guide

### 1. Requirements

- macOS
- Node.js 20 or newer recommended
- npm
- Git

Check your local Node.js installation:

```bash
node --version
npm --version
```

### 2. Install

```bash
git clone https://github.com/Choah/parrot_buddy.git
cd parrot_buddy
npm install
npm run install:app
```

`npm run install:app` creates a macOS app bundle that can be opened from Finder or Spotlight.

Default install location:

```text
/Applications/Parrot Buddy.app
```

If `/Applications` is not writable, the installer falls back to:

```text
~/Applications/Parrot Buddy.app
```

To force user-level installation:

```bash
npm run install:app -- --user
```

### 3. Run

After installing, open the app in one of these ways:

- Double-click `Applications > Parrot Buddy.app` in Finder
- Search `Parrot Buddy` in Spotlight
- Start from the terminal:

```bash
npm run launch
```

The app does not appear in the Dock. It appears as a small parrot icon in the macOS menu bar.

Stop the app:

```bash
npm run stop
```

Check health:

```bash
curl http://127.0.0.1:17872/health
```

### 4. First Launch

- The white `window size` outline is the real Parrot Buddy window.
- Even though it is transparent, this area can block clicks to apps behind it.
- Keep it as small as possible around the parrot and status box.
- Click the `guide` button next to `window size` to open the in-app guide.

### 5. Controls

- Drag the parrot: move only the parrot inside the window
- Command + drag the parrot: move the whole Parrot Buddy window
- Drag the Guide title bar: move the whole window while the guide is open
- Right-click the parrot or Option + click the parrot: hide/show the white `window size` outline
- Drag the status box: move the whole Parrot Buddy window
- Drag the lower-left/lower-right handles on the status box: resize the status box
- Click `×` on the status box: hide the status box
- Click the parrot while the status box is hidden: show the status box again
- Triple-click the parrot quickly: open/close the guide
- Drag the white outline corners: manually resize the transparent window
- Esc: close the guide or window resize mode

When you move the parrot or resize the status box, the white window area automatically fits around the visible content.

### 6. Menu Bar

Click the menu bar parrot icon to see current agent status and actions.

- `Show Floating Bird`: show the floating parrot window
- `Hide Bird`: hide the floating parrot window
- `Restart Agent Monitor`: restart Codex/Claude monitoring
- `Quit`: quit the app

The menu bar icon wiggles while Codex or Claude Code is working or waiting for confirmation.

### 7. Status Meanings

- `working`: Codex or Claude Code is currently working
- `confirm`: user confirmation is needed, such as approval, conflict handling, or execution permission
- `ready`: the process is open and waiting
- `stopped`: no matching process or live lock was found

### 8. What It Watches

Codex:

```text
~/.codex/sessions/**/*.jsonl
Codex CLI processes
Codex VS Code app-server process
```

Claude Code:

```text
~/.claude/hooks/peon-ping/.state.json
~/.claude/projects/**/*.jsonl
~/.claude/transcripts/**/*.jsonl
Claude Code processes
Claude IDE lock files
```

Parrot Buddy does not display full conversation text. It only uses lifecycle events, timestamps, cwd, and process information needed to infer status.

### 9. Troubleshooting

If the app is stuck or does not open:

```bash
npm run stop
npm run launch
```

Logs for app-click launch:

```bash
cat /tmp/parrot-buddy-app-launch.log
cat /tmp/parrot-buddy.log
```

Reinstall the app bundle:

```bash
npm run install:app
```

### 10. Development

```bash
npm test
npm run build:icon
npm run start
```

Install optional shell helpers only if you want to manually report local command status to the Parrot Buddy bridge.

```bash
npm run install:shell
npm run uninstall:shell
```

---

## Sound Attribution

Completion chirp:

- Source: Wikimedia Commons, `File:Budgerigar chirping.ogg`
- URL: https://commons.wikimedia.org/wiki/File:Budgerigar_chirping.ogg
- Author: mary905
- License: Public domain

The original OGG is kept in `assets/budgerigar-chirp.ogg`; the app plays the converted CoreAudio file `assets/budgerigar-chirp.caf`.
