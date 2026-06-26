'use strict';

/* =========================================================
 * 플레이어 (악마 캐릭터 = 스펀지) — 그리드 한 칸 이동
 *  - 줄(로프)에 매달린 그네에 탑승 (로프는 고정)
 *  - 닦을 때마다(onWipe) "빗자루만" 스윙: 스프라이트를 pivotX에서 분할해
 *    좌측(몸)은 정지, 우측(빗자루)만 손잡이 기준으로 회전
 * ========================================================= */

class Player {
  constructor() {
    this.col = 0;
    this.row = 0;
    this.x = CONFIG.PANEL.x + CONFIG.PANEL.w / 2;
    this.y = CONFIG.PANEL.y + CONFIG.PANEL.h / 2;
    this.stepTimer = 0;
    this.prevDir = { x: 0, y: 0 };
    this.moving = false;
    this.brushActive = false;
    this.brushTime = 0;
    this.brushAngle = 0;
    this.falling = false;
    this.fallVel = 0;
    this.fallRot = 0;
    this.fallSpin = 0;
  }

  placeOnGrid(grid) {
    this.col = Math.floor(grid.cols / 2);
    this.row = Math.floor(grid.rows / 2);
    const c = grid.cellCenter(this.col, this.row);
    this.x = c.x + (CONFIG.PLAYER.xOffset || 0);
    this.y = c.y + (CONFIG.PLAYER.yOffset || 0);
    this.stepTimer = 0;
    this.prevDir = { x: 0, y: 0 };
    this.brushActive = false;
    this.brushTime = 0;
    this.brushAngle = 0;
    this.falling = false;
    this.fallVel = 0;
    this.fallRot = 0;
    this.fallSpin = 0;
  }

  onWipe() {
    this.brushActive = true;
    this.brushTime = 0;
  }

  // 창문에 부딪혀 추락 시작 (그네에서 떨어짐)
  startFall() {
    this.falling = true;
    this.fallVel = -180;                                  // 살짝 튕겼다가
    this.fallSpin = (Math.random() < 0.5 ? -1 : 1) * 5;   // 회전하며 추락
    this.fallRot = 0;
  }

  updateFall(dt) {
    this.fallVel += 1700 * dt; // 중력
    this.y += this.fallVel * dt;
    this.fallRot += this.fallSpin * dt;
  }

  update(dt, input, grid) {
    // ===== 그리드 스텝 이동 =====
    // 1) 버퍼된 탭(눌림 이벤트) — 즉시 한 칸씩 (프레임 사이 빠른 입력도 안 씹힘)
    let didTap = false, tap;
    while ((tap = input.consumeMoveTap())) { this._step(tap.x, tap.y, grid); didTap = true; }

    // 2) 홀드 시 자동 반복(DAS)
    const dir = input.getDir();
    const has = dir.x !== 0 || dir.y !== 0;
    const changed = dir.x !== this.prevDir.x || dir.y !== this.prevDir.y;
    if (didTap) {
      this.stepTimer = CONFIG.MOVE.stepDelay;        // 탭 후 자동반복까지 지연
    } else if (!has) {
      this.stepTimer = 0;
    } else if (changed) {
      this._step(dir.x, dir.y, grid);                 // 홀드 방향 시작/변경(터치 등) → 즉시 한 칸
      this.stepTimer = CONFIG.MOVE.stepDelay;
    } else {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this._step(dir.x, dir.y, grid); this.stepTimer = CONFIG.MOVE.stepRepeat; }
    }
    this.prevDir = { x: dir.x, y: dir.y };

    const c = grid.cellCenter(this.col, this.row);
    const t = Math.min(1, dt * CONFIG.MOVE.tween);
    this.x = lerp(this.x, c.x + (CONFIG.PLAYER.xOffset || 0), t);
    this.y = lerp(this.y, c.y + (CONFIG.PLAYER.yOffset || 0), t);
    this.moving = has || didTap;

    // ===== 빗자루 스윙(각도만 계산) =====
    if (this.brushActive) {
      this.brushTime += dt;
      const k = this.brushTime / CONFIG.BRUSH.dur;
      if (k >= 1) { this.brushActive = false; this.brushAngle = 0; }
      else this.brushAngle = Math.sin(k * Math.PI * 2) * CONFIG.BRUSH.angle;
    } else {
      this.brushAngle = 0;
    }
  }

  // 한 칸 이동(부호만 사용)
  _step(dx, dy, grid) {
    this.col = clamp(this.col + (dx < 0 ? -1 : dx > 0 ? 1 : 0), 0, grid.cols - 1);
    this.row = clamp(this.row + (dy < 0 ? -1 : dy > 0 ? 1 : 0), 0, grid.rows - 1);
  }

  _seat() {
    const w = CONFIG.PLAYER.drawW, h = CONFIG.PLAYER.drawH;
    const R = CONFIG.RIG;
    return {
      lx: (this.x - w / 2) + R.attachLx * w,
      rx: (this.x - w / 2) + R.attachRx * w,
      y: (this.y - h / 2) + R.attachY * h,
    };
  }

  // 줄(로프) — 고정 (캐릭터 뒤)
  _drawRig(ctx) {
    const s = this._seat();
    const topY = CONFIG.PANEL.y;
    ctx.lineCap = 'round';
    ctx.strokeStyle = CONFIG.COLOR.rope;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(s.lx, topY); ctx.lineTo(s.lx, s.y);
    ctx.moveTo(s.rx, topY); ctx.lineTo(s.rx, s.y);
    ctx.stroke();
    ctx.strokeStyle = CONFIG.COLOR.ropeHi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.lx - 1.5, topY); ctx.lineTo(s.lx - 1.5, s.y);
    ctx.moveTo(s.rx - 1.5, topY); ctx.lineTo(s.rx - 1.5, s.y);
    ctx.stroke();
  }

  draw(ctx, img, brushImg) {
    const w = CONFIG.PLAYER.drawW, h = CONFIG.PLAYER.drawH;
    const dx = this.x - w / 2, dy = this.y - h / 2;

    // 추락 중: 줄 없이 회전하며 떨어짐
    if (this.falling) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.fallRot);
      ctx.translate(-this.x, -this.y);
      if (img) ctx.drawImage(img, dx, dy, w, h);
      else { ctx.fillStyle = '#7a3fb0'; ctx.beginPath(); ctx.arc(this.x, this.y, w * 0.34, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      return;
    }

    this._drawRig(ctx); // 로프(고정)

    if (!img) {
      ctx.fillStyle = '#7a3fb0';
      ctx.beginPath();
      ctx.arc(this.x, this.y, w * 0.34, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // 캐릭터(몸) — 정지
    ctx.drawImage(img, dx, dy, w, h);

    // 빗자루(brush.png) — 손잡이 기준으로만 회전 (닦을 때 brushAngle 스윙)
    if (brushImg) {
      const B = CONFIG.BRUSH;
      const handX = dx + B.pivotX * w, handY = dy + B.pivotY * h + (B.dy || 0); // dy: 상하 미세 보정
      const bw = w * B.imgScale, bh = bw * (brushImg.height / brushImg.width);
      ctx.save();
      ctx.translate(handX, handY);
      ctx.rotate(B.imgAngle + this.brushAngle);
      ctx.drawImage(brushImg, -B.imgPivX * bw, -B.imgPivY * bh, bw, bh);
      ctx.restore();
    }
  }
}
