'use strict';

/* =========================================================
 * 창문 타일 격자
 *  - 각 타일은 오염도(dirt) 0~100 을 가짐 (100 = 완전 더러움)
 *  - scrub(): 닦기, cleanliness(): 전체 청결도(%)
 *  - 타일이 깨끗해지면 "뽀득" 반짝임 이펙트 생성
 * ========================================================= */

// 깨끗한 유리에 뜨는 별 위치(셀 비율)·위상
const CLEAN_STARS = [
  { fx: 0.72, fy: 0.22, s: 1.0, ph: 0.0 },
  { fx: 0.30, fy: 0.44, s: 0.7, ph: 2.0 },
  { fx: 0.58, fy: 0.74, s: 0.85, ph: 4.1 },
];

// 4각 반짝임 별
function star4(ctx, cx, cy, R, alpha) {
  const inner = R * 0.32;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = CONFIG.COLOR.sparkle;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const ang = -Math.PI / 2 + k * Math.PI / 4;
    const rad = (k % 2 === 0) ? R : inner;
    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha * 0.55; // 중심 글로우
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

class WindowGrid {
  constructor(stage) {
    this.cols = stage.cols;
    this.rows = stage.rows;

    // 청소 격자 영역 = PANEL을 GRID_AREA 비율로 inset (map_1 창문 블록에 정렬)
    const P = CONFIG.PANEL, G = CONFIG.GRID_AREA;
    this.areaX = P.x + G.left * P.w;
    this.areaY = P.y + G.top * P.h;
    this.areaW = (G.right - G.left) * P.w;
    this.areaH = (G.bottom - G.top) * P.h;
    this.tileW = this.areaW / this.cols;
    this.tileH = this.areaH / this.rows;

    this.tiles = [];
    for (let i = 0; i < this.cols * this.rows; i++) {
      this.tiles.push({ dirt: 100 });
    }

    this.sparkles = [];
    this.flashes = [];
    this.shineT = 0; // 깨끗한 유리 반짝임 애니메이션 시간
  }

  cellCenter(col, row) {
    return { x: this.areaX + (col + 0.5) * this.tileW, y: this.areaY + (row + 0.5) * this.tileH };
  }

  // 현재 칸을 1회 닦기 (오염도를 단계만큼 감소). 방금 완전히 깨끗해졌으면 true.
  wipeCell(col, row) {
    const i = row * this.cols + col;
    const t = this.tiles[i];
    if (!t || t.dirt <= 0) return false;
    const step = 100 / CONFIG.WIPE.perWindow;
    t.dirt = Math.max(0, t.dirt - step);
    const ctr = this.cellCenter(col, row);
    this.flashes.push({ x: ctr.x, y: ctr.y, t: 0, life: 0.25 }); // 쓸어내림 효과
    if (t.dirt <= 0) {
      this.sparkles.push({ x: ctr.x, y: ctr.y, t: 0, life: 0.55 });
      return true;
    }
    return false;
  }

  cleanliness() {
    let sum = 0;
    for (const t of this.tiles) sum += (100 - t.dirt);
    return sum / this.tiles.length;
  }

  // 모든 창문이 완벽히 깨끗한가
  allClean() {
    for (const t of this.tiles) if (t.dirt > 0) return false;
    return true;
  }

  update(dt) {
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      this.sparkles[i].t += dt;
      if (this.sparkles[i].t >= this.sparkles[i].life) this.sparkles.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t += dt;
      if (this.flashes[i].t >= this.flashes[i].life) this.flashes.splice(i, 1);
    }
    this.shineT += dt;
    // TODO(M2): stage.redirt 기반 시간 경과 재오염
    // TODO(M3): 새/박쥐 장애물 경로 재오염
  }

  draw(ctx) {
    const W = CONFIG.WINDOW;

    // 창문 배경/창틀은 map_1 이미지가 제공 → 더러움(어두운 그라임)만 유리 위에 그림
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      if (t.dirt <= 0) continue;
      const c = i % this.cols, r = Math.floor(i / this.cols);
      const x = this.areaX + c * this.tileW, y = this.areaY + r * this.tileH;

      // 셀 내부 유리 영역(inset). 위아래로 2px씩 축소.
      const ix = x + W.insetX * this.tileW;
      let iy = y + W.insetY * this.tileH + 2;
      const iw = this.tileW * (1 - 2 * W.insetX);
      let ih = this.tileH * (1 - 2 * W.insetY) - 4;
      // 위에서부터 3·4층(행 2,3)은 윗쪽으로 1px 더 축소
      if (r >= 2) { iy += 1; ih -= 1; }

      // 어두운 그라임 막 (얼룩 동그라미 없음)
      const a = t.dirt / 100;
      ctx.fillStyle = `rgba(${CONFIG.COLOR.dirt},${0.82 * a})`;
      ctx.fillRect(ix, iy, iw, ih);
    }

    // 깨끗하게 닦인 유리: 반짝이는 별 이펙트 (창마다 여러 개가 위상차로 반짝)
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i].dirt > 0) continue;
      const c = i % this.cols, r = Math.floor(i / this.cols);
      const wx = this.areaX + c * this.tileW + W.insetX * this.tileW;
      const wy = this.areaY + r * this.tileH + W.insetY * this.tileH;
      const ww = this.tileW * (1 - 2 * W.insetX);
      const wh = this.tileH * (1 - 2 * W.insetY);
      for (const st of CLEAN_STARS) {
        const tw = Math.sin(this.shineT * 2.6 + i * 1.7 + st.ph);
        if (tw <= 0) continue;
        const R = (6 + st.s * 9) * (0.35 + 0.65 * tw);
        star4(ctx, wx + ww * st.fx, wy + wh * st.fy, R, tw * 0.95);
      }
    }

    // 닦기 쓸어내림 효과 (사선 하이라이트)
    for (const f of this.flashes) {
      const k = f.t / f.life;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.6;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      const len = 64, off = lerp(-26, 26, k);
      ctx.beginPath();
      ctx.moveTo(f.x - len / 2 + off, f.y + len / 2);
      ctx.lineTo(f.x + len / 2 + off, f.y - len / 2);
      ctx.stroke();
      ctx.restore();
    }

    // 반짝임(뽀득)
    for (const s of this.sparkles) {
      const k = s.t / s.life;
      const R = lerp(8, 48, k);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = CONFIG.COLOR.sparkle;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x - R, s.y); ctx.lineTo(s.x + R, s.y);
      ctx.moveTo(s.x, s.y - R); ctx.lineTo(s.x, s.y + R);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
