# Changelog

## 0.1.0-alpha.2 — 2026-11-11

只改分发产物，不改行为。

- `tools/`、`test/`、`.github/` 通过 `.gitattributes` 的 `export-ignore` 排除在 `github:` / npm 安装取的归档之外；`package.json` 的 `files` 同步去掉 `tools/*.mjs` 与 `test/*.mjs`。
- 起因：插件市场的静态能力扫描读的是安装产物，`tools/sync-holidays.mjs` 的 `node:fs` 与 `process.env` 被记成了插件自身的能力（`fs-read` / `fs-write` / `env`）。运行时本来就不碰这些，现在产物里也不含它们。
- README 增加「它碰什么（能力披露）」一节，写明运行时与维护脚本的边界。

## 0.1.0-alpha.1 — 2026-11-09

首个公开版本。

- 标题栏常驻一枚时段标签：现在是**高峰期**还是**半价期**，跨期不足 30 分钟时附倒计时。
- 判定按官方价目表的 off-peak 备注：北京时间周一至周五 `09:00–12:00`、`14:00–18:00` 为高峰，排除中国法定节假日；其余时间（含周末与节假日全天）半价。
- 节假日表放在仓库内的 `data/cn-holidays.json`，由 `tools/sync-holidays.mjs` 内联进 `client.js`；**未收录年份会在标签上显示 `⚠` 并在 tooltip 说明**，而不是静默地只按周末猜。
- 零运行时依赖、无 Host 调用、无网络请求：全部用浏览器时钟计算。
- 12 个时钟用例 + 节假日表一致性校验，CI 在 ubuntu/windows × node 22/24 上跑。
