const MAP_SIZE = 5;
const NUM_FLOORS = 4;
const MAX_HP = 100;
const BOSS_HP = 270;
const POTION_HEAL = 50;

const RoomType = {
  START: 'START',
  FOREST: 'FOREST',
  CAVE: 'CAVE',
  WASTELAND: 'WASTELAND',
  REST: 'REST',
  WALL: 'WALL',
  STAIRS_DOWN: 'STAIRS_DOWN',
  STAIRS_UP: 'STAIRS_UP',
  BOSS_GATE: 'BOSS_GATE',
  BOSS: 'BOSS',
};

function createRoom() {
  return {
    type: RoomType.FOREST,
    hasMonster: false,
    monsterHp: 0,
    isBoss: false,
    hasChest: false,
    chestOpened: false,
    hasPotion: false,
    monsterName: '',
  };
}

function randRange(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randPercent() {
  return Math.floor(Math.random() * 100);
}

const FOREST_MONSTERS = ['哥布林', '野狼', '樹妖', '沼澤蛙人'];
const CAVE_MONSTERS = ['地底蜘蛛', '蝙蝠群', '石像鬼', '洞穴蜥蜴'];
const WASTELAND_MONSTERS = ['枯骨兵', '沙蠍', '荒漠盜匪', '腐屍獸'];
const WEAPONS = ['生鏽短劍', '獵人短弓', '鋼鐵長刀', '符文匕首'];
const ARMORS = ['皮革護胸', '鍊甲背心', '山民斗篷', '古舊盾甲'];

const ROOM_DESCRIPTIONS = {
  [RoomType.START]: [
    '你站在一片寧靜的營地中，篝火餘燼仍帶著暖意。',
    '破舊的地圖釘在木樁上，標示著更深處的地牢入口。',
    '這裡是第一層的安全起點。',
  ],
  [RoomType.FOREST]: [
    '你置身於迷霧森林中，參天古木遮蔽了天日。',
    '濕冷的苔蘚覆蓋著樹根，遠處傳來野獸的低吼。',
  ],
  [RoomType.CAVE]: [
    '陰暗潮濕的鐘乳石洞，水滴聲在甬道中迴盪。',
    '深處的寒風夾雜著霉味，讓你不禁握緊了武器。',
  ],
  [RoomType.WASTELAND]: [
    '龜裂的荒原上狂風捲起沙塵，視野一片昏黃。',
    '遠處的枯骨訴說著這片土地的殘酷。',
  ],
  [RoomType.REST]: [
    '簡陋的休息營地，營火旁飄著草藥清香。',
    '你可以在這裡稍作歇息恢復體力。',
  ],
  [RoomType.STAIRS_DOWN]: [
    '一道古老的石階向下延伸，冷風從深處湧上。',
    '階梯旁刻著模糊的符文——按 I 可進入下一層。',
  ],
  [RoomType.STAIRS_UP]: [
    '石階向上延伸，通往上一層的入口。',
    '你可以自由走動，按 I 可沿石階返回上層。',
  ],
  [RoomType.BOSS_GATE]: [
    '一道刻有猙獰面具的巨大石門矗立眼前，門縫滲出暗紅微光。',
    '門後傳來令人窒息的壓迫感——這是 BOSS 房的入口。',
    '站在此處按 I 可進入第四層決戰。',
  ],
  [RoomType.BOSS]: [
    '巨大的石柱環繞著這間殿堂，地面滿是戰鬥的痕跡。',
    '空氣凝滯如鉛，遠古魔王就在殿堂中央等待著你！',
  ],
  [RoomType.WALL]: ['前方是崩塌的巨石與斷裂的岩壁，完全堵死了去路。'],
};

const SCENT_MESSAGES = [
  '一縷帶著腐臭的風從%s吹來，你的直覺在尖叫。',
  '%s傳來骨骼摩擦般的沙沙聲，空氣裡瀰漫著危險。',
  '你聽見%s有沉重的腳步聲徘徊，地面似乎都在微微震動。',
  '%s的陰影裡隱約有雙猩紅的眼睛一閃而過。',
];
const DIR_NAMES = ['北方', '南方', '東方', '西方'];
const DX = [0, 0, 1, -1];
const DY = [-1, 1, 0, 0];

function randomTerrain() {
  const roll = Math.floor(Math.random() * 10);
  if (roll < 3) return RoomType.FOREST;
  if (roll < 6) return RoomType.CAVE;
  if (roll < 8) return RoomType.WASTELAND;
  return RoomType.REST;
}

function assignMonsterName(room) {
  if (room.isBoss) {
    room.monsterName = '遠古魔王';
    return;
  }
  let pool;
  switch (room.type) {
    case RoomType.FOREST: pool = FOREST_MONSTERS; break;
    case RoomType.CAVE: pool = CAVE_MONSTERS; break;
    case RoomType.WASTELAND: pool = WASTELAND_MONSTERS; break;
    default: room.monsterName = '未知魔物'; return;
  }
  room.monsterName = pool[Math.floor(Math.random() * pool.length)];
}

function collectEdgeCells(floors, floor, excludeX, excludeY) {
  const cells = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const onEdge = x === 0 || x === MAP_SIZE - 1 || y === 0 || y === MAP_SIZE - 1;
      if (!onEdge || floors[floor][y][x].type === RoomType.WALL) continue;
      if (x === excludeX && y === excludeY) continue;
      cells.push([x, y]);
    }
  }
  return cells;
}

