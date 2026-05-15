# Parrot Buddy

Codex와 Claude Code가 지금 일하는지, 확인을 기다리는지, 대기 중인지 보여주는 작은 macOS 메뉴바 앵무새입니다.

이 앱은 일반 터미널 명령 전체를 추적하는 도구가 아니라, Codex/Claude Code agent 상태를 보는 데 맞춘 데스크톱 pet입니다.

## Features

- 여러 터미널에서 실행 중인 Codex turn을 각각 표시
- Codex가 사용자 승인이나 확인을 기다리면 `confirm` 상태로 표시
- Claude Code 프로세스, hook state, transcript activity 감시
- 작업이 끝나면 짧은 앵무새 chirp 소리 재생
- Dock에 뜨지 않고 메뉴바 앱처럼 동작
- 상태 박스를 드래그해서 앱 창 이동
- 앵무새를 드래그해서 창 안 위치 조정
- 앵무새를 빠르게 세 번 클릭해서 guide 열기

## Requirements

- macOS
- Node.js 20 이상 권장
- npm

## Setup

```bash
git clone https://github.com/Choah/parrot_buddy.git
cd parrot_buddy
npm install
```

## Run

개발/로컬 실행:

```bash
npm run launch
```

끄기:

```bash
npm run stop
```

실행 상태 확인:

```bash
curl http://127.0.0.1:17872/health
curl http://127.0.0.1:17872/tasks
```

## Install As A macOS App

Finder나 Spotlight에서 실행할 수 있는 앱 번들을 만듭니다.

```bash
npm run install:app
```

설치 위치:

```text
~/Applications/Parrot Buddy.app
```

설치 후에는 `Parrot Buddy.app`을 열고, 메뉴바의 작은 앵무새 아이콘에서 보이기/숨기기/재시작/종료를 할 수 있습니다.

## Optional Shell Helpers

로컬 명령을 Parrot Buddy bridge에 직접 등록하고 싶을 때만 사용합니다.

```bash
npm run install:shell
```

이 앱의 기본 목적은 Codex/Claude Code 감시이므로, shell helper 없이도 agent 상태 감시는 동작합니다.

## What It Watches

Codex:

```text
~/.codex/sessions/**/*.jsonl
Codex CLI / VS Code app-server processes
```

Claude Code:

```text
~/.claude/hooks/peon-ping/.state.json
~/.claude/projects/**/*.jsonl
~/.claude/transcripts/**/*.jsonl
Claude Code processes / IDE locks
```

대화 전문을 UI에 표시하지 않습니다. 상태 판단에 필요한 lifecycle event, timestamp, cwd 정도만 사용합니다.

## Controls

- 상태 박스 드래그: 앱 창 전체 이동
- 상태 박스 오른쪽/왼쪽 아래 핸들: 상태 박스 크기 조정
- 앵무새 드래그: 창 안에서 앵무새 위치 조정
- 앵무새 1회 클릭: 또잉 애니메이션
- 앵무새 빠르게 3회 클릭: guide 열기/닫기
- Esc: guide 닫기

## Development

```bash
npm test
npm run build:icon
npm run start
```

## Sound Attribution

Completion chirp:

- Source: Wikimedia Commons, `File:Budgerigar chirping.ogg`
- URL: https://commons.wikimedia.org/wiki/File:Budgerigar_chirping.ogg
- Author: mary905
- License: Public domain

The original OGG is kept in `assets/budgerigar-chirp.ogg`; the app plays the converted CoreAudio file `assets/budgerigar-chirp.caf`.

