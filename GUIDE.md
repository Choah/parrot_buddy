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

기본 설치 위치는 `/Applications/Parrot Buddy.app`입니다. `/Applications`에 쓸 권한이 없으면 자동으로 `~/Applications/Parrot Buddy.app`에 설치됩니다.

Finder의 Applications에서 `Parrot Buddy.app`을 열거나 Spotlight에서 `Parrot Buddy`를 실행하면 Dock에는 뜨지 않고 메뉴바에 작은 앵무새 아이콘이 생깁니다.

## 3. 메뉴바 사용

메뉴바 앵무새 아이콘에서 다음 작업을 할 수 있습니다.

- 메뉴바 아이콘 클릭: 현재 agent 상태가 들어 있는 메뉴 열기
- `Show Bird`: 앵무새 보이기
- `Hide Bird`: 앵무새 숨기기
- `Restart Agent Monitor`: Codex/Claude 감시 재시작
- `Quit`: 완전 종료

Codex 또는 Claude Code가 작업 중이거나 확인을 기다리는 동안에는 메뉴바 아이콘이 좌우로 흔들립니다. 대기 상태로 돌아오면 정적 아이콘으로 돌아갑니다.
소리와 앵무새 또잉 알림은 **사용자 확인이 필요할 때** 또는 **top-level 작업이 끝났을 때** 납니다. 다른 독립 작업이 켜져 있어도 해당 작업 완료는 알리고, 서브에이전트 하나가 먼저 끝나는 경우에는 알림 없이 상태만 바뀝니다.

## 4. 화면 조작

- 상태 박스 드래그: 상태 박스 위치 이동
- 상태 박스 왼쪽/오른쪽 아래 핸들: 박스 크기 조정
- 상태 박스 오른쪽 위 `×`: 상태 박스 숨기기
- 흰색 `window size` 외곽선: 실제 Parrot Buddy 창 크기. **크게 만들면 뒤에 켜져 있는 앱이나 창 클릭을 막을 수 있어 최소 크기로 유지하는 게 좋음**
- `window size` 옆 `guide` 버튼 클릭: guide 열기
- 상태 박스 이동/크기 조절 후: 흰색 창 영역이 내용에 맞춰 자동 최적화
- 앵무새 드래그: 앱 창 전체 이동
- `window size`가 보일 때 앵무새 오른쪽 아래 작은 손잡이 드래그: 앵무새 크기 조절. 현재 크기가 기본값
- Guide 제목 줄 드래그: 앱 창 전체 이동
- 앵무새 클릭: 또잉 애니메이션
- 상태 박스가 숨겨진 상태에서 앵무새 클릭: 상태 박스 다시 표시
- 앵무새 빠르게 3번 클릭: guide 열기/닫기
- **앵무새 우클릭 또는 Option을 누른 채 앵무새 클릭: 흰색 `window size` 외곽선 숨기기/다시 표시**
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
npm run dist:mac
```

GitHub Release에 DMG를 올릴 때는 버전 태그를 push합니다.

```bash
git tag v0.1.0
git push origin v0.1.0
```

그러면 GitHub Actions가 `Parrot-Buddy-macOS-<version>-<arch>.dmg`와 `.zip`을 Release assets에 첨부합니다.

앱이 이상하게 남아 있으면:

```bash
npm run stop
npm run launch
```