function pickEdgeCell(floors, floor, excludeX, excludeY) {
  const cells = collectEdgeCells(floors, floor, excludeX, excludeY);
  if (cells.length === 0) return null;
  return cells[Math.floor(Math.random() * cells.length)];
}

function ensureStairPassage(floors, floor, sx, sy) {
  const room = floors[floor][sy][sx];
  room.hasMonster = false;
  room.monsterHp = 0;

  for (let i = 0; i < 4; i++) {
    const x = sx + DX[i];
    const y = sy + DY[i];
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) continue;
    const r = floors[floor][y][x];
    if (r.type === RoomType.WALL) r.type = randomTerrain();
    r.hasMonster = false;
    r.monsterHp = 0;
  }
}

function generateFloorTerrain(floors, explored, wallKnown, floor, startX, startY, startType) {
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      floors[floor][y][x] = createRoom();
      explored[floor][y][x] = false;
      wallKnown[floor][y][x] = false;
    }
  }

  floors[floor][startY][startX].type = startType;

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (x === startX && y === startY) continue;
      const r = floors[floor][y][x];
      if (randPercent() < 15) {
        r.type = RoomType.WALL;
      } else {
        r.type = randomTerrain();
      }
      if (r.type !== RoomType.WALL && r.type !== RoomType.REST && randPercent() < 40) {
        r.hasMonster = true;
        r.monsterHp = randRange(20, 40);
        assignMonsterName(r);
      }
    }
  }
}

function carvePassage(floors, floor, x0, y0, x1, y1) {
  let x = x0;
  let y = y0;
  while (x !== x1 || y !== y1) {
    if (x !== x1) x += x1 > x ? 1 : -1;
    else y += y1 > y ? 1 : -1;
    const r = floors[floor][y][x];
    if (r.type === RoomType.WALL) r.type = RoomType.CAVE;
    r.hasMonster = false;
    r.monsterHp = 0;
  }
}

