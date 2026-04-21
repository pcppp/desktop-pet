# 可直接给代码模型的提示词

设计并实现一个可作为 Steam 上架候选原型的桌宠应用，技术方案使用 Electron + React + Vite，先交付最小可运行版本，再保留后续接入 Steamworks 的扩展点。

## 产品目标

- 应用是一个透明背景、始终置顶、可拖动的桌面宠物。
- 视觉风格参考“Claude 气质的小宠物”：温和、奶油色、拟人化、灵动，但正式上架版本必须避免直接使用 Anthropic/Claude 官方商标、Logo、受保护角色形象或容易构成侵权/混淆的素材。
- 第一期先做 MVP，不做复杂资产管线，不依赖后端服务，保证本地即可运行。

## 必做交互

1. 点击桌宠时触发动作和气泡反馈。
2. 当 Claude Code 的一次回复结束后触发庆祝或提醒动作。
3. 长时间不动时进入待机动作。
4. 右键桌宠时显示菜单，菜单中至少包含：
   - `Weekly Quota`
   - `5h Quota`
   - 手动触发一次回复完成动作
   - 退出应用

## 最小实现约束

- 使用 Electron + React + Vite。
- React 只负责渲染层，Electron 主进程负责窗口、托盘、菜单、事件桥接。
- 桌宠窗口需满足：
  - 透明背景
  - 无边框
  - 始终置顶
  - 可拖拽
  - 可右键弹菜单
- 动画可使用 CSS 动画完成。
- 形象先用原创占位角色，不使用任何受版权保护的 Claude 官方美术。

## Claude Code 事件桥接

- 不要假设存在稳定官方事件 API。
- 最小可运行方案使用本地文件事件总线，例如 `data/events.ndjson`。
- 提供一个脚本，例如 `node scripts/trigger-reply-finished.js`，向事件文件追加一条 `reply-finished` 事件。
- 桌宠主进程监听这个文件变化，一旦收到 `reply-finished` 就通知渲染层播放动作。

## 额度显示

- 最小版本不要依赖真实 Claude 服务端接口。
- 额度数据先从本地 `data/quota.json` 读取，结构至少包含：
  - `weekly.used`
  - `weekly.limit`
  - `fiveHour.used`
  - `fiveHour.limit`
  - `updatedAt`
- 右键菜单实时读取并显示上述额度。
- 再提供一个演示脚本，例如 `node scripts/update-quotas.js`，用于更新本地额度并触发 UI 刷新。

## 代码结构要求

- `src/main.js`：Electron 主进程、窗口、托盘、右键菜单、事件监听
- `src/preload.js`：安全桥
- `index.html`
- `src/ui/main.jsx`
- `src/ui/App.jsx`：动画状态切换、点击/待机逻辑
- `src/ui/styles.css`
- `scripts/trigger-reply-finished.js`
- `scripts/update-quotas.js`
- `data/quota.json`
- `README.md`

## 工程要求

- Node.js 20+。
- `package.json` 中至少提供：
  - `npm start`
  - `npm run build:ui`
  - `npm run trigger:reply`
  - `npm run quota:demo`
- README 要写清楚运行环境、启动方法、如何模拟 Claude Code 回复完成、如何更新额度。

## 输出要求

- 直接输出完整项目代码，不要只给伪代码。
- 保证 `npm install && npm start` 可以启动。
- 代码尽量少依赖，注释简洁。
- 如果某一部分因为官方 API 不公开而不能真实接入，必须明确写成“本地桥接占位实现”，不要伪装成官方接入。
