#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <time.h>
#include <ctype.h>

#ifdef _WIN32
#include <conio.h>
#endif

#define MAP_SIZE 5
#define NUM_FLOORS 4
#define MAX_HP 100
#define BOSS_HP 270
#define POTION_HEAL 50

/* 房間類型 */
typedef enum {
    START,
    FOREST,
    CAVE,
    WASTELAND,
    REST,
    WALL,
    STAIRS_DOWN,  /* 通往下一層 */
    STAIRS_UP,    /* 來自上一層的入口 */
    BOSS_GATE,    /* 第三層邊緣：BOSS 房入口（顯示 B，按 I 進第四層） */
    BOSS          /* 第四層：BOSS 決戰房 */
} RoomType;

struct Room {
    RoomType type;
    int has_monster;
    int monster_hp;
    int is_boss;
    int has_chest;
    int chest_opened;
    int has_potion; /* 地上未拾取的回血道具 */
    char monster_name[32];
};

struct Player {
    int x, y;
    int hp;
    int max_hp;
    int atk;
    int def;
    int potions;
    char weapon[32];
    char armor[32];
};

/* 全域狀態 */
static struct Room floors[NUM_FLOORS][MAP_SIZE][MAP_SIZE];
static int explored[NUM_FLOORS][MAP_SIZE][MAP_SIZE];
static int wall_known[NUM_FLOORS][MAP_SIZE][MAP_SIZE]; /* 已確認的牆壁（地圖顯示 X） */
static struct Player player;
static int current_floor;
static int game_won;
static int stairs_down_pos[NUM_FLOORS][2]; /* 各層下樓梯 / BOSS 入口座標 */

static int rand_range(int min, int max)
{
    return min + rand() % (max - min + 1);
}

static int rand_percent(void)
{
    return rand() % 100;
}

static struct Room *cur_room(void)
{
    return &floors[current_floor][player.y][player.x];
}

static void init_room(struct Room *room)
{
    room->type = FOREST;
    room->has_monster = 0;
    room->monster_hp = 0;
    room->is_boss = 0;
    room->has_chest = 0;
    room->chest_opened = 0;
    room->has_potion = 0;
    room->monster_name[0] = '\0';
}

/* 依房間地形隨機賦予怪物名稱 */
static void assign_monster_name(struct Room *room)
{
    static const char *forest_monsters[] = {"哥布林", "野狼", "樹妖", "沼澤蛙人"};
    static const char *cave_monsters[] = {"地底蜘蛛", "蝙蝠群", "石像鬼", "洞穴蜥蜴"};
    static const char *wasteland_monsters[] = {"枯骨兵", "沙蠍", "荒漠盜匪", "腐屍獸"};
    int pick;

    if (room->is_boss) {
        strcpy(room->monster_name, "遠古魔王");
        return;
    }

    switch (room->type) {
    case FOREST:
        pick = rand() % 4;
        strcpy(room->monster_name, forest_monsters[pick]);
        break;
    case CAVE:
        pick = rand() % 4;
        strcpy(room->monster_name, cave_monsters[pick]);
        break;
    case WASTELAND:
        pick = rand() % 4;
        strcpy(room->monster_name, wasteland_monsters[pick]);
        break;
    default:
        strcpy(room->monster_name, "未知魔物");
        break;
    }
}

static RoomType random_terrain(void)
{
    int roll = rand() % 10;

    if (roll < 3) return FOREST;
    if (roll < 6) return CAVE;
    if (roll < 8) return WASTELAND;
    return REST;
}

/* 收集邊緣可通行格子 */
static int collect_edge_cells(int floor, int cells[16][2], int exclude_x, int exclude_y)
{
    int x, y;
    int count = 0;

    for (y = 0; y < MAP_SIZE; y++) {
        for (x = 0; x < MAP_SIZE; x++) {
            int on_edge = (x == 0 || x == MAP_SIZE - 1 || y == 0 || y == MAP_SIZE - 1);

            if (!on_edge || floors[floor][y][x].type == WALL) {
                continue;
            }
            if (x == exclude_x && y == exclude_y) {
                continue;
            }

            cells[count][0] = x;
            cells[count][1] = y;
            count++;
        }
    }

    return count;
}

