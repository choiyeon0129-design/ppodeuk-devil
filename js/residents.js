'use strict';

/* =========================================================
 * 거주자(NPC)
 *  - 각 층(행)에 한 명씩 배치 (cha_2~5), 좌우로 이동
 *  - 창문 유리 안쪽(더러움 뒤)에 그려 창문 너머로 보임
 *  - 평균 ~10초마다 랜덤으로 한 명이 가까운 창문을 "엶" → 잠시 앞으로 나와 보임
 * ========================================================= */

class Residents {
  constructor(grid, images, windowImg, stage) {
    this.grid = grid;
    this.windowImg = windowImg || null; // 열린 창문 이미지
    this.hazards = null;                 // 장애물 연동(game이 설정)
    this.justOpened = null;              // 이번 프레임에 열린 창문 {col,row}
    const speedMul = (stage && stage.speedMul) || 1;                          // 이동 속도 배수
    this.list = [];
    const n = Math.min(grid.rows, images.length);
    for (let row = 0; row < n; row++) {
      const img = images[row];
      if (!img) continue;
      const yc = grid.cellCenter(0, row).y;
      this.list.push({
        img, row,
        x: grid.areaX + grid.areaW * (0.15 + 0.7 * Math.random()),
        y: yc,
        dir: Math.random() < 0.5 ? -1 : 1,
        speed: (CONFIG.RESIDENT.speedMin + Math.random() * (CONFIG.RESIDENT.speedMax - CONFIG.RESIDENT.speedMin)) * speedMul,
        openTimer: 0,
        prePause: 0,        // 창문 앞 도착 후 정지 시간
        approaching: false, // 목표 창문으로 이동 중
        targetX: 0,
        openCol: -1,
      });
    }
  }

  _bounds() {
    const g = this.grid;
    return { lo: g.areaX + g.tileW * 0.5, hi: g.areaX + g.areaW - g.tileW * 0.5 };
  }

  _nearestCol(x) {
    const g = this.grid;
    let best = 0, bd = Infinity;
    for (let c = 0; c < g.cols; c++) {
      const d = Math.abs(g.cellCenter(c, 0).x - x);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  _winRect(col, row) {
    const g = this.grid, W = CONFIG.WINDOW;
    return {
      x: g.areaX + col * g.tileW + W.insetX * g.tileW,
      y: g.areaY + row * g.tileH + W.insetY * g.tileH,
      w: g.tileW * (1 - 2 * W.insetX),
      h: g.tileH * (1 - 2 * W.insetY),
    };
  }

  update(dt) {
    this.justOpened = null;
    const b = this._bounds();
    for (const r of this.list) {
      if (r.openTimer > 0) {           // 열린 상태
        r.openTimer -= dt;
        if (r.openTimer <= 0) r.openCol = -1;
        continue;
      }
      if (r.prePause > 0) {            // 창문 앞에 도착해 정지(열기 전 대기) — 이동 안 함
        r.prePause -= dt;
        if (r.prePause <= 0) {         // 대기 끝 → 창문 오픈
          r.openTimer = CONFIG.RESIDENT.openDur;
          this.justOpened = { col: r.openCol, row: r.row };
          if (typeof Sound !== 'undefined') Sound.open();
        }
        continue;
      }
      if (r.approaching) {             // 목표 창문 앞까지 이동
        const d = r.targetX - r.x;
        const step = r.speed * dt;
        if (Math.abs(d) <= step + 0.5) { // 도착
          r.x = r.targetX;
          r.approaching = false;
          if (CONFIG.RESIDENT.prePause > 0) {
            r.prePause = CONFIG.RESIDENT.prePause; // 정지 후 열림
          } else {                                  // 정지 취소 → 즉시 열림
            r.openTimer = CONFIG.RESIDENT.openDur;
            this.justOpened = { col: r.openCol, row: r.row };
            if (typeof Sound !== 'undefined') Sound.open();
          }
        } else {
          r.x += (d < 0 ? -step : step);
          r.dir = d < 0 ? -1 : 1;
        }
        continue;
      }
      r.x += r.dir * r.speed * dt;     // 평소 이동
      if (r.x < b.lo) { r.x = b.lo; r.dir = 1; }
      else if (r.x > b.hi) { r.x = b.hi; r.dir = -1; }
    }
  }

  // 창문 열기 트리거 — 게임이 '창문을 2개 닦을 때마다' 호출.
  // 비어있는 거주자 1명이 가까운(또는 장애물 있는) 창으로 이동해 엶.
  triggerOpen() {
    const free = this.list.filter(r => r.openTimer <= 0 && r.prePause <= 0 && !r.approaching);
    if (!free.length) return;
    const r = free[Math.floor(Math.random() * free.length)];
    const idle = this.hazards ? this.hazards.idleColsOnRow(r.row) : [];
    const col = idle.length ? idle[Math.floor(Math.random() * idle.length)] : this._nearestCol(r.x);
    r.openCol = col;
    r.targetX = this.grid.cellCenter(col, r.row).x; // 창문 앞으로 이동(스냅 X)
    r.approaching = true;
  }

  _drawResident(ctx, r, scale, scaleX) {
    const win = this._winRect(0, r.row);
    const sy = win.h * scale;
    const sx = sy * (scaleX || 1); // scaleX>1 → 가로 확대(팔 벌림)
    const oy = CONFIG.RESIDENT.yOffset || 0;
    ctx.drawImage(r.img, r.x - sx / 2, (r.y + oy) - sy / 2, sx, sy);
  }

  // 창문 안(유리 뒤) — 더러움 그리기 전. 해당 행의 창문들에만 보이도록 클립.
  drawInside(ctx) {
    const g = this.grid;
    for (const r of this.list) {
      if (r.openTimer > 0) continue; // 열린 거주자는 앞에서 그림
      ctx.save();
      ctx.beginPath();
      for (let c = 0; c < g.cols; c++) {
        const w = this._winRect(c, r.row);
        ctx.rect(w.x, w.y, w.w, w.h);
      }
      ctx.clip();
      this._drawResident(ctx, r, CONFIG.RESIDENT.drawScale);
      ctx.restore();
    }
  }

  // 열린 창문 — window 리소스 정적 표시. 거주자는 크기 그대로, 팔만 앞으로 뻗음.
  drawOpen(ctx) {
    const g = this.grid;
    for (const r of this.list) {
      if (r.openTimer <= 0 || r.openCol < 0) continue;
      const win = this._winRect(r.openCol, r.row);
      const cx = g.areaX + (r.openCol + 0.5) * g.tileW;
      const cy = g.areaY + (r.row + 0.5) * g.tileH;

      // 1) 열린 창문(window 리소스) — 정적 표시
      if (this.windowImg) {
        const w = g.tileW * 1.22;
        const h = w * (this.windowImg.height / this.windowImg.width);
        ctx.drawImage(this.windowImg, cx - w / 2, cy - h / 2, w, h);
      } else {
        ctx.fillStyle = 'rgba(150,180,210,0.4)';
        ctx.fillRect(win.x, win.y, win.w, win.h);
      }

      // 2) 거주자 — 크기 변경 없이 그대로
      ctx.save();
      ctx.beginPath();
      ctx.rect(win.x - 14, win.y - win.h * 0.45, win.w + 28, win.h * 1.45);
      ctx.clip();
      this._drawResident(ctx, r, CONFIG.RESIDENT.drawScale);
      ctx.restore();
    }
  }
}