function initWorld() {
  const floors = Array.from({ length: NUM_FLOORS }, () =>
    Array.from({ length: MAP_SIZE }, () => Array.from({ length: MAP_SIZE }, createRoom))
  );
  const explored = Array.from({ length: NUM_FLOORS }, () =>
    Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(false))
  );
  const wallKnown = Array.from({ length: NUM_FLOORS }, () =>
    Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(false))
  );
  const stairsDownPos = Array.from({ length: NUM_FLOORS }, () => [0, 0]);

  generateFloorTerrain(floors, explored, wallKnown, 0, 2, 2, RoomType.START);
  const chest = pickEdgeCell(floors, 0, -1, -1);
  if (chest) floors[0][chest[1]][chest[0]].hasChest = true;

  const stairs1 = pickEdgeCell(floors, 0, chest ? chest[0] : -1, chest ? chest[1] : -1);
  if (stairs1) {
    floors[0][stairs1[1]][stairs1[0]].type = RoomType.STAIRS_DOWN;
    floors[0][stairs1[1]][stairs1[0]].hasMonster = false;
    floors[0][stairs1[1]][stairs1[0]].monsterHp = 0;
    stairsDownPos[0] = stairs1;
    ensureStairPassage(floors, 0, stairs1[0], stairs1[1]);
  }

  const ux = stairsDownPos[0][0];
  const uy = stairsDownPos[0][1];
  generateFloorTerrain(floors, explored, wallKnown, 1, ux, uy, RoomType.STAIRS_UP);
  floors[1][uy][ux].hasMonster = false;
  floors[1][uy][ux].monsterHp = 0;
  ensureStairPassage(floors, 1, ux, uy);

  const potionCells = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const r = floors[1][y][x];
      if (r.type === RoomType.WALL || r.type === RoomType.STAIRS_UP || r.type === RoomType.REST) continue;
      if (x === ux && y === uy) continue;
      potionCells.push([x, y]);
    }
  }
  for (let i = 0; i < 2 && potionCells.length > 0; i++) {
    const pick = Math.floor(Math.random() * potionCells.length);
    const [px, py] = potionCells[pick];
    floors[1][py][px].hasPotion = true;
    floors[1][py][px].hasMonster = false;
    floors[1][py][px].monsterHp = 0;
    potionCells[pick] = potionCells[potionCells.length - 1];
    potionCells.pop();
  }

  const stairs2 = pickEdgeCell(floors, 1, ux, uy);
  if (stairs2) {
    floors[1][stairs2[1]][stairs2[0]].type = RoomType.STAIRS_DOWN;
    floors[1][stairs2[1]][stairs2[0]].hasMonster = false;
    floors[1][stairs2[1]][stairs2[0]].monsterHp = 0;
    stairsDownPos[1] = stairs2;
    ensureStairPassage(floors, 1, stairs2[0], stairs2[1]);
  }

  const ux2 = stairsDownPos[1][0];
  const uy2 = stairsDownPos[1][1];
  generateFloorTerrain(floors, explored, wallKnown, 2, ux2, uy2, RoomType.STAIRS_UP);
  floors[2][uy2][ux2].hasMonster = false;
  floors[2][uy2][ux2].monsterHp = 0;
  ensureStairPassage(floors, 2, ux2, uy2);

  let bossGate = pickEdgeCell(floors, 2, ux2, uy2);
  if (!bossGate) bossGate = [ux2 === 0 ? MAP_SIZE - 1 : 0, uy2];
  floors[2][bossGate[1]][bossGate[0]].type = RoomType.BOSS_GATE;
  floors[2][bossGate[1]][bossGate[0]].hasMonster = false;
  floors[2][bossGate[1]][bossGate[0]].monsterHp = 0;
  stairsDownPos[2] = bossGate;
  ensureStairPassage(floors, 2, bossGate[0], bossGate[1]);

  const ux3 = stairsDownPos[2][0];
  const uy3 = stairsDownPos[2][1];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      floors[3][y][x] = createRoom();
      explored[3][y][x] = false;
      wallKnown[3][y][x] = false;
      floors[3][y][x].type = RoomType.WALL;
    }
  }
  floors[3][uy3][ux3].type = RoomType.STAIRS_UP;
  ensureStairPassage(floors, 3, ux3, uy3);
  carvePassage(floors, 3, ux3, uy3, 2, 2);
  const bossRoom = floors[3][2][2];
  bossRoom.type = RoomType.BOSS;
  bossRoom.hasMonster = true;
  bossRoom.monsterHp = BOSS_HP;
  bossRoom.isBoss = true;
  assignMonsterName(bossRoom);

  return { floors, explored, wallKnown, stairsDownPos };
}

class DungeonGame {
  constructor() {
    this.reset();
  }

  reset() {
    const world = initWorld();
    this.floors = world.floors;
    this.explored = world.explored;
    this.wallKnown = world.wallKnown;
    this.stairsDownPos = world.stairsDownPos;
    this.currentFloor = 0;
    this.gameWon = false;
    this.running = true;
    this.pendingBossConfirm = false;
    this.player = {
      x: 2, y: 2,
      hp: MAX_HP, maxHp: MAX_HP,
      atk: 15, def: 0, potions: 0,
      weapon: '拳腳', armor: '布衣',
    };
    this.explored[0][2][2] = true;
    this.log = [];
  }

  curRoom() {
    return this.floors[this.currentFloor][this.player.y][this.player.x];
  }

  addLog(text, type = 'normal') {
    this.log.push({ text, type });
  }