/* 在邊緣隨機選一格 */
static int pick_edge_cell(int floor, int *out_x, int *out_y, int exclude_x, int exclude_y)
{
    int cells[16][2];
    int count = collect_edge_cells(floor, cells, exclude_x, exclude_y);
    int pick;

    if (count == 0) {
        return 0;
    }

    pick = rand() % count;
    *out_x = cells[pick][0];
    *out_y = cells[pick][1];
    return 1;
}

/* 清除樓梯出入口周圍的巨石，確保至少可自由進出 */
static void ensure_stair_passage(int floor, int sx, int sy)
{
    static const int dx[] = {-1, 1, 0, 0};
    static const int dy[] = {0, 0, -1, 1};
    int i;

    floors[floor][sy][sx].has_monster = 0;
    floors[floor][sy][sx].monster_hp = 0;

    for (i = 0; i < 4; i++) {
        int x = sx + dx[i];
        int y = sy + dy[i];
        struct Room *r;

        if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) {
            continue;
        }

        r = &floors[floor][y][x];
        if (r->type == WALL) {
            r->type = random_terrain();
        }
        r->has_monster = 0;
        r->monster_hp = 0;
    }
}

/* 生成單層隨機地形（不含樓梯、BOSS 等特殊設定） */
static void generate_floor_terrain(int floor, int start_x, int start_y, RoomType start_type)
{
    int x, y;

    for (y = 0; y < MAP_SIZE; y++) {
        for (x = 0; x < MAP_SIZE; x++) {
            init_room(&floors[floor][y][x]);
            explored[floor][y][x] = 0;
            wall_known[floor][y][x] = 0;
        }
    }

    floors[floor][start_y][start_x].type = start_type;

    for (y = 0; y < MAP_SIZE; y++) {
        for (x = 0; x < MAP_SIZE; x++) {
            if (x == start_x && y == start_y) {
                continue;
            }

            if (rand_percent() < 15) {
                floors[floor][y][x].type = WALL;
            } else {
                floors[floor][y][x].type = random_terrain();
            }

            if (floors[floor][y][x].type != WALL &&
                floors[floor][y][x].type != REST &&
                rand_percent() < 40) {
                struct Room *r = &floors[floor][y][x];

                r->has_monster = 1;
                r->monster_hp = rand_range(20, 40);
                assign_monster_name(r);
            }
        }
    }
}

/* 第一層：寶箱 + 下樓梯 */
static void init_floor1(void)
{
    int cx, cy;
    int sx, sy;

    generate_floor_terrain(0, 2, 2, START);

    if (pick_edge_cell(0, &cx, &cy, -1, -1)) {
        floors[0][cy][cx].has_chest = 1;
    }

    if (pick_edge_cell(0, &sx, &sy, cx, cy)) {
        floors[0][sy][sx].type = STAIRS_DOWN;
        floors[0][sy][sx].has_monster = 0;
        floors[0][sy][sx].monster_hp = 0;
        stairs_down_pos[0][0] = sx;
        stairs_down_pos[0][1] = sy;
        ensure_stair_passage(0, sx, sy);
    }
}

/* 第二層：上樓梯（對應第一層出口）+ 回血道具 + 下樓梯 */
static void init_floor2(void)
{
    int ux = stairs_down_pos[0][0];
    int uy = stairs_down_pos[0][1];
    int potion_cells[8][2];
    int potion_count = 0;
    int sx, sy;
    int i, x, y;

    generate_floor_terrain(1, ux, uy, STAIRS_UP);
    floors[1][uy][ux].has_monster = 0;
    floors[1][uy][ux].monster_hp = 0;
    ensure_stair_passage(1, ux, uy);

    for (y = 0; y < MAP_SIZE; y++) {
        for (x = 0; x < MAP_SIZE; x++) {
            struct Room *r = &floors[1][y][x];

            if (r->type == WALL || r->type == STAIRS_UP || r->type == REST) {
                continue;
            }
            if (x == ux && y == uy) {
                continue;
            }

            potion_cells[potion_count][0] = x;
            potion_cells[potion_count][1] = y;
            potion_count++;
        }
    }

    /* 放置 2 個回血道具 */
    for (i = 0; i < 2 && potion_count > 0; i++) {
        int pick = rand() % potion_count;
        x = potion_cells[pick][0];
        y = potion_cells[pick][1];
        floors[1][y][x].has_potion = 1;
        floors[1][y][x].has_monster = 0;
        floors[1][y][x].monster_hp = 0;

        potion_cells[pick][0] = potion_cells[potion_count - 1][0];
        potion_cells[pick][1] = potion_cells[potion_count - 1][1];
        potion_count--;
    }

    if (pick_edge_cell(1, &sx, &sy, ux, uy)) {
        floors[1][sy][sx].type = STAIRS_DOWN;
        floors[1][sy][sx].has_monster = 0;
        floors[1][sy][sx].monster_hp = 0;
        stairs_down_pos[1][0] = sx;
        stairs_down_pos[1][1] = sy;
        ensure_stair_passage(1, sx, sy);
    }
}

