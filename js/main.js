'use strict';

/* 진입점: 폰트·에셋 로드 후 게임 루프 시작 */
window.addEventListener('load', async () => {
  // Puzzle Sans 폰트 준비 (캔버스 텍스트에 반영)
  try { await document.fonts.load('700 40px "Puzzle Sans"'); await document.fonts.ready; } catch (e) { /* 폴백 사용 */ }

  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  await game.load();
  game.run();
  window.game = game; // 디버그/테스트용 핸들

  // M 키로 사운드 음소거 토글
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM') Sound.toggle(); });
});
