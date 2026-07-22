# Onyu Bot

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=nodedotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

**🌐 라이브 서비스: [onyu.dev](https://onyu.dev)**

디스코드 서버의 음성 채널 활동을 실시간 추적하고, AI 기반 분석 리포트·신규사용자 온보딩·
자동 음성채널 생성 등을 제공하는 다목적 디스코드 봇 클라이언트입니다.
실제 운영 중인 서비스이며, 웹 대시보드는 [onyu.dev](https://onyu.dev)에서 확인할 수 있습니다.

> **이 레포는 Bot 클라이언트 코드만 포함합니다.** 비즈니스 로직(DB, AI 분석, 웹 대시보드 API 등)은
> 별도의 Private API 서버가 담당하며, 이 레포는 코드 열람/포트폴리오 목적으로 공개된
> **읽기 전용 미러**입니다 (PR/Issue를 받지 않습니다). 별도 API 서버 없이는 봇이 단독으로 동작하지 않습니다.

## 아키텍처

```
                        ┌─────────────── Private ───────────────┐
Discord ◄──gateway──►  Bot (이 레포)  ──HTTP──►  Onyu API 서버  ──►  PostgreSQL / Redis
                                                     │
                                                     ├──►  Google Gemini (AI 분석)
                        Web Dashboard  ◄─────────────┘
```

Bot은 **얇은 클라이언트(thin client)** 로 설계되어 있습니다 — Discord 게이트웨이 이벤트 수신과
응답 렌더링만 담당하고, 상태 저장과 비즈니스 로직은 전부 API 서버에 HTTP로 위임합니다.

- **장애 격리 / 배포 독립성** — 봇 재시작·재배포가 데이터 파이프라인(집계·분석)에 영향을 주지 않음
- **타입 세이프 API 계약** — Bot ↔ API 통신은 [`libs/bot-api-client`](libs/bot-api-client) HTTP SDK로 캡슐화,
  요청/응답 타입은 [`libs/shared`](libs/shared)에서 단일 정의
- **무상태(stateless)** — Bot 프로세스는 자체 DB/Redis 없이 동작

## 주요 기능

- **음성 채널 활동 추적** — 입장/퇴장/마이크 on-off 이벤트 실시간 수집 후 API로 전달
- **AI 분석 리포트** — API 서버(Gemini 연동)를 통한 개인/서버 음성 활동 진단
- **프로필 카드** — 최근 음성 활동을 이미지 카드로 렌더링해 응답
- **신규사용자 온보딩** — 입장 감지, 역할 자동 부여, 온보딩 인터랙션
- **자동 음성채널 생성** — 트리거 채널 입장 시 개인 채널 자동 생성
- **고정 메시지(Sticky Message)** — 특정 채널 최신 메시지 상단 고정 (웹 대시보드 연동)
- **게임방 접두사(Status Prefix)** — 사용자 활동 상태 기반 채널명 접두사 갱신
- **역할 패널(Role Panel)** — 버튼 클릭으로 역할 부여/토글 (동시 클릭 락 처리)
- **동시 접속 추적(Co-Presence)** — 음성 채널 동시 접속 이력 주기 집계
- **봇 모니터링** — Prometheus 메트릭 엔드포인트 노출

## 슬래시 커맨드

| 커맨드 | 설명 |
|---|---|
| `/me` (`/미`) | 내 프로필과 최근 음성 활동을 이미지 카드로 확인 |
| `/best-friend` | 함께 접속한 시간 기반 베스트 프렌드 TOP 카드 |
| `/self-diagnosis` | 내 음성 활동 AI 진단 |
| `/server-diagnosis` | 서버 음성 활동 AI 진단 (조회 기간 옵션) |
| `/고정메세지등록` `/고정메세지목록` `/고정메세지삭제` | 고정 메시지 관리 |
| `/voice-flush` | 음성 집계 데이터 강제 DB 반영 (관리자 전용) |
| `/version` | 봇 버전 정보 |

## 기술 스택 & 엔지니어링 포인트

- **Runtime**: Node.js 20 + NestJS 10 (모듈러 아키텍처 + DI)
- **Discord**: discord.js 14 + discord-nestjs 5
- **Language**: TypeScript 5 (strict, `any` 금지 ESLint 룰)
- **i18n**: [`libs/i18n`](libs/i18n) — ko/en 로케일, 디스코드 인터랙션 locale 기반 해석
- **테스트**: vitest 단위 테스트
- **로깅**: pino 구조화 로깅 (nestjs-pino)
- **관측성**: prom-client 기반 Prometheus 메트릭
- **빌드/배포**: pnpm workspaces 멀티 패키지 + 멀티스테이지 Docker

## 시작하기

### 사전 요구사항

- Node.js >= 18
- pnpm >= 10
- Discord Bot Token (Discord Developer Portal)
- **Onyu API 서버** (별도 운영 — 이 레포만으로는 동작하지 않습니다)

### 설치

```bash
pnpm install
cp .env.example .env
# .env 파일을 실제 값으로 수정 (DISCORD_API_TOKEN, API_BASE_URL, BOT_API_KEY 등)
pnpm bot:dev
```

### Docker

```bash
cp .env.example .env
docker compose up -d
```

## 프로젝트 구조

```
apps/bot/src/
├── command/            # 슬래시 커맨드 (음성 분석, 프로필 카드, 고정메세지 등)
├── event/              # Discord 이벤트 핸들러 (음성 상태, 신규사용자, 역할 패널, 자동방 등)
├── scheduler/          # 배경 작업 (Co-Presence 주기 집계)
├── monitoring/         # Prometheus 메트릭
└── common/             # 공유 유틸 (i18n, locale 리졸버 등)

libs/shared/            # 공유 타입/상수 (Bot ↔ API 계약 타입)
libs/bot-api-client/    # Bot → API HTTP 클라이언트 SDK
libs/i18n/              # 다국어 로케일 (ko/en, bot 네임스페이스)
```

## License

MIT