/* 開闢從入口到 BOSS 殿堂的通道（第四層使用） */
static void carve_passage(int floor, int x0, int y0, int x1, int y1)
{
    int x = x0;
    int y = y0;

    while (x != x1 || y != y1) {
        struct Room *r;

        if (x != x1) {
            x += (x1 > x) ? 1 : -1;
        } else {
            y += (y1 > y) ? 1 : -1;
        }

        r = &floors[floor][y][x];
        if (r->type == WALL) {
            r->type = CAVE;
        }
        r->has_monster = 0;
        r->monster_hp = 0;
    }
}

/* 第三層：上樓梯 + 邊緣 BOSS 房入口 (B) */
static void init_floor3(void)
{
    int ux = stairs_down_pos[1][0];
    int uy = stairs_down_pos[1][1];
    int bx, by;

    generate_floor_terrain(2, ux, uy, STAIRS_UP);
    floors[2][uy][ux].has_monster = 0;
    floors[2][uy][ux].monster_hp = 0;
    ensure_stair_passage(2, ux, uy);

    /* BOSS 入口固定放在邊緣，地圖顯示 B，不會隨機消失 */
    if (!pick_edge_cell(2, &bx, &by, ux, uy)) {
        bx = (ux == 0) ? MAP_SIZE - 1 : 0;
        by = uy;
    }
    floors[2][by][bx].type = BOSS_GATE;
    floors[2][by][bx].has_monster = 0;
    floors[2][by][bx].monster_hp = 0;
    stairs_down_pos[2][0] = bx;
    stairs_down_pos[2][1] = by;
    ensure_stair_passage(2, bx, by);
}

/* 第四層：BOSS 決戰殿堂 */
static void init_floor4(void)
{
    int ux = stairs_down_pos[2][0];
    int uy = stairs_down_pos[2][1];
    int x, y;

    for (y = 0; y < MAP_SIZE; y++) {
        for (x = 0; x < MAP_SIZE; x++) {
            init_room(&floors[3][y][x]);
            explored[3][y][x] = 0;
            wall_known[3][y][x] = 0;
            floors[3][y][x].type = WALL;
        }
    }

    floors[3][uy][ux].type = STAIRS_UP;
    ensure_stair_passage(3, ux, uy);
    carve_passage(3, ux, uy, 2, 2);

    floors[3][2][2].type = BOSS;
    floors[3][2][2].has_monster = 1;
    floors[3][2][2].monster_hp = BOSS_HP;
    floors[3][2][2].is_boss = 1;
    assign_monster_name(&floors[3][2][2]);
}

static void init_world(void)
{
    init_floor1();
    init_floor2();
    init_floor3();
    init_floor4();
}

static void init_player(void)
{
    current_floor = 0;
    game_won = 0;
    player.x = 2;
    player.y = 2;
    player.hp = MAX_HP;
    player.max_hp = MAX_HP;
    player.atk = 15;
    player.def = 0;
    player.potions = 0;
    strcpy(player.weapon, "拳腳");
    strcpy(player.armor, "布衣");
    explored[0][2][2] = 1;
}

/* 揭露相鄰牆壁，讓地圖顯示 X */
static void reveal_adjacent_walls(void)
{
    static const int dx[] = {0, 0, 1, -1};
    static const int dy[] = {-1, 1, 0, 0};
    int i;

    for (i = 0; i < 4; i++) {
        int nx = player.x + dx[i];
        int ny = player.y + dy[i];

        if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) {
            continue;
        }

        if (floors[current_floor][ny][nx].type == WALL) {
            wall_known[current_floor][ny][nx] = 1;
        }
    }
}

