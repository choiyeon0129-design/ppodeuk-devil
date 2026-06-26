'use strict';

/* =========================================================
 * 뽀득뽀득 데빌 — 전역 설정 / 유틸
 * 논리 좌표계: 720 x 1280 (세로형 9:16) 고정
 * ========================================================= */

const CONFIG = {
  WIDTH: 720,
  HEIGHT: 1280,

  // 레이아웃 — PANEL은 map_1(1536x2754) 전체가 들어가는 영역.
  //  PC: 크게 확대(버튼 없음) / 모바일: 작게 + 하단에 버튼 공간 확보(버튼은 플레이영역 밖)
  PANEL_PC:     { x: 40,  y: 90, w: 640, h: 1148 },
  PANEL_MOBILE: { x: 106, y: 90, w: 507, h: 910 },
  PANEL:        { x: 40,  y: 90, w: 640, h: 1148 }, // applyLayout()로 갱신
  HUD:          { x: 0,   y: 0,  w: 720, h: 175 },

  // 청소 격자 = map_1의 창문 블록 (PANEL 대비 비율). 실제 창문 위치에 맞춤(픽셀 측정 기반)
  GRID_AREA: { left: 0.065, top: 0.075, right: 0.935, bottom: 0.965 },

  // 셀 내부 유리 영역 inset (더러움이 창틀/벽이 아닌 유리에만)
  WINDOW: { insetX: 0.12, insetY: 0.09 },

  // 플레이어(악마/스펀지). xOffset/yOffset: 칸 중심에서 위치 보정(좌-/우+, 아래+)
  PLAYER: { drawW: 203, drawH: 203, xOffset: -15, yOffset: 33 }, // 304의 2/3 (1/3 축소)

  // 장애물(item_1 낙하 / item_2 박쥐). obsW: 타일폭 대비 크기, obsYOffset: 아래로 보정
  HAZARD: { obsW: 0.25, obsYOffset: 30, obsGravity: 1500, batW: 0.8, batEvery: 5, batSpeed: 300, hitX: 0.34, hitY: 0.34 },

  // 닦을 때마다 brush.png(빗자루)만 손잡이 기준으로 스윙. 캐릭터 몸은 정지.
  //  dur: 1회 스윙 시간, angle: 스윙 최대 각(rad)
  //  pivotX/pivotY: 캐릭터 스프라이트상의 오른손(빗자루 회전 중심) 비율
  //  imgScale: 캐릭터 폭 대비 brush.png 크기, imgPivX/Y: brush.png상의 손잡이 그립 비율, imgAngle: 기본 정렬 각
  BRUSH: { dur: 0.18, angle: 0.32, pivotX: 0.72, pivotY: 0.49, imgScale: 1.05, imgPivX: 0.47, imgPivY: 0.5, imgAngle: 0.15, dy: -5 },

  // 타이틀 화면: 캐릭터 오른손에 brush2를 쥔 모습. handX/Y: 캐릭터상 오른손 비율,
  //  scale: 캐릭터 폭 대비 크기, pivX/Y: brush2상 손잡이 그립 비율, angle: 기울기(rad)
  TITLE_BRUSH: { handX: 0.72, handY: 0.5, scale: 0.62, pivX: 0.47, pivY: 0.5, angle: 0.3, dx: -2, dy: -12 },

  // 라운드 클리어 시 위로 올라가는 슬라이딩 전환 시간(초)
  SLIDE_DUR: 0.9,

  // 모든 창문을 완벽히 닦은 뒤 다음 라운드까지 대기(초)
  CLEAR_WAIT: 2,

  // 창문 여는 기준: 창문을 N개 닦을 때마다 1개 열림
  OPEN_PER_WINDOWS: 2,

  // 거주자(NPC): 각 층 1명, 좌우 이동, 평균 ~10초마다 랜덤으로 창문 열기
  //  drawScale: 창문 높이 대비 크기, yOffset: 아래로 보정, openEvery: 창문 여는 주기(초), openAnim: 여닫는 모션 시간
  RESIDENT: { drawScale: 0.93, yOffset: 2, speedMin: 45, speedMax: 80, openEvery: 6, openDur: 3, openAnim: 0.45, prePause: 0 },

  // 그리드 한 칸 이동
  //  stepDelay: 첫 입력 후 자동 반복까지의 지연, stepRepeat: 꾹 누를 때 반복 간격, tween: 시각 보간 속도
  MOVE: { stepDelay: 0.35, stepRepeat: 0.14, tween: 22 },

  // 줄(로프) — 캐릭터 이미지(cha_1) 속 나무 좌석판 양끝에 자연스럽게 연결
  //  attachLx/attachRx: 스프라이트 가로 비율(0~1)상의 좌/우 줄 부착점, attachY: 세로 비율상의 부착 높이
  RIG: { attachLx: 0.15, attachRx: 0.85, attachY: 0.72 },

  // 닦기: 창문 한 칸당 perWindow번 닦아야 완전히 깨끗 (1회 입력 = 1번, 꾹 누르면 자동 반복)
  //  delay: 첫 닦기 후 자동 반복까지 지연, repeat: 반복 간격
  WIPE: { perWindow: 5, delay: 0.2, repeat: 0.18 },

  // 점수
  SCORE: { perTile: 100, timeBonusPerSec: 10 },

  // 모바일 가상 컨트롤: 방향 버튼(D-pad) + 닦기 버튼 — 모바일 PANEL(하단 y~1000) 아래에 배치
  DPAD:    { cx: 150, cy: 1145, gap: 80, btnR: 48 },
  WIPEBTN: { x: 572, y: 1145, radius: 80 },

  // 사운드 on/off 버튼 (우측 상단, 모든 화면 공통) — 클릭/탭으로 음소거 토글
  SOUNDBTN: { x: 676, y: 50, r: 30 },

  // 스테이지 데이터
  //  - M1 구현: cols/rows/time/target (이동·닦기·청결도·시간·클리어)
  //  - redirt(재오염), birds(장애물)는 placeholder → M2/M3에서 구현 예정
  STAGES: [
    { id: 1, cols: 3, rows: 4, time: 60, target: 100, obstacles: 0, bats: false },
    { id: 2, cols: 3, rows: 4, time: 60, target: 95,  obstacles: 1, bats: false },
    { id: 3, cols: 3, rows: 4, time: 45, target: 95,  obstacles: 2, bats: false, speedMul: 1.5 },
    { id: 4, cols: 3, rows: 4, time: 30, target: 90,  obstacles: 2, bats: true,  openEvery: 3, speedMul: 2 },
    { id: 5, cols: 3, rows: 4, time: 20, target: 90,  obstacles: 2, bats: true,  openEvery: 3, speedMul: 3, batEvery: 3, batRandomRow: true, batSpeedMul: 2 },
  ],

  // 색상 팔레트 (악마 테마 placeholder)
  COLOR: {
    bg: '#0d0b14',
    panel: '#0e2230',
    glass: 'rgba(150,205,225,0.22)',
    frame: '#3a2a44',
    frameLight: '#5a4468',
    dirt: '24,20,30',        // 안 닦은 창문을 덮는 어두운 그라임
    dirtBlob: '10,8,14',      // 더 어두운 얼룩 덩어리
    hud: '#1b1026',
    accent: '#c850e0',
    accent2: '#7be0c0',
    text: '#f4ecff',
    danger: '#ff5a7a',
    sparkle: '#ffffe0',
    rope: '#6f4a25',
    ropeHi: 'rgba(190,140,90,0.7)',
    timeBar: '#991DBA',
  },
};

// 플랫폼별 레이아웃 적용 (PC: 큰 플레이영역·버튼 없음 / 모바일: 작은 플레이영역 + 하단 버튼)
function applyLayout(touch) {
  CONFIG.PANEL = touch ? CONFIG.PANEL_MOBILE : CONFIG.PANEL_PC;
}

// ===== 유틸 =====
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function lerp(a, b, t) { return a + (b - a) * t; }

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  if (w <= 0 || h <= 0) { ctx.beginPath(); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 폰트 스택 (Puzzle Sans 우선, 한글은 시스템 폰트로 폴백)
const FONT = '"Puzzle Sans","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';

// 이미지 로더 (실패 시 null → placeholder 도형 사용)
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
