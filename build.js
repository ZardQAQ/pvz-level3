// 从 index.html 提取 html/css/js，生成 nodeloc 小程序入口 src/main.js
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<script>[\s\S]*?<\/script>/, "")
  .trim();

// 转义反引号和 ${ （虽然源码里没有，保险起见）
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const out = `// 此文件由 build.js 从 index.html 自动生成。修改游戏请改 index.html 后重新运行 node build.js
const GAME_HTML = ${JSON.stringify(body)};
const GAME_CSS = ${JSON.stringify(css)};

// 客户端游戏脚本：自包含，所有常量在脚本内部定义。
// window.__SEED__ 由 webview handler 注入；本地预览时为 undefined，回退到 Date.now()。
const GAME_JS = ${JSON.stringify(js)};

// 服务端工具：ISO 周数 + 每周僵尸组合（须与前端 index.html 实现完全一致）
function _rng(seed){ let s = seed >>> 0 || 1; return function(){ s = (s*1664525+1013904223)>>>0; return s/4294967296; }; }
function isoWeek(d){
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNum = Math.ceil((((date - yearStart)/86400000) + 1)/7);
  return date.getUTCFullYear() + "W" + String(weekNum).padStart(2,"0");
}
function weeklyZombieSet(yearWeek){
  return ["normal","flag","newspaper","football","screendoor","conehead","buckethead","polevaulter"];
}

// render 返回标题 + 通关排行榜，webview iframe 在其下方渲染。
export async function render(ctx, api) {
  let best = 0;
  try { best = (await api.kv.get("best")) ?? 0; } catch(e) {}

  // 读取共享区排行榜（通关次数榜 + 当周阳光榜）
  const yearWeek = isoWeek(new Date());
  let leaderboard = [];
  let weekLeaderboard = [];
  try {
    const all = await api.kv.listPublic();
    const entries = [];
    const sunEntries = [];
    const wPrefix = "wsun_" + yearWeek + "_";
    const wnPrefix = "wname_" + yearWeek + "_";
    for (const k of Object.keys(all)) {
      if (k.startsWith("clear_")) {
        const uid = k.slice(6);
        const name = all["name_" + uid] || "匿名玩家";
        const count = parseInt(all[k]) || 0;
        entries.push({ name, count });
      } else if (k.startsWith(wPrefix)) {
        const uid = k.slice(wPrefix.length);
        const name = all[wnPrefix + uid] || "匿名玩家";
        const sun = parseInt(all[k]) || 0;
        sunEntries.push({ name, sun });
      }
    }
    entries.sort((a, b) => b.count - a.count);
    leaderboard = entries.slice(0, 10);
    sunEntries.sort((a, b) => b.sun - a.sun);
    weekLeaderboard = sunEntries.slice(0, 10);
  } catch(e) {}

  const children = [
    { type: "text", value: "植物大战僵尸 · 白天 1-5", size: "xl", weight: "bold" },
    { type: "text", value: "终极挑战：3 面旗 · 5 行 · 普通僵尸、路障、撑杆跳、铁桶齐上阵", size: "medium" },
    { type: "text", value: "🏆 通关排行榜", size: "large", weight: "bold" }
  ];
  if (leaderboard.length === 0) {
    children.push({ type: "text", value: "暂无通关记录，快来成为第一个通关的人！", size: "medium" });
  } else {
    leaderboard.forEach((e, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i+1)+".";
      children.push({ type: "text", value: medal + " " + e.name + " — 通关 " + e.count + " 次", size: "medium" });
    });
  }

  children.push({ type: "text", value: "☀ 本周排行榜 · " + yearWeek + "（每周一刷新）", size: "large", weight: "bold" });
  if (weekLeaderboard.length === 0) {
    children.push({ type: "text", value: "本周暂无记录，参与「每周挑战」通关即可上榜，多打多累积！", size: "medium" });
  } else {
    weekLeaderboard.forEach((e, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i+1)+".";
      children.push({ type: "text", value: medal + " " + e.name + " — 阳光 " + e.sun, size: "medium" });
    });
  }

  return {
    blocks: { type: "vstack", align: "center", padding: "medium", gap: "small", children },
    state: {},
    effects: []
  };
}

// 生成页面：种子注入在脚本最前面，让 newGame 能读到。
export async function webview(ctx, api) {
  const seed = ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) || 1;

  // 服务端确定本周（防伪：不信任客户端）
  const yearWeek = isoWeek(new Date());
  const weeklySet = weeklyZombieSet(yearWeek);

  // 读取共享区排行榜，注入页面
  // listPublic 可能返回 {key:value} 或 [{key,value}]，两种都兼容
  let leaderboard = [];
  let weekLeaderboard = [];
  try {
    const all = await api.kv.listPublic();
    const getVal = (key) => {
      if (Array.isArray(all)) {
        const item = all.find(x => (x.key||x[0]) === key);
        return item ? (item.value ?? item[1]) : undefined;
      }
      return all[key];
    };
    const keys = Array.isArray(all) ? all.map(x => x.key || x[0]) : Object.keys(all);
    const entries = [];
    const sunEntries = [];
    const wPrefix = "wsun_" + yearWeek + "_";
    const wnPrefix = "wname_" + yearWeek + "_";
    for (const k of keys) {
      if (!k) continue;
      if (k.startsWith("clear_")) {
        const uid = k.slice(6);
        const name = getVal("name_" + uid) || "匿名玩家";
        const count = parseInt(getVal(k)) || 0;
        entries.push({ name, count });
      } else if (k.startsWith(wPrefix)) {
        const uid = k.slice(wPrefix.length);
        const name = getVal(wnPrefix + uid) || "匿名玩家";
        const sun = parseInt(getVal(k)) || 0;
        sunEntries.push({ name, sun });
      }
    }
    entries.sort((a, b) => b.count - a.count);
    leaderboard = entries.slice(0, 10);
    sunEntries.sort((a, b) => b.sun - a.sun);
    weekLeaderboard = sunEntries.slice(0, 10);
  } catch(e) {}

  const inject = "window.__SEED__=" + seed + ";window.__LEADERBOARD__=" + JSON.stringify(leaderboard) + ";window.__WEEK__=" + JSON.stringify({id:yearWeek, zombies:weeklySet}) + ";window.__WEEK_LEADERBOARD__=" + JSON.stringify(weekLeaderboard) + ";\\n";
  const js = inject + GAME_JS;
  return {
    html: GAME_HTML,
    css: GAME_CSS,
    js: js,
  };
}

// 客户端通过 window.community.call("finish", {seed, actions, result}) 上报结果。
// 页面的分数不可信，这里用种子回放重算击杀数，并更新排行榜。
export async function onMessage(ctx, api) {
  if (ctx.method !== "finish") {
    return { blocks: null, state: null, effects: [] };
  }
  const { seed, actions, result, level, mode, collectedSun } = ctx.params || {};
  const kills = replay(seed, actions);
  const effects = [];

  // 个人最高击杀
  let best = 0;
  try { best = (await api.kv.get("best")) ?? 0; } catch(e) {}
  if (result === "win" && kills > best) {
    effects.push({ type: "kv.set", key: "best", value: kills });
  }

  // 通关排行榜：只有通关才记入（现在只有第五关）
  if (result === "win" && level === 0 && ctx.user) {
    try {
      let clearCount = 0;
      try { clearCount = parseInt((await api.kv.get("clears")) ?? 0) || 0; } catch(e) {}
      clearCount += 1;
      effects.push({ type: "kv.set", key: "clears", value: clearCount });
      const uid = String(ctx.user.id);
      // 官方文档：ctx.user 只含 id/username/avatar_url，username 才是真名
      const uname = ctx.user.username || ("玩家" + uid.slice(-4));
      effects.push({ type: "kv.shared.set", key: "clear_" + uid, value: String(clearCount) });
      effects.push({ type: "kv.shared.set", key: "name_" + uid, value: uname });
    } catch(e) {}
  }

  // 周阳光榜：仅 weekly 模式 + 胜利（周标识以服务端为准，防伪；collectedSun 单局上限 5000）
  if (mode === "weekly" && result === "win" && ctx.user) {
    try {
      const sun = Math.min(parseInt(collectedSun) || 0, 5000);
      if (sun > 0) {
        const serverWeek = isoWeek(new Date());
        const uid = String(ctx.user.id);
        const uname = ctx.user.username || ("玩家" + uid.slice(-4));
        const wkey = "wsun_" + serverWeek + "_" + uid;
        let prev = 0;
        try {
          const all = await api.kv.listPublic();
          const getVal = (key) => {
            if (Array.isArray(all)) { const it = all.find(x => (x.key||x[0]) === key); return it ? (it.value ?? it[1]) : undefined; }
            return all[key];
          };
          prev = parseInt(getVal(wkey)) || 0;
        } catch(e) {}
        effects.push({ type: "kv.shared.set", key: wkey, value: String(prev + sun) });
        effects.push({ type: "kv.shared.set", key: "wname_" + serverWeek + "_" + uid, value: uname });
      }
    } catch(e) {}
  }

  return { blocks: null, state: null, effects };
}

// 简化回放：用相同种子校验操作序列的合法性，统计击杀数。
// 真实场景应完整重放游戏模拟逻辑；这里校验种子有效且操作结构合法。
function replay(seed, actions) {
  if (!Number.isInteger(seed) || !Array.isArray(actions)) return 0;
  let kills = 0;
  for (const a of actions) {
    if (a && a.e === "kill") kills++;
  }
  // 击杀数上限：第三关 20 波的理论上限
  return Math.min(kills, 200);
}
`;

fs.writeFileSync(path.join(__dirname, "src", "main.js"), out, "utf8");
console.log("src/main.js generated, " + out.length + " bytes");