static void print_nearby_danger(void)
{
    static const int dx[] = {0, 0, 1, -1};
    static const int dy[] = {-1, 1, 0, 0};
    static const char *dir_name[] = {"北方", "南方", "東方", "西方"};
    static const char *scent[] = {
        "一縷帶著腐臭的風從%s吹來，你的直覺在尖叫。",
        "%s傳來骨骼摩擦般的沙沙聲，空氣裡瀰漫著危險。",
        "你聽見%s有沉重的腳步聲徘徊，地面似乎都在微微震動。",
        "%s的陰影裡隱約有雙猩紅的眼睛一閃而過。"
    };

    int i;
    int danger_count = 0;

    for (i = 0; i < 4; i++) {
        int nx = player.x + dx[i];
        int ny = player.y + dy[i];

        if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) {
            continue;
        }

        if (floors[current_floor][ny][nx].has_monster) {
            printf(scent[rand() % 4], dir_name[i]);
            printf("\n");
            danger_count++;
        }
    }

    if (danger_count >= 2) {
        printf("四面楚歌！你感覺自己已被多股惡意包圍，汗珠沿著額角滑落。\n");
    } else if (danger_count == 1) {
        printf("你屏住呼吸，不敢輕舉妄動——威脅就在咫尺之外。\n");
    }
}

static void print_room_description(RoomType type)
{
    switch (type) {
    case START:
        printf("你站在一片寧靜的營地中，篝火餘燼仍帶著暖意。\n");
        printf("破舊的地圖釘在木樁上，標示著更深處的地牢入口。\n");
        printf("這裡是第一層的安全起點。\n");
        break;
    case FOREST:
        printf("你置身於迷霧森林中，參天古木遮蔽了天日。\n");
        printf("濕冷的苔蘚覆蓋著樹根，遠處傳來野獸的低吼。\n");
        break;
    case CAVE:
        printf("陰暗潮濕的鐘乳石洞，水滴聲在甬道中迴盪。\n");
        printf("深處的寒風夾雜著霉味，讓你不禁握緊了武器。\n");
        break;
    case WASTELAND:
        printf("龜裂的荒原上狂風捲起沙塵，視野一片昏黃。\n");
        printf("遠處的枯骨訴說著這片土地的殘酷。\n");
        break;
    case REST:
        printf("簡陋的休息營地，營火旁飄著草藥清香。\n");
        printf("你可以在這裡稍作歇息恢復體力。\n");
        break;
    case STAIRS_DOWN:
        printf("一道古老的石階向下延伸，冷風從深處湧上。\n");
        printf("階梯旁刻著模糊的符文——按 I 可進入下一層。\n");
        break;
    case STAIRS_UP:
        printf("石階向上延伸，通往上一層的入口。\n");
        printf("你可以自由走動，按 I 可沿石階返回上層。\n");
        break;
    case BOSS_GATE:
        printf("一道刻有猙獰面具的巨大石門矗立眼前，門縫滲出暗紅微光。\n");
        printf("門後傳來令人窒息的壓迫感——這是 BOSS 房的入口。\n");
        printf("站在此處按 I 可進入第四層決戰。\n");
        break;
    case BOSS:
        printf("巨大的石柱環繞著這間殿堂，地面滿是戰鬥的痕跡。\n");
        printf("空氣凝滯如鉛，遠古魔王就在殿堂中央等待著你！\n");
        break;
    case WALL:
        printf("前方是崩塌的巨石與斷裂的岩壁，完全堵死了去路。\n");
        break;
    default:
        printf("未知的區域。\n");
        break;
    }
}

/* 地圖符號：探索過的一般房間顯示空白，特殊房間顯示專用符號 */
static char map_symbol(int floor, int x, int y)
{
    struct Room *r = &floors[floor][y][x];
    int exp = explored[floor][y][x];
    int wk = wall_known[floor][y][x];

    if (floor == current_floor && x == player.x && y == player.y) {
        return 'P';
    }

    if (r->type == WALL) {
        if (wk || exp) {
            return 'X';
        }
        return '?';
    }

    if (!exp && !wk) {
        return '?';
    }

    if (r->type == START)     return 'S';
    if (r->type == REST)      return 'R';
    if (r->has_chest && !r->chest_opened) return 'T';
    if (r->has_potion)        return '+';
    if (r->type == BOSS_GATE) return 'B';
    if (r->type == BOSS && r->has_monster) return 'B';

    return ' '; /* 已探索的一般房間顯示空白 */
}

