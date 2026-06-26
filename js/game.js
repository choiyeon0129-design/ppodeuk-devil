'use strict';

/* =========================================================
 * 게임 본체: 상태 머신 + 루프 + 렌더
 *  TITLE → PLAYING → (CLEAR → 다음 스테이지 …) → GAMECLEAR
 *                  └ 시간초과 → FAIL
 * ========================================================= */

const STATE = { TITLE: 'title', PLAYING: 'playing', FALLING: 'falling', CLEARWAIT: 'clearwait', SLIDING: 'sliding', CLEAR: 'clear', GAMECLEAR: 'gameclear', FAIL: 'fail' };

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new InputManager(canvas);
    applyLayout(this.input.touch); // PC/모바일 레이아웃 결정
    this.player = new Player();
    this.assets = {};

    this.state = STATE.TITLE;
    this.stageIndex = 0;
    this.score = 0;
    this.timeLeft = 0;
    this.grid = null;
    this.residents = null;
    this._last = 0;
    this._clearBonus = 0;
    this._wipeTimer = 0;
    this._wasWiping = false;
    this._scale = 1;
    this._failReason = 'time';
  }

  // 브라우저/화면 크기에 맞춰 캔버스 크기 조정 (비율 유지 + 고해상도 대응)
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssScale = Math.min(window.innerWidth / CONFIG.WIDTH, window.innerHeight / CONFIG.HEIGHT);
    const cssW = CONFIG.WIDTH * cssScale, cssH = CONFIG.HEIGHT * cssScale;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this._scale = cssScale * dpr; // 논리 좌표(720x1280) → 실제 백버퍼 스케일
  }

  async load() {
    const [char, map, r2, r3, r4, r5] = await Promise.all([
      loadImage('cha_1.png'),
      loadImage('map_1.png'),
      loadImage('cha_2.png'),
      loadImage('cha_3.png'),
      loadImage('cha_4.png'),
      loadImage('cha_5.png'),
    ]);
    this.assets.char = char;
    this.assets.map = map;
    this.assets.residents = [r2, r3, r4, r5]; // 층별 거주자
    this.assets.window = await loadImage('window.png'); // 열린 창문
    this.assets.item1 = await loadImage('item_1.png');  // 낙하 장애물
    this.assets.item2 = await loadImage('item_2.png');  // 박쥐
    this.assets.thumb = await loadImage('thumnail.png'); // 타이틀 배경
    this.assets.brush = await loadImage('item_brush.png'); // 빗자루(모든 브러시 공용)
    this.assets.brush2 = this.assets.brush;                // 타이틀도 동일 리소스
  }

  // 한 스테이지의 그리드/거주자/장애물 구성
  _buildStage(stage) {
    this.grid = new WindowGrid(stage);
    this.residents = new Residents(this.grid, this.assets.residents || [], this.assets.window, stage);
    this.hazards = new Hazards(this.grid, stage, this.assets.item1, this.assets.item2);
    this.residents.hazards = this.hazards; // 장애물 칸 우선 오픈
    this._cleanedCount = 0;                // 닦은 창문 수(창문 여는 기준)
    this.input.clearTaps();                // 이전 화면의 버퍼 입력 제거
  }

  startStage(i) {
    this.stageIndex = i;
    const stage = CONFIG.STAGES[i];
    this._buildStage(stage);
    this.timeLeft = stage.time;
    this.player.placeOnGrid(this.grid);
    this._wasWiping = false;
    this._wipeTimer = 0;
    this._failReason = 'time';
    this.state = STATE.PLAYING;
  }

  startGame() {
    Sound.ensure();        // 사용자 입력 직후 오디오 활성화
    Sound.startAmbient();
    Sound.startBGM();      // 배경 음악
    this.score = 0;
    this.startStage(0);
  }

  run() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    const loop = (ts) => {
      if (!this._last) this._last = ts;
      let dt = (ts - this._last) / 1000;
      this._last = ts;
      if (dt > 0.05) dt = 0.05; // 탭 비활성/렉으로 인한 큰 점프 방지
      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  update(dt) {
    const pressed = this.input.consumePress();
    switch (this.state) {
      case STATE.TITLE:
        this._titleT = (this._titleT || 0) + dt; // 타이틀 캐릭터 브러시 애니메이션 시간
        if (pressed) this.startGame();
        break;
      case STATE.PLAYING:
        this._updatePlaying(dt);
        break;
      case STATE.FALLING:
        this.player.updateFall(dt);
        if (this.player.y > CONFIG.HEIGHT + 350) this.state = STATE.FAIL;
        break;
      case STATE.SLIDING:
        this._slideT += dt / CONFIG.SLIDE_DUR;
        if (this._slideT >= 1) {
          this._slideT = 1;
          this._slideOldGrid = null;
          this._slideOldResidents = null;
          this._slideOldHazards = null;
          this.state = STATE.PLAYING; // 새 라운드 시작
        }
        break;
      case STATE.CLEAR:
        if (pressed) {
          if (this.stageIndex + 1 < CONFIG.STAGES.length) this.startStage(this.stageIndex + 1);
          else this.state = STATE.GAMECLEAR;
        }
        break;
      case STATE.GAMECLEAR:
      case STATE.FAIL:
        if (pressed) this.state = STATE.TITLE;
        break;
    }
  }

  _updatePlaying(dt) {
    const stage = CONFIG.STAGES[this.stageIndex];
    this.player.update(dt, this.input, this.grid);

    // 닦기: 버퍼된 탭(즉시 1회씩) + 홀드(자동 반복) — 빠른 입력도 씹히지 않음
    let wipeTaps = 0;
    while (this.input.consumeWipeTap()) wipeTaps++;
    if (wipeTaps > 0) {
      for (let k = 0; k < wipeTaps; k++) this._doWipe();
      this._wipeTimer = CONFIG.WIPE.delay;
      this._wasWiping = true;
    } else if (this.input.isWiping()) {
      if (!this._wasWiping) { this._doWipe(); this._wipeTimer = CONFIG.WIPE.delay; this._wasWiping = true; }
      else { this._wipeTimer -= dt; if (this._wipeTimer <= 0) { this._doWipe(); this._wipeTimer = CONFIG.WIPE.repeat; } }
    } else {
      this._wasWiping = false;
      this._wipeTimer = 0;
    }
    this.grid.update(dt);
    if (this.residents) this.residents.update(dt);

    // 창문이 열리면 그 칸의 장애물(item_1)을 낙하시킴
    if (this.residents && this.residents.justOpened && this.hazards) {
      const jo = this.residents.justOpened;
      this.hazards.dropAt(jo.col, jo.row);
    }
    if (this.hazards) this.hazards.update(dt);

    // 거주자가 연 창문과 주인공이 같은 칸에서 마주치면 → 추락 + 실패
    if (this.residents) {
      for (const r of this.residents.list) {
        if (r.openTimer > 0 && r.openCol === this.player.col && r.row === this.player.row) {
          this._startFall('fall');
          return;
        }
      }
    }
    // 장애물/박쥐와 부딪히면 → 실패
    if (this.hazards && this.hazards.hitsPlayer(this.player)) {
      this._startFall('hit');
      return;
    }

    this.timeLeft -= dt;

    if (this.grid.allClean()) {                 // 모든 창문을 완벽히 닦음
      this._clearBonus = Math.floor(Math.max(0, this.timeLeft)) * CONFIG.SCORE.timeBonusPerSec;
      this.score += this._clearBonus;
      Sound.clear();
      // '성공!'을 띄운 채 곧바로 다음 라운드로 슬라이딩
      if (this.stageIndex + 1 < CONFIG.STAGES.length) this._startSlide();
      else this.state = STATE.GAMECLEAR;
    } else if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this._failReason = 'time';
      this.state = STATE.FAIL;
      Sound.fail();
    }
  }

  _doWipe() {
    this.player.onWipe();
    if (this.grid.wipeCell(this.player.col, this.player.row)) {
      this.score += CONFIG.SCORE.perTile;
      Sound.clean();
      // 창문 2개(OPEN_PER_WINDOWS) 닦을 때마다 거주자가 창문 하나를 엶
      this._cleanedCount++;
      if (this._cleanedCount % CONFIG.OPEN_PER_WINDOWS === 0 && this.residents) {
        this.residents.triggerOpen();
      }
    } else {
      Sound.wipe();
    }
  }

  _startFall(reason) {
    this._failReason = reason || 'fall';
    this.player.startFall();
    this.state = STATE.FALLING;
    Sound.fall();
  }

  // 다음 라운드로 위로 슬라이딩하며 전환 (이전 깨끗한 층은 위로, 새 더러운 층이 아래에서 올라옴)
  _startSlide() {
    this._slideOldGrid = this.grid;          // 방금 깨끗해진 층(슬라이드 중 퇴장)
    this._slideOldResidents = this.residents;
    this._slideOldHazards = this.hazards;
    this.stageIndex += 1;
    const stage = CONFIG.STAGES[this.stageIndex];
    this._buildStage(stage);
    this.timeLeft = stage.time;
    this.player.placeOnGrid(this.grid);
    this._wasWiping = false;
    this._wipeTimer = 0;
    this._slideT = 0;
    this.state = STATE.SLIDING;
  }

  /* ===================== 렌더 ===================== */
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this._scale, 0, 0, this._scale, 0, 0); // 논리좌표 → 백버퍼
    ctx.fillStyle = CONFIG.COLOR.bg;
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

    if (this.state === STATE.TITLE) { this._renderTitle(ctx); this._renderSoundBtn(ctx); return; }

    // 라운드 전환: 아래로 내려가는 슬라이딩 (새 층이 위에서 ↓ 등장, 이전 깨끗한 층 ↓ 아래로 퇴장)
    if (this.state === STATE.SLIDING) {
      const e = this._slideT * this._slideT * (3 - 2 * this._slideT); // smoothstep
      const H = CONFIG.HEIGHT;
      const offNew = (e - 1) * H;  // 새 층: 위(-H) → 0
      const offOld = offNew + H;   // 이전 층: 0 → 아래(+H)
      ctx.save(); ctx.translate(0, offOld);
      this._renderScene(ctx, this._slideOldGrid, this._slideOldResidents, this._slideOldHazards, false);
      ctx.restore();
      ctx.save(); ctx.translate(0, offNew);
      this._renderScene(ctx, this.grid, this.residents, this.hazards, true);
      ctx.restore();
      this._renderHUD(ctx);
      // 라운드 성공 — '성공!' 문구를 슬라이드 중에 함께 표시
      ctx.textAlign = 'center';
      ctx.font = `800 100px ${FONT}`;
      ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(10,6,16,0.85)';
      ctx.strokeText('성공!', CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2);
      ctx.fillStyle = CONFIG.COLOR.accent2;
      ctx.fillText('성공!', CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2);
      this._renderSoundBtn(ctx);
      return;
    }

    // 일반 인게임 (플레이/낙하/엔딩/실패)
    this._renderScene(ctx, this.grid, this.residents, this.hazards, true);
    if (this.input.touch) this._renderControls(ctx);     // PC는 화면 버튼 숨김
    this._renderHUD(ctx);

    if (this.state === STATE.GAMECLEAR)
      this._overlay(ctx, '엔딩!', '모든 창문이 반짝반짝!  ·  탭하여 타이틀로', CONFIG.COLOR.accent);
    if (this.state === STATE.FAIL) {
      if (this._failReason === 'fall')
        this._overlay(ctx, '추락!', '창문에 부딪혔다  ·  탭하여 다시 도전', CONFIG.COLOR.danger);
      else if (this._failReason === 'hit')
        this._overlay(ctx, '사망!', '탭하여 다시 도전', CONFIG.COLOR.danger);
      else
        this._overlay(ctx, '시간 종료', '탭하여 다시 도전', CONFIG.COLOR.danger);
    }
    this._renderSoundBtn(ctx);
  }

  // 한 층(map + 더러움 + 거주자 + 장애물 + 선택적 주인공) 그리기 — 슬라이드 시 translate 후 호출
  _renderScene(ctx, grid, residents, hazards, withPlayer) {
    const P = CONFIG.PANEL;
    if (this.assets.map) ctx.drawImage(this.assets.map, P.x, P.y, P.w, P.h);
    else { ctx.fillStyle = CONFIG.COLOR.panel; ctx.fillRect(P.x, P.y, P.w, P.h); }
    if (residents) residents.drawInside(ctx);     // 거주자(더러움 뒤)
    if (hazards) hazards.drawBehind(ctx);          // idle 장애물(더러움 뒤)
    if (grid) grid.draw(ctx);                      // 더러움
    if (residents) residents.drawOpen(ctx);        // 열린 창문
    if (hazards) hazards.drawFront(ctx);           // 낙하 장애물 + 박쥐
    if (withPlayer) this.player.draw(ctx, this.assets.char, this.assets.brush);
  }

  _renderTitle(ctx) {
    // 배경: thumnail (cover-fit으로 화면을 채움)
    if (this.assets.thumb) {
      const img = this.assets.thumb;
      const s = Math.max(CONFIG.WIDTH / img.width, CONFIG.HEIGHT / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, (CONFIG.WIDTH - w) / 2, (CONFIG.HEIGHT - h) / 2, w, h);
    }
    ctx.fillStyle = 'rgba(10,8,18,0.35)'; // 가독성용 살짝 어둡게
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

    // 타이틀 텍스트 "뽀득뽀득" (색 #560072, 어두운 보라라 밝은 외곽선으로 가독성 확보)
    ctx.textAlign = 'center';
    ctx.font = `800 92px ${FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 13; ctx.strokeStyle = 'rgba(248,244,255,0.92)';
    ctx.strokeText('뽀득뽀득', CONFIG.WIDTH / 2, 300);
    ctx.fillStyle = '#560072';
    ctx.fillText('뽀득뽀득', CONFIG.WIDTH / 2, 300);

    // 캐릭터 — 전체가 둥실 떠다니며 살짝 흔들리는 생동감 애니메이션
    if (this.assets.char) {
      const t = this._titleT || 0;
      const cw = 270, ch = 270;
      const bob = Math.sin(t * 2.2) * 9;       // 위아래 둥실
      const sway = Math.sin(t * 1.6) * 0.045;  // 살짝 흔들림
      ctx.save();
      ctx.translate(CONFIG.WIDTH / 2, 470 + ch / 2 + bob);
      ctx.rotate(sway);
      ctx.drawImage(this.assets.char, -cw / 2, -ch / 2, cw, ch);
      // 오른손에 brush2를 쥔 모습
      if (this.assets.brush2) {
        const b = this.assets.brush2, B = CONFIG.TITLE_BRUSH;
        const handX = (B.handX - 0.5) * cw, handY = (B.handY - 0.5) * ch; // 캐릭터 오른손 위치
        const bw = cw * B.scale, bh = bw * (b.height / b.width);
        ctx.translate(handX + (B.dx || 0), handY + (B.dy || 0));           // dx/dy: 좌우·상하 미세 보정
        ctx.rotate(B.angle);
        ctx.drawImage(b, -B.pivX * bw, -B.pivY * bh, bw, bh); // 손잡이 그립을 손에 정렬
      }
      ctx.restore();
    }

    // '시작하기' 버튼 — 색 #560072 (보라) + 글로우
    const bw = 320, bh = 100, bx = CONFIG.WIDTH / 2 - bw / 2, by = 838;
    ctx.save();
    ctx.shadowColor = 'rgba(134,30,176,0.6)'; ctx.shadowBlur = 26;
    const grad = ctx.createLinearGradient(0, by, 0, by + bh);
    grad.addColorStop(0, '#6d1190'); grad.addColorStop(1, '#560072');
    ctx.fillStyle = grad; roundRect(ctx, bx, by, bw, bh, 24); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#2e003d'; ctx.lineWidth = 5; roundRect(ctx, bx, by, bw, bh, 24); ctx.stroke();
    ctx.strokeStyle = 'rgba(228,196,245,0.5)'; ctx.lineWidth = 2; roundRect(ctx, bx + 4, by + 4, bw - 8, bh - 8, 20); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle';
    ctx.font = `800 46px ${FONT}`;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(30,0,42,0.8)';
    ctx.strokeText('시작하기', CONFIG.WIDTH / 2, by + bh / 2 + 2);
    ctx.fillText('시작하기', CONFIG.WIDTH / 2, by + bh / 2 + 2);
    ctx.textBaseline = 'alphabetic';

    // 버튼 아래 안내 문구
    ctx.font = `500 34px ${FONT}`;
    ctx.fillStyle = CONFIG.COLOR.text;
    ctx.fillText('방향키로 유리를 모두 닦으면 성공!', CONFIG.WIDTH / 2, by + bh + 64);
  }

  _renderHUD(ctx) {
    const stage = CONFIG.STAGES[this.stageIndex];

    ctx.font = `800 40px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = CONFIG.COLOR.text;
    ctx.fillText(`STAGE ${stage.id}/${CONFIG.STAGES.length}`, 30, 58);

    ctx.textAlign = 'center';
    ctx.fillText(`${this.score}`, CONFIG.WIDTH / 2, 58);

    ctx.textAlign = 'right';
    ctx.fillStyle = this.timeLeft <= 10 ? CONFIG.COLOR.danger : CONFIG.COLOR.text;
    const sec = Math.max(0, Math.ceil(this.timeLeft));
    ctx.fillText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, CONFIG.WIDTH - 92, 58); // 사운드 버튼 자리 확보
  }

  // 사운드 on/off 버튼 — 우측 상단, 모든 화면 위에 그림
  _renderSoundBtn(ctx) {
    const S = CONFIG.SOUNDBTN;
    const on = (typeof Sound !== 'undefined') ? Sound.enabled : true;
    ctx.save();
    ctx.fillStyle = 'rgba(20,12,30,0.6)';
    ctx.beginPath(); ctx.arc(S.x, S.y, S.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(S.x, S.y, S.r, 0, Math.PI * 2); ctx.stroke();
    // 스피커 아이콘
    ctx.translate(S.x - 4, S.y);
    const col = on ? '#f4ecff' : 'rgba(244,236,255,0.5)';
    ctx.fillStyle = col; ctx.strokeStyle = col;
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, -5); ctx.lineTo(-5, -5); ctx.lineTo(2, -12);
    ctx.lineTo(2, 12); ctx.lineTo(-5, 5); ctx.lineTo(-12, 5);
    ctx.closePath(); ctx.fill();
    if (on) { // 음파
      ctx.beginPath(); ctx.arc(4, 0, 7, -Math.PI / 3, Math.PI / 3); ctx.stroke();
      ctx.beginPath(); ctx.arc(4, 0, 13, -Math.PI / 3, Math.PI / 3); ctx.stroke();
    } else {  // 음소거 X
      ctx.beginPath();
      ctx.moveTo(6, -7); ctx.lineTo(18, 7);
      ctx.moveTo(18, -7); ctx.lineTo(6, 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  _renderControls(ctx) {
    const D = CONFIG.DPAD;
    const inp = this.input;
    const act = {
      up:    inp.pad.dir.y < 0,
      down:  inp.pad.dir.y > 0,
      left:  inp.pad.dir.x < 0,
      right: inp.pad.dir.x > 0,
    };
    const btns = [
      { x: D.cx, y: D.cy - D.gap, dir: 'up' },
      { x: D.cx, y: D.cy + D.gap, dir: 'down' },
      { x: D.cx - D.gap, y: D.cy, dir: 'left' },
      { x: D.cx + D.gap, y: D.cy, dir: 'right' },
    ];
    for (const b of btns) {
      ctx.fillStyle = act[b.dir] ? 'rgba(200,80,224,0.6)' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.arc(b.x, b.y, D.btnR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, D.btnR, 0, Math.PI * 2); ctx.stroke();
      this._arrow(ctx, b.x, b.y, b.dir);
    }

    // 닦기 버튼
    const B = CONFIG.WIPEBTN;
    ctx.fillStyle = inp.isWiping() ? 'rgba(123,224,192,0.6)' : 'rgba(123,224,192,0.22)';
    ctx.beginPath(); ctx.arc(B.x, B.y, B.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(B.x, B.y, B.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = CONFIG.COLOR.text; ctx.textAlign = 'center';
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText('닦기', B.x, B.y + 12);
  }

  _arrow(ctx, x, y, dir) {
    const s = 16;
    ctx.fillStyle = CONFIG.COLOR.text;
    ctx.beginPath();
    if (dir === 'up')    { ctx.moveTo(x, y - s); ctx.lineTo(x - s, y + s * 0.7); ctx.lineTo(x + s, y + s * 0.7); }
    if (dir === 'down')  { ctx.moveTo(x, y + s); ctx.lineTo(x - s, y - s * 0.7); ctx.lineTo(x + s, y - s * 0.7); }
    if (dir === 'left')  { ctx.moveTo(x - s, y); ctx.lineTo(x + s * 0.7, y - s); ctx.lineTo(x + s * 0.7, y + s); }
    if (dir === 'right') { ctx.moveTo(x + s, y); ctx.lineTo(x - s * 0.7, y - s); ctx.lineTo(x - s * 0.7, y + s); }
    ctx.closePath();
    ctx.fill();
  }

  _overlay(ctx, title, sub, color) {
    ctx.fillStyle = 'rgba(10,6,16,0.72)';
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    ctx.textAlign = 'center';

    ctx.fillStyle = color;
    ctx.font = `800 76px ${FONT}`;
    ctx.fillText(title, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 30);

    ctx.fillStyle = CONFIG.COLOR.text;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(sub, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 + 50);

    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(`점수 ${this.score}`, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 + 130);
  }
}
