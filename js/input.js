'use strict';

/* =========================================================
 * 입력 관리
 *  - PC(비터치): 방향키/WASD 이동 + 스페이스 닦기, 화면 버튼은 숨김
 *  - 모바일(터치): 좌측 방향 버튼(D-pad) + 우측 닦기 버튼
 *  - getDir(): 현재 방향 {x,y}(-1/0/1, 단일 축)
 * ========================================================= */

class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    // 터치 지원 기기 여부 → 화면 버튼 표시/포인터 조작 사용 여부
    this.touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // 키보드 상태
    this.left = this.right = this.up = this.down = false;
    this.wipeKey = false;

    // D-pad / 닦기 버튼 (터치)
    this.pad = { id: null, dir: { x: 0, y: 0 } };
    this.wipeBtn = { id: null, active: false };

    // 입력 버퍼(눌림 이벤트) — 프레임 사이의 빠른 탭이 씹히지 않도록 큐로 보관
    this.moveTaps = [];
    this.wipeTaps = 0;

    this._anyPress = false;

    this._bindKeyboard();
    this._bindPointer();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': if (!this.left) this._queueMove(-1, 0); this.left = true; e.preventDefault(); break;
        case 'ArrowRight': case 'KeyD': if (!this.right) this._queueMove(1, 0); this.right = true; e.preventDefault(); break;
        case 'ArrowUp': case 'KeyW': if (!this.up) this._queueMove(0, -1); this.up = true; e.preventDefault(); break;
        case 'ArrowDown': case 'KeyS': if (!this.down) this._queueMove(0, 1); this.down = true; e.preventDefault(); break;
        case 'Space': if (!this.wipeKey && this.wipeTaps < 4) this.wipeTaps++; this.wipeKey = true; e.preventDefault(); break;
      }
      this._anyPress = true;
    });
    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this.left = false; break;
        case 'ArrowRight': case 'KeyD': this.right = false; break;
        case 'ArrowUp': case 'KeyW': this.up = false; break;
        case 'ArrowDown': case 'KeyS': this.down = false; break;
        case 'Space': this.wipeKey = false; break;
      }
    });
  }

  _toLogical(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * CONFIG.WIDTH,
      y: (e.clientY - rect.top) / rect.height * CONFIG.HEIGHT,
    };
  }

  _dpadDirAt(p) {
    const D = CONFIG.DPAD;
    const btns = [
      { x: D.cx, y: D.cy - D.gap, dir: { x: 0, y: -1 } },
      { x: D.cx, y: D.cy + D.gap, dir: { x: 0, y: 1 } },
      { x: D.cx - D.gap, y: D.cy, dir: { x: -1, y: 0 } },
      { x: D.cx + D.gap, y: D.cy, dir: { x: 1, y: 0 } },
    ];
    for (const b of btns) {
      if (dist(p.x, p.y, b.x, b.y) <= D.btnR) return b.dir;
    }
    return null;
  }

  _bindPointer() {
    const c = this.canvas;

    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // 사운드 버튼(우측 상단) — 토글만 하고 화면 전환/조작은 발생시키지 않음
      const sp = this._toLogical(e);
      if (CONFIG.SOUNDBTN && dist(sp.x, sp.y, CONFIG.SOUNDBTN.x, CONFIG.SOUNDBTN.y) <= CONFIG.SOUNDBTN.r) {
        if (typeof Sound !== 'undefined') Sound.toggle();
        return;
      }
      try { c.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 캡처 불가 시 무시 */ }
      this._anyPress = true; // 화면 전환은 PC/모바일 모두 클릭/탭으로
      if (!this.touch) return; // PC: 화면 버튼 미사용

      const p = this._toLogical(e);
      const d = this._dpadDirAt(p);
      if (d && this.pad.id === null) {
        this.pad.id = e.pointerId;
        this.pad.dir = d;
        this._queueMove(d.x, d.y); // 빠른 탭도 한 칸 보장
        return;
      }
      if (this.wipeBtn.id === null &&
          dist(p.x, p.y, CONFIG.WIPEBTN.x, CONFIG.WIPEBTN.y) <= CONFIG.WIPEBTN.radius) {
        this.wipeBtn.id = e.pointerId;
        this.wipeBtn.active = true;
        if (this.wipeTaps < 4) this.wipeTaps++; // 빠른 탭도 1회 보장
      }
    });

    c.addEventListener('pointermove', (e) => {
      if (this.touch && e.pointerId === this.pad.id) {
        const d = this._dpadDirAt(this._toLogical(e));
        this.pad.dir = d || { x: 0, y: 0 };
      }
    });

    const release = (e) => {
      if (e.pointerId === this.pad.id) {
        this.pad.id = null;
        this.pad.dir = { x: 0, y: 0 };
      }
      if (e.pointerId === this.wipeBtn.id) {
        this.wipeBtn.id = null;
        this.wipeBtn.active = false;
      }
    };
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', release);
  }

  // 현재 방향(단일 축, -1/0/1) — 키보드 + D-pad 합성
  getDir() {
    let x = (this.right ? 1 : 0) - (this.left ? 1 : 0) + this.pad.dir.x;
    let y = (this.down ? 1 : 0) - (this.up ? 1 : 0) + this.pad.dir.y;
    x = Math.sign(x); y = Math.sign(y);
    if (x !== 0) y = 0; // 대각선 금지
    return { x, y };
  }

  isWiping() { return this.wipeKey || this.wipeBtn.active; }

  consumePress() {
    const p = this._anyPress;
    this._anyPress = false;
    return p;
  }

  // ===== 입력 버퍼(씹힘 방지) =====
  _queueMove(x, y) { if (this.moveTaps.length < 4) this.moveTaps.push({ x, y }); }
  consumeMoveTap() { return this.moveTaps.length ? this.moveTaps.shift() : null; }
  consumeWipeTap() { if (this.wipeTaps > 0) { this.wipeTaps--; return true; } return false; }
  clearTaps() { this.moveTaps.length = 0; this.wipeTaps = 0; }
}