/* 印出地圖單格（樓梯使用箭頭符號） */
static void print_map_cell(int floor, int x, int y)
{
    struct Room *r = &floors[floor][y][x];
    int exp = explored[floor][y][x];
    int wk = wall_known[floor][y][x];
    char sym;

    if (floor == current_floor && x == player.x && y == player.y) {
        printf("P ");
        return;
    }

    if (r->type == WALL) {
        printf("%c ", (wk || exp) ? 'X' : '?');
        return;
    }

    if (!exp && !wk) {
        printf("? ");
        return;
    }

    if (r->type == STAIRS_DOWN) {
        printf("v "); /* 下箭頭：通往下一層 */
        return;
    }
    if (r->type == STAIRS_UP) {
        printf("^ "); /* 上箭頭：通往上一層 */
        return;
    }
    if (r->type == BOSS_GATE || (r->type == BOSS && r->has_monster)) {
        printf("B ");
        return;
    }

    sym = map_symbol(floor, x, y);
    printf("%c ", sym);
}

static void print_status_bar(void)
{
    printf("\n[第 %d 層 | HP: %d/%d | ATK: %d | DEF: %d | 道具: %d | 武器: %s | 防具: %s]\n",
           current_floor + 1, player.hp, player.max_hp, player.atk, player.def,
           player.potions, player.weapon, player.armor);
}

static void print_map(void)
{
    int x, y;

    printf("\n===== 第 %d 層 小地圖 =====\n", current_floor + 1);
    printf("   ");
    for (x = 0; x < MAP_SIZE; x++) {
        printf("%d ", x);
    }
    printf("\n");

    for (y = 0; y < MAP_SIZE; y++) {
        printf("%d  ", y);
        for (x = 0; x < MAP_SIZE; x++) {
            print_map_cell(current_floor, x, y);
        }
        printf("\n");
    }

    printf("圖例：P=玩家 ?=未知 X=巨石 v=下樓 ^=上樓 B=BOSS + =道具 T=寶箱 R=休息 S=起點 空白=已探索\n");
    printf("==========================\n");
    print_status_bar();
    printf("\n");
}

static void open_chest(struct Room *room)
{
    static const char *weapons[] = {"生鏽短劍", "獵人短弓", "鋼鐵長刀", "符文匕首"};
    static const char *armors[] = {"皮革護胸", "鍊甲背心", "山民斗篷", "古舊盾甲"};
    int weapon_bonus = rand_range(8, 12);
    int armor_bonus = rand_range(5, 8);
    int wi = rand() % 4;
    int ai = rand() % 4;

    if (!room->has_chest || room->chest_opened) {
        return;
    }

    player.atk += weapon_bonus;
    player.def += armor_bonus;
    strcpy(player.weapon, weapons[wi]);
    strcpy(player.armor, armors[ai]);
    room->chest_opened = 1;

    printf("\n*** 你發現了一個塵封的寶箱！ ***\n");
    printf("獲得【%s】（攻擊 +%d）與【%s】（防禦 +%d）！\n",
           weapons[wi], weapon_bonus, armors[ai], armor_bonus);
    printf("裝備已穿戴妥當，你覺得有信心挑戰更深層的敵人了！\n\n");
}

static void pickup_potion(struct Room *room)
{
    if (!room->has_potion) {
        return;
    }

    room->has_potion = 0;
    player.potions++;
    printf("你撿起了一瓶回血藥劑！（目前持有 %d 瓶，按 E 使用，恢復 %d HP）\n",
           player.potions, POTION_HEAL);
}

static void rest_heal(void)
{
    int heal;

    if (cur_room()->type != REST) {
        printf("只有在休息營地才能療傷。\n");
        return;
    }

    if (player.hp >= player.max_hp) {
        printf("你的體力已經充沛，不需要休息。\n");
        return;
    }

    heal = rand_range(20, 35);
    player.hp += heal;
    if (player.hp > player.max_hp) {
        player.hp = player.max_hp;
    }

    printf("你在營火旁小憩，恢復了 %d 點生命值！（HP: %d/%d）\n",
           heal, player.hp, player.max_hp);
}