  revealAdjacentWalls() {
    for (let i = 0; i < 4; i++) {
      const nx = this.player.x + DX[i];
      const ny = this.player.y + DY[i];
      if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) continue;
      if (this.floors[this.currentFloor][ny][nx].type === RoomType.WALL) {
        this.wallKnown[this.currentFloor][ny][nx] = true;
      }
    }
  }

  getNearbyDanger() {
    const messages = [];
    let dangerCount = 0;
    for (let i = 0; i < 4; i++) {
      const nx = this.player.x + DX[i];
      const ny = this.player.y + DY[i];
      if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) continue;
      if (this.floors[this.currentFloor][ny][nx].hasMonster) {
        const template = SCENT_MESSAGES[Math.floor(Math.random() * SCENT_MESSAGES.length)];
        messages.push(template.replace('%s', DIR_NAMES[i]));
        dangerCount++;
      }
    }
    if (dangerCount >= 2) {
      messages.push('四面楚歌！你感覺自己已被多股惡意包圍，汗珠沿著額角滑落。');
    } else if (dangerCount === 1) {
      messages.push('你屏住呼吸，不敢輕舉妄動——威脅就在咫尺之外。');
    }
    return messages;
  }

  getLookMessages() {
    const room = this.curRoom();
    const messages = [...(ROOM_DESCRIPTIONS[room.type] || ['未知的區域。'])];
    messages.push(...this.getNearbyDanger());

    if (room.hasChest && !room.chestOpened) {
      messages.push('角落裡有一個古舊的寶箱，泛著誘人的光澤。');
    }
    if (room.hasPotion) messages.push('地上有一瓶散發微光的紅色藥劑。');
    if (room.type === RoomType.STAIRS_DOWN && this.currentFloor < NUM_FLOORS - 1) {
      messages.push(`石階向下通往第 ${this.currentFloor + 2} 層。站在此處按 I 可進入下層。`);
    }
    if (room.type === RoomType.STAIRS_UP && this.currentFloor > 0) {
      messages.push(`石階向上通往第 ${this.currentFloor} 層。站在此處按 I 可返回上層。`);
    }
    if (room.type === RoomType.BOSS_GATE) {
      messages.push('石門上刻著「決戰」二字，門後是第四層 BOSS 殿堂。按 I 進入。');
    }
    if (room.hasMonster) {
      messages.push(`【${room.monsterName}】擋住了去路！（HP: ${room.monsterHp}）`);
      messages.push(room.isBoss ? '你必須擊敗它才能離開，這是最終決戰！' : '你必須打倒它才能離開這個房間！');
    }
    return messages;
  }

  look() {
    this.getLookMessages().forEach((m) => this.addLog(m));
  }

  openChest(room) {
    if (!room.hasChest || room.chestOpened) return;
    const weaponBonus = randRange(8, 12);
    const armorBonus = randRange(5, 8);
    const wi = Math.floor(Math.random() * 4);
    const ai = Math.floor(Math.random() * 4);
    this.player.atk += weaponBonus;
    this.player.def += armorBonus;
    this.player.weapon = WEAPONS[wi];
    this.player.armor = ARMORS[ai];
    room.chestOpened = true;
    this.addLog('*** 你發現了一個塵封的寶箱！ ***', 'loot');
    this.addLog(`獲得【${WEAPONS[wi]}】（攻擊 +${weaponBonus}）與【${ARMORS[ai]}】（防禦 +${armorBonus}）！`, 'loot');
    this.addLog('裝備已穿戴妥當，你覺得有信心挑戰更深層的敵人了！', 'loot');
  }

  pickupPotion(room) {
    if (!room.hasPotion) return;
    room.hasPotion = false;
    this.player.potions++;
    this.addLog(`你撿起了一瓶回血藥劑！（目前持有 ${this.player.potions} 瓶，按 E 使用，恢復 ${POTION_HEAL} HP）`, 'loot');
  }

  restHeal() {
    const room = this.curRoom();
    if (room.type !== RoomType.REST) {
      this.addLog('只有在休息營地才能療傷。');
      return;
    }
    if (this.player.hp >= this.player.maxHp) {
      this.addLog('你的體力已經充沛，不需要休息。');
      return;
    }
    const heal = randRange(20, 35);
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
    this.addLog(`你在營火旁小憩，恢復了 ${heal} 點生命值！（HP: ${this.player.hp}/${this.player.maxHp}）`, 'heal');
  }

  usePotion() {
    if (this.player.potions <= 0) {
      this.addLog('你沒有回血道具了！');
      return true;
    }
    if (this.player.hp >= this.player.maxHp) {
      this.addLog('生命值已滿，不需要使用道具。');
      return true;
    }
    this.player.potions--;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + POTION_HEAL);
    this.addLog(`你飲下回血藥劑，恢復 ${POTION_HEAL} 點生命值！（HP: ${this.player.hp}/${this.player.maxHp}，剩餘道具: ${this.player.potions}）`, 'heal');
    return true;
  }

  onEnterRoom() {
    const room = this.curRoom();
    this.explored[this.currentFloor][this.player.y][this.player.x] = true;
    this.revealAdjacentWalls();
    this.addLog('你來到了新的區域。', 'move');
    this.look();
    this.openChest(room);
    this.pickupPotion(room);
    if (room.type === RoomType.REST) this.restHeal();
  }

  changeFloor(delta, message) {
    const nx = this.player.x;
    const ny = this.player.y;
    this.currentFloor += delta;
    this.player.x = nx;
    this.player.y = ny;
    this.explored[this.currentFloor][ny][nx] = true;
    this.revealAdjacentWalls();
    this.addLog(message, 'floor');
    if (delta > 0 && this.currentFloor === 3) {
      this.onEnterRoom();
    } else if (delta < 0) {
      this.look();
    } else {
      this.onEnterRoom();
    }
  }

  enter() {
    const room = this.curRoom();
    if (room.hasMonster) {
      this.addLog('怪物擋住了去路，無法使用樓梯！');
      return { needsBossConfirm: false };
    }
    if (room.type === RoomType.STAIRS_DOWN) {
      if (this.currentFloor >= NUM_FLOORS - 1) {
        this.addLog('這裡已經是最底層了。');
        return { needsBossConfirm: false };
      }
      this.addLog('你踏上向下的石階，冷風撲面而來……');
      this.changeFloor(1, `*** 你沿著石階向下，來到了第 ${this.currentFloor + 1} 層！ ***`);
      return { needsBossConfirm: false };
    }
    if (room.type === RoomType.STAIRS_UP) {
      if (this.currentFloor <= 0) {
        this.addLog('這裡已經是最上層了。');
        return { needsBossConfirm: false };
      }
      this.addLog('你沿石階向上攀爬，光線漸漸明亮……');
      this.changeFloor(-1, `*** 你沿石階向上，回到了第 ${this.currentFloor + 1} 層！ ***`);
      return { needsBossConfirm: false };
    }
    if (room.type === RoomType.BOSS_GATE) {
      if (this.currentFloor !== 2) {
        this.addLog('這裡沒有 BOSS 入口。');
        return { needsBossConfirm: false };
      }
      return { needsBossConfirm: true };
    }
    this.addLog('這裡沒有可以進入的通道。');
    return { needsBossConfirm: false };
  }

  confirmBossEntry(accepted) {
    if (!accepted) {
      this.addLog('你深吸一口氣，決定再準備一下再進入。');
      return;
    }
    this.addLog('你用力推開石門，暗紅光芒撲面而來……');
    this.changeFloor(1, '*** 你推開沉重石門，踏入第四層——BOSS 決戰之地！ ***');
  }

  tryMove(nx, ny) {
    const current = this.curRoom();
    if (current.hasMonster) {
      this.addLog('怪物擋住了去路！你必須先打倒它才能離開！');
      return true;
    }
    if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) {
      this.addLog('前方是地圖邊界，無法繼續前進！');
      return true;
    }
    const target = this.floors[this.currentFloor][ny][nx];
    if (target.type === RoomType.WALL) {
      this.wallKnown[this.currentFloor][ny][nx] = true;
      this.addLog('前方是崩塌的巨石，無法通行！');
      return true;
    }
    this.player.x = nx;
    this.player.y = ny;
    this.onEnterRoom();
    return true;
  }

  kill() {
    const room = this.curRoom();
    if (!room.hasMonster) {
      this.addLog('這裡沒有怪物可以攻擊。');
      return true;
    }

    room.monsterHp -= this.player.atk;
    this.addLog(`你揮動【${this.player.weapon}】斬向【${room.monsterName}】，造成 ${this.player.atk} 點傷害！`, 'combat');

    if (room.monsterHp <= 0) {
      if (room.isBoss) {
        this.gameWon = true;
        this.addLog(`【${room.monsterName}】發出震天怒吼，轟然倒地！`, 'victory');
        room.hasMonster = false;
        room.monsterHp = 0;
        room.monsterName = '';
        this.addLog('★ 恭喜通關！你擊敗了地牢深處的遠古魔王！', 'victory');
        this.addLog('陽光穿透層層岩石灑落，傳說就此誕生。感謝你完成這場冒險！', 'victory');
        return false;
      }
      this.addLog(`【${room.monsterName}】倒下了！道路暢通，你可以離開了。`, 'combat');
      room.hasMonster = false;
      room.monsterHp = 0;
      room.monsterName = '';
      return true;
    }

    this.addLog(`【${room.monsterName}】還活著！（剩餘 HP: ${room.monsterHp}）`, 'combat');

    const monsterDamage = room.isBoss ? randRange(16, 24) : randRange(5, 15);
    const actualDamage = Math.max(1, monsterDamage - this.player.def);
    this.player.hp -= actualDamage;

    if (room.isBoss) {
      this.addLog(`【${room.monsterName}】揮舞巨爪反擊，造成 ${actualDamage} 點傷害！（HP: ${this.player.hp}）`, 'combat');
    } else {
      this.addLog(`【${room.monsterName}】反擊，造成 ${actualDamage} 點傷害！（【${this.player.armor}】抵銷部分傷害，HP: ${this.player.hp}）`, 'combat');
    }

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      if (room.isBoss) {
        this.addLog('魔王的力量壓倒了你的意志……你在最終決戰中倒下了。', 'death');
        this.addLog('提示：穿上第一層寶箱裝備，並在第二層拾取道具後再挑戰！', 'death');
      } else {
        this.addLog('你已力竭倒下，冒險結束...', 'death');
      }
      return false;
    }
    return true;
  }

  mapSymbol(floor, x, y) {
    const r = this.floors[floor][y][x];
    const exp = this.explored[floor][y][x];
    const wk = this.wallKnown[floor][y][x];

    if (floor === this.currentFloor && x === this.player.x && y === this.player.y) return 'P';
    if (r.type === RoomType.WALL) return (wk || exp) ? 'X' : '?';
    if (!exp && !wk) return '?';
    if (r.type === RoomType.START) return 'S';
    if (r.type === RoomType.REST) return 'R';
    if (r.hasChest && !r.chestOpened) return 'T';
    if (r.hasPotion) return '+';
    if (r.type === RoomType.BOSS_GATE) return 'B';
    if (r.type === RoomType.BOSS && r.hasMonster) return 'B';
    return ' ';
  }

  mapCell(floor, x, y) {
    const r = this.floors[floor][y][x];
    const exp = this.explored[floor][y][x];
    const wk = this.wallKnown[floor][y][x];

    if (floor === this.currentFloor && x === this.player.x && y === this.player.y) return { sym: 'P', cls: 'player' };
    if (r.type === RoomType.WALL) return { sym: (wk || exp) ? 'X' : '?', cls: 'wall' };
    if (!exp && !wk) return { sym: '?', cls: 'unknown' };
    if (r.type === RoomType.STAIRS_DOWN) return { sym: 'v', cls: 'stairs-down' };
    if (r.type === RoomType.STAIRS_UP) return { sym: '^', cls: 'stairs-up' };
    if (r.type === RoomType.BOSS_GATE || (r.type === RoomType.BOSS && r.hasMonster)) return { sym: 'B', cls: 'boss' };

    const sym = this.mapSymbol(floor, x, y);
    const clsMap = { S: 'start', R: 'rest', T: 'chest', '+': 'potion' };
    return { sym, cls: clsMap[sym] || 'explored' };
  }

  getMapGrid() {
    const grid = [];
    for (let y = 0; y < MAP_SIZE; y++) {
      const row = [];
      for (let x = 0; x < MAP_SIZE; x++) {
        row.push(this.mapCell(this.currentFloor, x, y));
      }
      grid.push(row);
    }
    return grid;
  }

  getStatus() {
    return {
      floor: this.currentFloor + 1,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      atk: this.player.atk,
      def: this.player.def,
      potions: this.player.potions,
      weapon: this.player.weapon,
      armor: this.player.armor,
      gameWon: this.gameWon,
      running: this.running,
      alive: this.player.hp > 0,
    };
  }

  start() {
    this.log = [];
    this.addLog('你的冒險從第一層起始營地開始！', 'welcome');
    this.look();
  }
}

window.DungeonGame = DungeonGame;
window.POTION_HEAL = POTION_HEAL;
