'use strict';

/* =========================================================
 * 장애물(Hazards)
 *  - item_1: 각 층 창문 뒤(더러움 뒤)에 배치, 창문이 열리면 수직 낙하
 *  - item_2: 박쥐 — 특정 층을 왼쪽에서 오른쪽으로 수평 비행(주기적 등장)
 *  - 주인공이 부딪히면 실패 (game이 hitsPlayer로 판정)
 * ========================================================= */

class Hazards {
  constructor(grid, stage, itemImg, batImg) {
    this.grid = grid;
    this.itemImg = itemImg || null; // item_1 (낙하)
    this.batImg = batImg || null;   // item_2 (박쥐)

    // 층마다 stage.obstacles개를 서로 다른 칸에 배치 (더러움 뒤)
    this.obstacles = [];
    const count = stage.obstacles || 0;
    for (let row = 0; row < grid.rows; row++) {
      const cols = [];
      for (let c = 0; c < grid.cols; c++) cols.push(c);
      for (let i = cols.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
      for (let k = 0; k < Math.min(count, grid.cols); k++) {
        this.obstacles.push({ row, col: cols[k], state: 'idle', y: 0, vy: 0 });
      }
    }

    // 박쥐 (특정 라운드)
    this.batEnabled = !!stage.bats;
    this.batEvery = (stage && stage.batEvery) || CONFIG.HAZARD.batEvery; // 출현 주기(스테이지별 가능, 작을수록 빈번)
    this.batRandomRow = !!(stage && stage.batRandomRow); // 랜덤 층 출현(아니면 1·2층 번갈아)
    this.batSpeed = CONFIG.HAZARD.batSpeed * ((stage && stage.batSpeedMul) || 1); // 이동 속도(스테이지별 배수)
    this.batTimer = this.batEvery; // 첫 등장까지
    this._batToggle = 0;
    this.bats = [];
  }

  idleColsOnRow(row) {
    const out = [];
    for (const o of this.obstacles) if (o.state === 'idle' && o.row === row) out.push(o.col);
    return out;
  }

  // 창문이 열릴 때 그 칸의 idle 장애물을 수직 낙하시킴
  dropAt(col, row) {
    for (const o of this.obstacles) {
      if (o.state === 'idle' && o.row === row && o.col === col) {
        o.state = 'falling';
        o.y = this.grid.cellCenter(col, row).y + CONFIG.HAZARD.obsYOffset; // 창문 위치(10px 아래)에서 시작
        o.vy = 0;
        return true;
      }
    }
    return false;
  }

  update(dt) {
    const g = this.grid;
    // 낙하 장애물
    for (const o of this.obstacles) {
      if (o.state !== 'falling') continue;
      o.vy += CONFIG.HAZARD.obsGravity * dt;
      o.y += o.vy * dt;
      if (o.y > CONFIG.HEIGHT + 120) o.state = 'done';
    }
    // 박쥐 스폰 (랜덤 층 또는 1·2층 번갈아) + 이동
    if (this.batEnabled) {
      this.batTimer -= dt;
      if (this.batTimer <= 0) {
        this.batTimer = this.batEvery;
        const row = this.batRandomRow ? Math.floor(Math.random() * this.grid.rows) : (this._batToggle % 2); this._batToggle++;
        this.bats.push({ row, x: g.areaX - g.tileW, y: g.cellCenter(0, row).y, vx: this.batSpeed, t: 0 });
      }
    }
    for (const b of this.bats) { b.x += b.vx * dt; b.t += dt; }
    this.bats = this.bats.filter(b => b.x < g.areaX + g.areaW + g.tileW);
  }

  // 주인공과 충돌 판정
  hitsPlayer(p) {
    const g = this.grid, H = CONFIG.HAZARD;
    const hx = g.tileW * H.hitX, hy = g.tileH * H.hitY;
    for (const o of this.obstacles) {
      if (o.state !== 'falling') continue;
      const cx = g.cellCenter(o.col, o.row).x;
      if (Math.abs(cx - p.x) < hx && Math.abs(o.y - p.y) < hy) return true;
    }
    for (const b of this.bats) {
      if (Math.abs(b.x - p.x) < hx && Math.abs(b.y - p.y) < hy) return true;
    }
    return false;
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

  // 더러움 뒤: idle 장애물 (창문 글라스에 클립 → 닦으면 드러남)
  drawBehind(ctx) {
    if (!this.itemImg) return;
    const g = this.grid;
    const w = g.tileW * CONFIG.HAZARD.obsW, h = w * (this.itemImg.height / this.itemImg.width);
    for (const o of this.obstacles) {
      if (o.state !== 'idle') continue;
      const c = g.cellCenter(o.col, o.row);
      const win = this._winRect(o.col, o.row);
      ctx.save();
      ctx.beginPath(); ctx.rect(win.x, win.y, win.w, win.h); ctx.clip();
      ctx.drawImage(this.itemImg, c.x - w / 2, c.y + CONFIG.HAZARD.obsYOffset - h / 2, w, h);
      ctx.restore();
    }
  }

  // 앞: 낙하 중 장애물 + 박쥐
  drawFront(ctx) {
    const g = this.grid;
    if (this.itemImg) {
      const w = g.tileW * CONFIG.HAZARD.obsW, h = w * (this.itemImg.height / this.itemImg.width);
      for (const o of this.obstacles) {
        if (o.state !== 'falling') continue;
        const cx = g.cellCenter(o.col, o.row).x;
        ctx.drawImage(this.itemImg, cx - w / 2, o.y - h / 2, w, h);
      }
    }
    if (this.batImg) {
      const img = this.batImg;
      const bw = g.tileW * CONFIG.HAZARD.batW, bh = bw * (img.height / img.width);
      const splitFrac = 0.45; // 이미지에서 날개가 시작되는 x 비율 (왼쪽=머리/몸통, 오른쪽=날개)
      for (const b of this.bats) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(-1, 1); // 진행 방향(오른쪽)을 보도록 좌우 반전
        const dx = -bw / 2, dy = -bh / 2;
        const splitX = dx + splitFrac * bw;
        const pivotX = splitX, pivotY = dy + 0.42 * bh; // 날개 뿌리
        const ang = Math.sin(b.t * 16) * 0.4;            // 날개짓 각도
        // 머리·몸통(왼쪽) — 정지
        ctx.save();
        ctx.beginPath(); ctx.rect(dx - 2, dy - 2, (splitX - dx) + 2, bh + 4); ctx.clip();
        ctx.drawImage(img, dx, dy, bw, bh);
        ctx.restore();
        // 날개(오른쪽) — 뿌리 기준으로만 회전(펄럭)
        ctx.save();
        ctx.beginPath(); ctx.rect(splitX, dy - bh * 0.55, (dx + bw) - splitX + 6, bh * 2.1); ctx.clip();
        ctx.translate(pivotX, pivotY); ctx.rotate(ang); ctx.translate(-pivotX, -pivotY);
        ctx.drawImage(img, dx, dy, bw, bh);
        ctx.restore();
        ctx.restore();
      }
    }
  }
}