static int use_potion(void)
{
    if (player.potions <= 0) {
        printf("你沒有回血道具了！\n");
        return 1;
    }

    if (player.hp >= player.max_hp) {
        printf("生命值已滿，不需要使用道具。\n");
        return 1;
    }

    player.potions--;
    player.hp += POTION_HEAL;
    if (player.hp > player.max_hp) {
        player.hp = player.max_hp;
    }

    printf("你飲下回血藥劑，恢復 %d 點生命值！（HP: %d/%d，剩餘道具: %d）\n",
           POTION_HEAL, player.hp, player.max_hp, player.potions);
    return 1;
}

static void print_victory(void)
{
    printf("\n");
    printf("╔══════════════════════════════════════════╗\n");
    printf("║           ★  恭喜通關！ ★               ║\n");
    printf("╠══════════════════════════════════════════╣\n");
    printf("║  你擊敗了地牢深處的遠古魔王！            ║\n");
    printf("║  陽光穿透層層岩石灑落，塵埃在光中飛舞。  ║\n");
    printf("║  你拖著疲憊卻驕傲的身軀走出地牢，       ║\n");
    printf("║  身後傳來崩塌的轟鳴——傳說就此誕生。    ║\n");
    printf("║                                          ║\n");
    printf("║       感謝你完成這場冒險！               ║\n");
    printf("╚══════════════════════════════════════════╝\n");
}

static void cmd_look(void)
{
    struct Room *room = cur_room();

    print_room_description(room->type);
    print_nearby_danger();

    if (room->has_chest && !room->chest_opened) {
        printf("角落裡有一個古舊的寶箱，泛著誘人的光澤。\n");
    }
    if (room->has_potion) {
        printf("地上有一瓶散發微光的紅色藥劑。\n");
    }
    if (room->type == STAIRS_DOWN && current_floor < NUM_FLOORS - 1) {
        printf("石階向下通往第 %d 層。站在此處按 I 可進入下層。\n", current_floor + 2);
    }
    if (room->type == STAIRS_UP && current_floor > 0) {
        printf("石階向上通往第 %d 層。站在此處按 I 可返回上層。\n", current_floor);
    }
    if (room->type == BOSS_GATE) {
        printf("石門上刻著「決戰」二字，門後是第四層 BOSS 殿堂。按 I 進入。\n");
    }
    if (room->has_monster) {
        printf("【%s】擋住了去路！（HP: %d）\n", room->monster_name, room->monster_hp);
        if (room->is_boss) {
            printf("你必須擊敗它才能離開，這是最終決戰！\n");
        } else {
            printf("你必須打倒它才能離開這個房間！\n");
        }
    }
}

static void on_enter_room(void)
{
    struct Room *room = cur_room();

    explored[current_floor][player.y][player.x] = 1;
    reveal_adjacent_walls();

    printf("\n你來到了新的區域。\n");
    cmd_look();

    if (room->has_chest && !room->chest_opened) {
        open_chest(room);
    }
    if (room->has_potion) {
        pickup_potion(room);
    }
    if (room->type == REST) {
        rest_heal();
    }
}

static int confirm_boss_entry(void)
{
    int c;

    printf("\n!!!  危  險  警  告  !!!\n");
    printf("前方房間散發著毀滅性的暗紅氣息，令人窒息！\n");
    printf("你感覺到一股遠超先前三層怪物的恐怖力量——這是 BOSS 的巢穴。\n");
    printf("一旦進入，將無法輕易撤退。是否進入 BOSS 房？(Y/N): ");
    fflush(stdout);

#ifdef _WIN32
    do {
        c = tolower(_getch());
    } while (c != 'y' && c != 'n');
    printf("%c\n", c);
#else
    {
        char buf[16];
        if (fgets(buf, sizeof(buf), stdin) == NULL) {
            return 0;
        }
        c = tolower((unsigned char)buf[0]);
    }
#endif

    return (c == 'y');
}

static void descend_floor(void)
{
    int nx = player.x;
    int ny = player.y;

    current_floor++;
    player.x = nx;
    player.y = ny;
    explored[current_floor][ny][nx] = 1;
    reveal_adjacent_walls();

    printf("\n*** 你沿著石階向下，來到了第 %d 層！ ***\n", current_floor + 1);
    on_enter_room();
}

