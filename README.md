# Parrot Buddy

<p align="center">
  <img src="./assets/app-icon.png" width="180" alt="Parrot Buddy app icon" />
</p>

Codex와 Claude Code가 지금 작업 중인지, 확인을 기다리는지, 끝났는지 보여주는 작은 macOS 메뉴바 앵무새입니다.

일반 터미널 전체를 감시하는 앱이 아니라, 여러 개 떠 있는 Codex / Claude Code agent 상태를 빠르게 확인하기 위한 데스크톱 pet입니다.

## 주요 기능

- 여러 터미널에서 실행 중인 Codex turn을 각각 표시
- 같은 폴더의 Codex turn은 실제 살아있는 터미널 수까지만 최신 순으로 표시
- Claude Code 프로세스, hook state, project/transcript activity 감시
- Codex가 승인이나 사용자 확인을 기다리면 `confirm`으로 표시
- `confirm` 진입 또는 `working` 종료 시 앵무새가 또잉또잉 움직이고 짧은 짹짹 소리 재생
- 상태 박스 크기를 줄이면 항목이 아래로 밀리지 않고 `...`로 말줄임
- Dock에 뜨지 않고 메뉴바 아이콘으로 보이기, 숨기기, 재시작, 종료
- 앵무새 드래그, 상태 박스 드래그, 실제 투명 창 영역 크기 조정 지원

## 요구사항

- macOS
- Node.js 20 이상 권장
- npm

## 설치

```bash
git clone https://github.com/Choah/parrot_buddy.git
cd parrot_buddy
npm install
```

## 실행

로컬에서 바로 실행:

```bash
npm run launch
```

끄기:

```bash
npm run stop
```

상태 확인:

```bash
curl http://127.0.0.1:17872/health
curl http://127.0.0.1:17872/tasks
```

## macOS 앱으로 설치

Finder나 Spotlight에서 실행할 수 있는 앱 번들을 만듭니다.

```bash
npm run install:app
```

설치 위치:

```text
~/Applications/Parrot Buddy.app
```

설치 후 `Parrot Buddy.app`을 열면 Dock에는 뜨지 않고 메뉴바에 작은 앵무새 아이콘이 생깁니다.

## 조작법

- 상태 박스 드래그: Parrot Buddy 창 전체 이동
- 상태 박스 왼쪽/오른쪽 아래 핸들: 상태 박스 크기 조정
- 앵무새 드래그: 창 안에서 앵무새 위치 조정
- 앵무새 1회 클릭: 또잉 애니메이션
- 앵무새 빠르게 3회 클릭: guide 열기/닫기
- 앵무새 우클릭 또는 Option을 누른 채 앵무새 클릭: 실제 투명 창 외곽선 표시
- 외곽선 모서리 드래그: 클릭을 막는 투명 창 영역 크기 조정
- Esc: guide 또는 창 크기 조정 모드 닫기

## 상태 의미

- `working`: Codex 또는 Claude Code가 작업 중
- `confirm`: Codex가 승인, 충돌 처리, 실행 허가 같은 사용자 확인을 기다림
- `ready`: 프로세스는 켜져 있고 대기 중
- `stopped`: 관련 프로세스나 live lock을 찾지 못함

## 감시 대상

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

## Optional Shell Helpers

Codex / Claude Code 감시는 shell helper 없이 동작합니다. 별도 로컬 명령을 Parrot Buddy bridge에 직접 등록하고 싶을 때만 설치하세요.

```bash
npm run install:shell
```

제거:

```bash
npm run uninstall:shell
```

## 개발

```bash
npm test
npm run build:icon
npm run start
```

앱이 이상하게 남아 있으면:

```bash
npm run stop
npm run launch
```

## Sound Attribution

Completion chirp:

- Source: Wikimedia Commons, `File:Budgerigar chirping.ogg`
- URL: https://commons.wikimedia.org/wiki/File:Budgerigar_chirping.ogg
- Author: mary905
- License: Public domain

The original OGG is kept in `assets/budgerigar-chirp.ogg`; the app plays the converted CoreAudio file `assets/budgerigar-chirp.caf`.
