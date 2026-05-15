# Parrot Buddy Guide

Parrot Buddy는 Codex와 Claude Code 상태를 작고 귀여운 앵무새로 보여주는 macOS 메뉴바 앱입니다.

## 1. 빠른 시작

```bash
git clone https://github.com/Choah/parrot_buddy.git
cd parrot_buddy
npm install
npm run launch
```

종료:

```bash
npm run stop
```

## 2. 앱처럼 설치

```bash
npm run install:app
```

설치 위치는 `~/Applications/Parrot Buddy.app`입니다.

Finder나 Spotlight에서 `Parrot Buddy`를 실행하면 Dock에는 뜨지 않고 메뉴바에 작은 앵무새 아이콘이 생깁니다.

## 3. 메뉴바 사용

메뉴바 앵무새 아이콘에서 다음 작업을 할 수 있습니다.

- 메뉴바 아이콘 클릭: 현재 agent 상태가 들어 있는 메뉴 열기
- `Show Bird`: 앵무새 보이기
- `Hide Bird`: 앵무새 숨기기
- `Restart Agent Monitor`: Codex/Claude 감시 재시작
- `Quit`: 완전 종료

Codex 또는 Claude Code가 작업 중이거나 확인을 기다리는 동안에는 메뉴바 아이콘이 좌우로 흔들립니다. 대기 상태로 돌아오면 정적 아이콘으로 돌아갑니다.

## 4. 화면 조작

- 상태 박스 드래그: 앱 창 전체 이동
- 상태 박스 왼쪽/오른쪽 아래 핸들: 박스 크기 조정
- 상태 박스 오른쪽 위 `×`: 상태 박스 숨기기
- 앵무새 드래그: 창 안에서 앵무새 위치 조정
- Command를 누른 채 앵무새 드래그: 앱 창 전체 이동
- 앵무새 클릭: 또잉 애니메이션
- 상태 박스가 숨겨진 상태에서 앵무새 클릭: 상태 박스 다시 표시
- 앵무새 빠르게 3번 클릭: guide 열기/닫기
- 앵무새 우클릭 또는 Option을 누른 채 앵무새 클릭: 실제 투명 창 외곽선 표시
- 외곽선 모서리 드래그: 클릭을 막는 투명 창 영역 크기 조정. 상태 박스도 작은 창 크기에 맞춰 줄어듦
- Esc: guide 또는 창 크기 조정 모드 닫기

평소에는 compact 창으로 표시됩니다. guide를 열 때만 창이 더 커지고, 닫으면 다시 작아집니다.

## 5. 상태 의미

- `working`: Codex 또는 Claude Code가 작업 중
- `confirm`: Codex가 사용자 확인이나 승인을 기다림
- `ready`: 프로세스는 켜져 있고 대기 중
- `stopped`: 프로세스나 live lock을 찾지 못함

여러 Codex terminal이 동시에 떠 있으면 각각 폴더 이름과 turn id로 표시됩니다.

## 6. 감시 대상

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

## 7. 개발 명령

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