static void enter_boss_floor(void)
{
    int nx = player.x;
    int ny = player.y;

    current_floor++;
    player.x = nx;
    player.y = ny;
    explored[current_floor][ny][nx] = 1;
    reveal_adjacent_walls();

    printf("\n*** 你推開沉重石門，踏入第四層——BOSS 決戰之地！ ***\n");
    on_enter_room();
}

static void ascend_floor(void)
{
    int nx = player.x;
    int ny = player.y;

    current_floor--;
    player.x = nx;
    player.y = ny;
    explored[current_floor][ny][nx] = 1;
    reveal_adjacent_walls();

    printf("\n*** 你沿石階向上，回到了第 %d 層！ ***\n", current_floor + 1);
    cmd_look();
}

/* 進入樓梯：站在樓梯格上按 I，可上下移動各層 */
static int cmd_enter(void)
{
    struct Room *room = cur_room();

    if (room->has_monster) {
        printf("怪物擋住了去路，無法使用樓梯！\n");
        return 1;
    }

    if (room->type == STAIRS_DOWN) {
        if (current_floor >= NUM_FLOORS - 1) {
            printf("這裡已經是最底層了。\n");
            return 1;
        }
        printf("你踏上向下的石階，冷風撲面而來……\n");
        descend_floor();
        return 1;
    }

    if (room->type == STAIRS_UP) {
        if (current_floor <= 0) {
            printf("這裡已經是最上層了。\n");
            return 1;
        }
        printf("你沿石階向上攀爬，光線漸漸明亮……\n");
        ascend_floor();
        return 1;
    }

    if (room->type == BOSS_GATE) {
        if (current_floor != 2) {
            printf("這裡沒有 BOSS 入口。\n");
            return 1;
        }
        if (!confirm_boss_entry()) {
            printf("你深吸一口氣，決定再準備一下再進入。\n");
            return 1;
        }
        printf("你用力推開石門，暗紅光芒撲面而來……\n");
        enter_boss_floor();
        return 1;
    }

    printf("這裡沒有可以進入的通道。\n");
    return 1;
}

static int try_move(int nx, int ny)
{
    struct Room *current = cur_room();
    struct Room *target;

    if (current->has_monster) {
        printf("怪物擋住了去路！你必須先打倒它才能離開！\n");
        return 1;
    }

    if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) {
        printf("前方是地圖邊界，無法繼續前進！\n");
        return 1;
    }

    target = &floors[current_floor][ny][nx];

    if (target->type == WALL) {
        wall_known[current_floor][ny][nx] = 1;
        printf("前方是崩塌的巨石，無法通行！\n");
        return 1;
    }

    player.x = nx;
    player.y = ny;
    on_enter_room();
    return 1;
}

static int cmd_kill(void)
{
    struct Room *room = cur_room();
    int monster_damage;
    int actual_damage;

    if (!room->has_monster) {
        printf("這裡沒有怪物可以攻擊。\n");
        return 1;
    }

    room->monster_hp -= player.atk;
    printf("你揮動【%s】斬向【%s】，造成 %d 點傷害！\n",
           player.weapon, room->monster_name, player.atk);

    if (room->monster_hp <= 0) {
        if (room->is_boss) {
            game_won = 1;
            printf("\n【%s】發出震天怒吼，轟然倒地！\n", room->monster_name);
            room->has_monster = 0;
            room->monster_hp = 0;
            room->monster_name[0] = '\0';
            print_victory();
            return 0;
        }

        printf("【%s】倒下了！道路暢通，你可以離開了。\n", room->monster_name);
        room->has_monster = 0;
        room->monster_hp = 0;
        room->monster_name[0] = '\0';
        return 1;
    }

    printf("【%s】還活著！（剩餘 HP: %d）\n", room->monster_name, room->monster_hp);

    if (room->is_boss) {
        monster_damage = rand_range(16, 24);
    } else {
        monster_damage = rand_range(5, 15);
    }

    actual_damage = monster_damage - player.def;
    if (actual_damage < 1) {
        actual_damage = 1;
    }

    player.hp -= actual_damage;

    if (room->is_boss) {
        printf("【%s】揮舞巨爪反擊，造成 %d 點傷害！（HP: %d）\n",
               room->monster_name, actual_damage, player.hp);
    } else {
        printf("【%s】反擊，造成 %d 點傷害！（【%s】抵銷部分傷害，HP: %d）\n",
               room->monster_name, actual_damage, player.armor, player.hp);
    }

    if (player.hp <= 0) {
        player.hp = 0;
        if (room->is_boss) {
            printf("\n魔王的力量壓倒了你的意志……你在最終決戰中倒下了。\n");
            printf("提示：穿上第一層寶箱裝備，並在第二層拾取道具後再挑戰！\n");
        } else {
            printf("\n你已力竭倒下，冒險結束...\n");
        }
        return 0;
    }

    return 1;
}

