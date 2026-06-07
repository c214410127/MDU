const game = new DungeonGame();
let active = true;

const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
const mapEl = document.getElementById('map');
const mapAxisLeft = document.getElementById('map-axis-left');
const mapTitleEl = document.getElementById('map-title');
const hpBarEl = document.getElementById('hp-bar');
const hpTextEl = document.getElementById('hp-text');
const floorBadgeEl = document.getElementById('floor-badge');
const modalOverlay = document.getElementById('modal-overlay');
const endOverlay = document.getElementById('end-overlay');
const endTitle = document.getElementById('end-title');
const endMessage = document.getElementById('end-message');
const endIconEl = document.getElementById('end-icon');

const FLOOR_NAMES = ['起始營地', '迷霧深處', '荒原邊境', '魔王殿堂'];

function renderLog() {
  logEl.innerHTML = game.log
    .map((entry) => `<div class="log-entry ${entry.type}">${escapeHtml(entry.text)}</div>`)
    .join('');
  logEl.scrollTop = logEl.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderHpBar(s) {
  const pct = Math.max(0, (s.hp / s.maxHp) * 100);
  let barCls = '';
  let textCls = '';

  if (pct <= 30) {
    barCls = 'low';
    textCls = 'low';
  } else if (pct <= 60) {
    barCls = 'mid';
    textCls = 'mid';
  }

  hpBarEl.style.width = `${pct}%`;
  hpBarEl.className = `hp-bar-fill ${barCls}`.trim();
  hpTextEl.textContent = `${s.hp} / ${s.maxHp}`;
  hpTextEl.className = `hp-text ${textCls}`.trim();
}

function renderFloorBadge(s) {
  const name = FLOOR_NAMES[s.floor - 1] || '未知區域';
  floorBadgeEl.textContent = `第 ${s.floor} 層 · ${name}`;
}

function renderStatus() {
  const s = game.getStatus();
  renderHpBar(s);
  renderFloorBadge(s);

  statusEl.innerHTML = `
    <div class="status-item"><span class="status-label">攻擊力</span><span class="status-value gold">${s.atk}</span></div>
    <div class="status-item"><span class="status-label">防禦力</span><span class="status-value">${s.def}</span></div>
    <div class="status-item"><span class="status-label">回血道具</span><span class="status-value">${s.potions} 瓶</span></div>
    <div class="status-item"><span class="status-label">目前樓層</span><span class="status-value">第 ${s.floor} 層</span></div>
    <div class="status-item full"><span class="status-label">武器</span><span class="status-value">${escapeHtml(s.weapon)}</span></div>
    <div class="status-item full"><span class="status-label">防具</span><span class="status-value">${escapeHtml(s.armor)}</span></div>
  `;
}

function renderMap() {
  const s = game.getStatus();
  mapTitleEl.textContent = `第 ${s.floor} 層 小地圖`;
  const grid = game.getMapGrid();

  mapAxisLeft.innerHTML = grid
    .map((_, y) => `<span>${y}</span>`)
    .join('');

  mapEl.innerHTML = grid
    .map((row) =>
      row
        .map((cell) => `<div class="map-cell ${cell.cls}" role="gridcell">${escapeHtml(cell.sym)}</div>`)
        .join('')
    )
    .join('');
}

function render() {
  renderLog();
  renderStatus();
  renderMap();
  updateButtons();
}

function updateButtons() {
  const alive = game.player.hp > 0 && !game.gameWon;
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.disabled = !alive;
  });
}

function checkGameEnd() {
  if (game.gameWon) {
    showEnd('victory', '★ 恭喜通關！', '你擊敗了遠古魔王，成為傳說中的冒險者！');
    active = false;
    return;
  }
  if (game.player.hp <= 0) {
    showEnd('death', '冒險結束', '你已力竭倒下。整理好裝備，再次挑戰地牢吧！');
    active = false;
  }
}

function showEnd(cls, title, message) {
  const modal = endOverlay.querySelector('.end-modal');
  endTitle.textContent = title;
  endTitle.className = cls;
  endMessage.textContent = message;
  endIconEl.textContent = cls === 'victory' ? '★' : '💀';
  endIconEl.className = `modal-icon ${cls}`;
  modal.className = `modal end-modal ${cls}`;
  endOverlay.classList.remove('hidden');
}

function hideEnd() {
  endOverlay.classList.add('hidden');
}

function showBossModal() {
  modalOverlay.classList.remove('hidden');
}

function hideBossModal() {
  modalOverlay.classList.add('hidden');
}

function move(dir) {
  if (!active) return;
  const dirs = {
    up: [game.player.x, game.player.y - 1],
    down: [game.player.x, game.player.y + 1],
    left: [game.player.x - 1, game.player.y],
    right: [game.player.x + 1, game.player.y],
  };
  const [nx, ny] = dirs[dir];
  active = game.tryMove(nx, ny);
  render();
  checkGameEnd();
}

function doAction(action) {
  if (!active) return;

  switch (action) {
    case 'look':
      game.look();
      break;
    case 'kill':
      active = game.kill();
      break;
    case 'enter': {
      const result = game.enter();
      if (result.needsBossConfirm) {
        showBossModal();
        render();
        return;
      }
      break;
    }
    case 'potion':
      active = game.usePotion();
      break;
    case 'rest':
      game.restHeal();
      break;
    case 'map':
      game.addLog(`===== 第 ${game.currentFloor + 1} 層 小地圖 =====`, 'normal');
      game.addLog('圖例：P=玩家 ?=未知 X=巨石 v=下樓 ^=上樓 B=BOSS + =道具 T=寶箱 R=休息 S=起點', 'normal');
      break;
    default:
      break;
  }

  render();
  checkGameEnd();
}

function handleKey(e) {
  if (!active) return;
  if (modalOverlay.classList.contains('hidden') === false) {
    const k = e.key.toLowerCase();
    if (k === 'y') { hideBossModal(); game.confirmBossEntry(true); render(); checkGameEnd(); e.preventDefault(); }
    if (k === 'n') { hideBossModal(); game.confirmBossEntry(false); render(); e.preventDefault(); }
    return;
  }

  const key = e.key.toLowerCase();
  const moves = {
    arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
  };

  if (moves[key]) {
    move(moves[key]);
    e.preventDefault();
    return;
  }

  const actions = { l: 'look', k: 'kill', i: 'enter', e: 'potion', h: 'rest', m: 'map' };
  if (actions[key]) {
    doAction(actions[key]);
    e.preventDefault();
    return;
  }

  if (key === 'q') {
    game.addLog('感謝遊玩，再見！');
    active = false;
    render();
    updateButtons();
    e.preventDefault();
  }
}

function init() {
  game.reset();
  game.start();
  active = true;
  hideEnd();
  hideBossModal();
  render();

  document.querySelectorAll('.move-btn').forEach((btn) => {
    btn.addEventListener('click', () => move(btn.dataset.dir));
  });

  document.querySelectorAll('.action-btn').forEach((btn) => {
    btn.addEventListener('click', () => doAction(btn.dataset.action));
  });

  document.getElementById('modal-yes').addEventListener('click', () => {
    hideBossModal();
    game.confirmBossEntry(true);
    render();
    checkGameEnd();
  });

  document.getElementById('modal-no').addEventListener('click', () => {
    hideBossModal();
    game.confirmBossEntry(false);
    render();
  });

  document.getElementById('restart-btn').addEventListener('click', init);

  document.addEventListener('keydown', handleKey);
}

init();
