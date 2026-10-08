# 植物大战僵尸 · 白天 1-3

参考 [pypvz](https://github.com/marblexu/PythonPlantsVsZombies) 复刻的冒险模式第三关「白天 1-3」。

## 玩法

- 5 行 9 列白天草地，初始阳光 50
- 可选植物：豌豆射手、向日葵、坚果墙、土豆地雷、樱桃炸弹
- 2 面旗帜（20 波），最后两波为大波僵尸
- 只有普通僵尸，消灭全部僵尸即获胜

## 操作

- 点击顶部卡片选中植物，再点击草地格子种植
- 点击天上掉落的阳光收集
- 点击铲子再点击植物可移除植物
- 蓝色卡面表示阳光不足，灰色蒙层表示冷却中

## 本地预览

直接用浏览器打开 `index.html` 即可游玩。

## 技术栈

基于 [NodeLoc 小程序](https://docs.nodeloc.com/miniprogram/introduction) webview 形态开发，分数由服务端种子回放验证。