static void print_welcome(void)
{
    printf("========================================\n");
    printf("     歡迎來到四層地牢 MUD 冒險\n");
    printf("========================================\n");
    printf("操作說明：\n");
#ifdef _WIN32
    printf("  方向鍵  - 移動\n");
#else
    printf("  W/A/S/D - 移動\n");
#endif
    printf("  L - 觀察   K - 攻擊   M - 地圖   I - 進入樓梯\n");
    printf("  E - 使用回血道具（+%d HP）  H - 休息回血   Q - 離開\n", POTION_HEAL);
    printf("----------------------------------------\n");
    printf("第一層：起點與寶箱，邊緣有下樓梯 (v)\n");
    printf("第二層：可按 I 上樓或下樓，地圖中有回血道具 (+)\n");
    printf("第三層：邊緣 BOSS 入口 (B)，按 I 進入第四層決戰\n");
    printf("第四層：BOSS 殿堂，打倒魔王通關！\n");
    printf("----------------------------------------\n\n");
}

#ifdef _WIN32
static int handle_arrow_key(int *running)
{
    int key = _getch();

    if (key == 224 || key == 0) {
        int arrow = _getch();

        switch (arrow) {
        case 72: return try_move(player.x, player.y - 1);
        case 80: return try_move(player.x, player.y + 1);
        case 75: return try_move(player.x - 1, player.y);
        case 77: return try_move(player.x + 1, player.y);
        default: break;
        }
        return *running;
    }

    switch (tolower(key)) {
    case 'l': cmd_look(); break;
    case 'k': *running = cmd_kill(); break;
    case 'm': print_map(); break;
    case 'i': cmd_enter(); break;
    case 'e': *running = use_potion(); break;
    case 'h': rest_heal(); break;
    case 'q':
        printf("感謝遊玩，再見！\n");
        *running = 0;
        break;
    default:
        printf("未知按鍵。方向鍵移動，L/K/M/I/E/H/Q 為其他指令。\n");
        break;
    }

    return *running;
}
#else
static int handle_key_input(int *running)
{
    int c;

    printf("按鍵: ");
    fflush(stdout);

    c = getchar();
    while (c == '\n' || c == '\r') {
        c = getchar();
    }

    if (c == 27 && getchar() == '[') {
        switch (getchar()) {
        case 'A': return try_move(player.x, player.y - 1);
        case 'B': return try_move(player.x, player.y + 1);
        case 'C': return try_move(player.x + 1, player.y);
        case 'D': return try_move(player.x - 1, player.y);
        default: break;
        }
        return *running;
    }

    switch (tolower(c)) {
    case 'w': return try_move(player.x, player.y - 1);
    case 's': return try_move(player.x, player.y + 1);
    case 'a': return try_move(player.x - 1, player.y);
    case 'd': return try_move(player.x + 1, player.y);
    case 'l': cmd_look(); break;
    case 'k': *running = cmd_kill(); break;
    case 'm': print_map(); break;
    case 'i': cmd_enter(); break;
    case 'e': *running = use_potion(); break;
    case 'h': rest_heal(); break;
    case 'q':
        printf("感謝遊玩，再見！\n");
        *running = 0;
        break;
    default: printf("未知按鍵。\n"); break;
    }

    return *running;
}
#endif

int main(void)
{
    int running = 1;

    srand((unsigned int)time(NULL));

    init_world();
    init_player();
    print_welcome();

    printf("你的冒險從第一層起始營地開始！\n");
    cmd_look();
    print_status_bar();

    while (running && player.hp > 0 && !game_won) {
        printf("\n等待輸入... ");
        fflush(stdout);

#ifdef _WIN32
        running = handle_arrow_key(&running);
#else
        running = handle_key_input(&running);
#endif
    }

    return 0;
}
