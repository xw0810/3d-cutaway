# 3D 交互模型库（桌面应用）

把仓库 `pages/` 目录下的 15 个单文件 3D 页面收进一个可搜索、可分类的桌面应用：左侧抽屉是目录，
选中后在右侧直接加载原页面（页面本身不改动交互）。

## 为什么是 Electron

- 这台机器没有 Rust 工具链，Tauri 需要额外装 Rust；
- 这些页面依赖 WebGL2 + ES module importmap，Electron 自带 Chromium，渲染结果与录屏/浏览器一致；
  Tauri 走系统 WebView2，容易出现驱动差异。

产物：`dist/3D交互模型库-<平台>-<架构>/`（Windows 为免安装 exe，macOS 为 `.app`，Linux 为可直接运行的目录）。

## 关于「提取公共 JS」

页面之间**没有**共享的应用代码——每个 `.html` 的模块脚本都是独立实现。真正重复的只有 Three.js
运行时（原先 15 个页面各自从 unpkg 拉同一份 `three@0.160.0`）。

因此这里做的是：

1. 把 three 核心与页面实际 import 的 addon 收进 `vendor/`（一份，约 1.3 MB），
   `scripts/sync.mjs` 会扫描每个页面的 `three/addons/...` 引用并递归收集相对依赖；
2. 复制页面到 `app/pages/<分类>/` 时，只改写 importmap 的两条 URL，指向 `/vendor`；
   页面其余代码逐字保留。
3. 结果：**完全离线**，不再依赖 unpkg，体积也比 15 份重复依赖小得多。

应用外壳自己的共享代码在 `shell/`（目录、搜索、收纳、iframe 挂载）。

## 运行

```bash
cd app
npm install
npm start        # 同步目录 + 打开应用
npm run smoke    # 无头式自检：初始 → 搜索 → 切换 → 收起，截图到临时目录
npm run dist     # 只打当前平台（这台机器上是 Windows x64）到 ../dist/3D交互模型库-<平台>-<架构>/
npm run dist:all # 按 TARGETS 打全平台（Windows 上会跳过 macOS）到 ../dist/
```

`npm start` / `dist` / `dist:all` 前都会先跑 `npm run sync`。

`dist:all` 的平台矩阵在 `scripts/package.mjs` 的 `TARGETS` 里：`win32-x64`、`darwin-arm64`、
`darwin-x64`、`linux-x64`、`linux-arm64`。也可以单独指定：

```bash
node scripts/package.mjs --platform darwin --arch arm64
```

在 Windows 上，macOS 目标会被跳过（`.app` 里的符号链接需要管理员权限/开发者模式）；请在
macOS、Linux 或 WSL 里执行 darwin 目标，用 `--out` 指到 Linux 本地目录，再打成 zip 取回。

## 结构

```
app/
  main.js              主进程：0 端口的本地静态服务 + 窗口 + 菜单
  catalog.json         由 sync 生成：分类、标题、副标题、标签、强调色
  pages/<分类>/<slug>.html   由 ../pages/ 同步生成（importmap 已改指向 /vendor）
  vendor/              由 sync 生成：three.module.js + 需要的 addons
  shell/               应用外壳（index.html / styles.css / app.js）
  scripts/sync.mjs     目录 + 页面副本 + 依赖收敛
  scripts/package.mjs  @electron/packager
```

分类与元数据写在 `scripts/sync.mjs` 顶部的 `CATALOG`：新增页面时把文件加进去、填标题/副标题/标签/
强调色，再 `npm run sync` 即可。标签同时参与搜索（例如搜「耳蜗」会命中人耳）。

## 交互

- 搜索框：标题、副标题、标签、原标题全文匹配；`Ctrl K` 聚焦，`Esc` 清空。
- 键盘：`↑` `↓` 移动，`Enter` 打开。
- `Ctrl B` 或左上角箭头收起/展开抽屉；窗口宽度 < 1100 时选中模型会自动收起。
- 记住上次打开的模型、抽屉状态、各分类折叠状态（localStorage）。
- 右上角「重新载入」「全屏」。

## 说明

- 页面通过 `127.0.0.1` 的临时端口加载（importmap 与 iframe 同源都需要 http，不能用 file://）。
  端口随机，不对外开放。
- 外壳无 Node 权限（`contextIsolation` + `sandbox`），页面也不能打开新窗口或跳转到外部地址。
