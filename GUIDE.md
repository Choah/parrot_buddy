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
- `Agent Settings`: Codex/Claude Code 감시 연결 설정
- `Restart Agent Monitor`: Codex/Claude 감시 재시작
- `Quit`: 완전 종료

Codex 또는 Claude Code가 작업 중이거나 확인을 기다리는 동안에는 메뉴바 아이콘이 좌우로 흔들립니다. 대기 상태로 돌아오면 정적 아이콘으로 돌아갑니다.
Codex나 Claude Code를 쓰지 않는 사람은 `Agent Settings`에서 해당 감시를 끌 수 있습니다. 설정은 `~/.parrot-buddy/settings.json`에 저장되고, 저장하면 모니터가 즉시 재시작됩니다.
소리와 앵무새 또잉 알림은 **각 터미널/세션에서 사용자 확인이 필요할 때** 또는 **그 터미널/세션의 top-level 작업이 끝났을 때** 납니다. **작업 완료는 짹짹 2번**, **사용자 확인 필요는 짹 1번**입니다. 다른 독립 작업이 켜져 있어도 해당 작업 완료는 따로 알리고, 서브에이전트 하나가 먼저 끝나는 경우에는 알림 없이 상태만 바뀝니다.

## 4. 화면 조작

핵심:

- 흰색 `window size` 외곽선은 **실제 Parrot Buddy 창 크기**입니다.
- 이 영역이 커지면 투명해 보여도 뒤에 켜져 있는 앱이나 창 클릭을 막을 수 있습니다.
- 평소에는 앵무새와 작업 상태 창을 감싸는 **최소 크기**로 두는 것이 좋습니다.
- `guide` 탭은 외곽선 아래쪽 왼쪽에 있고, `window size` 표시는 그 오른쪽에 있습니다.
- Guide 오른쪽 위 `agent` 버튼 또는 메뉴바 `Agent Settings`에서 Codex/Claude Code 감시를 설정합니다.

앵무새:

- 앵무새 드래그: Parrot Buddy 창 전체 이동
- 앵무새 클릭: 조이의 짧은 말풍선 표시
- 앵무새 길게 누르기: 조이 Assistant 채팅 열기
- 작업 상태 창을 숨긴 뒤 앵무새 빠르게 3번 클릭: 작업 상태 창 다시 표시
- 앵무새 우클릭 또는 Option + 앵무새 클릭: 흰색 `window size` 외곽선 숨기기/다시 표시
- `window size`가 보일 때 앵무새 오른쪽 아래 작은 손잡이 드래그: 앵무새 크기 조절

작업 상태 창:

- Codex와 Claude Code가 작업 중인지, 확인을 기다리는지 보여줍니다.
- 작업 상태 창 드래그: 창만 이동
- 아래 핸들: 작업 상태 창 크기 조정
- 오른쪽 위 `×`: 작업 상태 창 숨기기

조이 Assistant:

- 앵무새를 길게 누르면 열립니다.
- 중요한 일, 일정, 기억할 내용을 정리해 줍니다.
- 헤더나 빈 영역을 드래그하면 조이 Assistant 창만 이동합니다.

Agent 상태:

- `working`: 작업 중
- `confirm`: 사용자 확인 필요
- `ready`: 켜져 있고 대기 중
- `stopped`: 감지된 프로세스 없음
- 작업 완료는 짹짹 2번, 확인 필요는 짹 1번으로 알립니다.

크기와 위치:

- 작업 상태 창이나 조이 Assistant를 옮기면 `window size`가 내용에 맞춰 자동 조정됩니다.
- 외곽선 가장자리나 모서리 드래그: 투명 창 크기 수동 조절
- 말풍선은 앵무새 위치에 따라 왼쪽/오른쪽으로 자동 배치됩니다.
- Guide 제목 줄 드래그: Parrot Buddy 창 전체 이동
- Esc: guide, 조이 Assistant, agent 설정, window size 모드 닫기

평소에는 compact 창으로 표시됩니다. guide를 열 때만 창이 더 커지고, 닫으면 다시 작아집니다.

## 5. 개인비서

앵무새를 길게 누르면 개인비서 채팅창이 열립니다. 개인비서 이름은 `조이`이고, 겉으로는 차갑지만 알고 보면 따뜻하고 착한 츤데레 앵무새입니다. 오늘 일, 앞으로 할 일, 일정, 기억해야 할 내용을 적으면 Codex CLI가 정리하고 Parrot Buddy가 로컬 파일에 저장합니다.

앵무새를 한 번 클릭하면 조이가 주인님에 대해 떠올린 짧은 속생각을 보여줍니다. 이 속생각은 `memory.md`, 최근 history, 최근 assistant 세션을 참고해서 하루 단위로 30개 후보를 만듭니다. 앱이 켜질 때 자동으로 오늘 후보를 준비하고, 이후 주기적으로 날짜 변경과 메모리 변경을 확인해 갱신합니다. 클릭할 때마다 그중 하나를 랜덤으로 4초간 표시합니다.

명확한 인사나 짧은 잡담은 조이 말투로 즉시 답하고 저장하지 않습니다. 그 외 메시지는 Codex가 답변 JSON 안에서 chat, recall, memory, schedule, task, note로 분류합니다. 취향, 반복되는 정보, 일정, 약속, 결정, 나중에 챙길 일처럼 다시 쓸 가능성이 있는 것만 저장하고, chat이나 recall로 분류된 메시지는 history, memory, reminder 저장을 막습니다.

조이 Assistant 창의 헤더나 빈 패널 영역을 잡고 움직이면 Assistant 창만 따로 움직입니다. 실제 floating window 전체를 옮기려면 앵무새를 드래그하세요. 입력창, Send 버튼, 메시지 스크롤, reminder 버튼은 그대로 클릭/스크롤할 수 있습니다.

이 기능은 `.env` API 키를 쓰지 않습니다. 사용자의 Mac에 설치되어 로그인된 `codex` CLI를 사용합니다.

저장 위치:

```text
~/.parrot-buddy/assistant/
```

- `history/YYYY-MM-DD.md`: 날짜별 기록
- `history/latest.md`: 최신 날짜 기록
- `memory.md`: 오래 기억할 사용자 정보와 취향
- `reminders.json`: 일정/알림
- `sessions/*.json`: 처리 이력

명확한 날짜나 시간이 있으면 reminder로 저장하고, 애매하면 확인 질문을 합니다.

## 6. 상태 의미

- `working`: Codex 또는 Claude Code가 작업 중
- `confirm`: Codex가 사용자 확인이나 승인을 기다림
- `ready`: 프로세스는 켜져 있고 대기 중
- `stopped`: 프로세스나 live lock을 찾지 못함

여러 Codex terminal이 동시에 떠 있으면 각각 폴더 이름과 turn id로 표시됩니다.

## 7. 감시 대상

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

다른 설치 경로를 쓰는 경우 `Agent Settings`에서 Codex sessions root, Claude projects/transcripts/lock 경로를 바꾸면 됩니다.

## 8. 개발 명령

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
