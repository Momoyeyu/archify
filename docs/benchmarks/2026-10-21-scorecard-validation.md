# 0–100 成绩单：实现与验收

本轮按用户批准的[评分契约](../superpowers/specs/2026-10-21-benchmark-scorecard-redesign.md)实现。阅读入口是中文成绩单与完整设计 PPT，工程测试数量不作为工具性能分数。

## 已实现的结果

- 每个方法输出 C/L/T/K/H 五项 0–100 分；综合权重 45/20/10/10/15。无人参与时使用固定自动轨道，前四项权重除以 85；两条轨道不混排。
- 原始未舍入值统一生成终端、中文 HTML、CSV、JSON 与 PNG。先平均题内重复，再平均各题，失败与计划缺失均保留分母；缺测不补零。
- 数值盲评表支持五项 1–5 分，评论与语义判断选填；产物至少需要两位不同独立评审，H=25×(平均分−1)。评分绑定题目/产物/rubric，变更图片不能沿用旧分。
- 速度主分使用 dispatch 至最终交付候选 submittedAt 的实测时间；raw.deliveryDurationMs 与完整运行 raw.durationMs 分开，方便复算。早期草稿的首次正确时间属于原有诊断项，不阻止多轮修图计分。
- `demo` 一次生成算术演示和独立的两张离线样图；`run` 接收真实外部 runner 的源码/产物/账目完成验收；`score` 支持离线重新计分与导入人评。CLI 不调用模型或填造 usage。

## 实际样图与计分演示

| 数据 | C | L | T / K / H | 总分 |
| --- | ---: | ---: | --- | --- |
| architecture-02，真实离线渲染 | 100.0 | 97.0 | 未测 | 未测 |
| workflow-01，真实离线渲染 | 100.0 | 99.0 | 未测 | 未测 |
| A，纯虚构算术示意 | 100.0 | 85.0 | 70 / 80 / 88 | 综合 90.2，自动 90.6 |
| B，纯虚构算术示意 | 100.0 | 65.0 | 80 / 75 / 60 | 综合 82.5，自动 86.5 |

离线真实样图的四个布局子分中，遮挡、裁切、路径均为 100；字号子分分别约 87.8、96.1。连续扣分能解释细微字号问题，不再清空整题。A/B 不绑定真实图的 artifact hash，不用于推断 Archify 的性能或审美优势。

## 验证

最终执行结果与源码内容摘要保存在 [验收记录](evidence/2026-10-21-scorecard-validation.json)。影响范围是独立 benchmark 的计分、记录、CLI 与报告；未改产品 renderer、validator、schema 或安装行为。

```sh
ARCHIFY_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  npm run test:focus -- test/diagram-quality-metrics.test.mjs \
  test/diagram-quality-records.test.mjs test/diagram-quality-cli.test.mjs \
  test/diagram-quality-e2e.test.mjs test/diagram-quality-scoring.test.mjs \
  test/diagram-quality-score-report.test.mjs test/diagram-quality-score-cli.test.mjs
npm test
npm run test:focus -- test/repair-rounds.test.mjs
```

真实 Chrome 路径覆盖渲染、可见事实、独立 reload/edit/render、原始源码 hash、完整计分导出，以及多候选修图的交付计时。独立进程回归覆盖实际 CLI，避免只导入 main 时遗漏 ESM 入口循环。单元测试以批准的 A/B 算术、1/3/5 人评锚点、遮挡面积及已知失败边界为独立期望，不用工程通过率代替 benchmark 成绩。

另用 Playwright 在真实 Chrome 中打开最终静态文件：两位模拟评审下载四份五项均为 4 的评分，实际调用独立 CLI 导入后 H=75，自动分保持未测，未伪造综合分。桌面与 360px 页面均检查；文档无横向溢出，图表/表格可在局部滚动。没有页面脚本异常。模拟评分只存在于临时目录，导入验证后删除，不进入交付的真实样图回执。

独立审查复现并修复：不同方法题集混排、合法端点祖先容器误扣路径分、离线重渲染覆盖完成时间、已有 HTML 掩盖无效源码，以及独立 CLI 的循环导入。最终速度口径又做了定向复查，保留最终内容、编辑交付与预算护栏。

## 仓库检查与兼容

按 `test-value` 保留纯计分边界测试、真实浏览器链路及独立进程入口三个不同层级；旧版记录和 v1 测试复用其有效输入，不锁死自动布局坐标。按 `simplify-codebase` 的 Focused Survey 追踪 CLI、导出、回执聚合和旧报告消费者：旧报告仍有显式兼容接口和测试，保留；验收函数抽到独立模块，入口 re-export 保持兼容并消除 ESM 循环；删除未使用的预打分覆盖入口，真实导出统一由绑定回执计分。未引入产品依赖或新的 provider runner。

## 交付与边界

中文 PPT 共 14 页（10 页主线、4 页附录），覆盖全部 benchmark 而非仅更新点；3 个原生图表、5 个原生表格可编辑。最终 PPTX 经过结构、布局、图表工作簿与导入检查，并逐页渲染验看；没有打开原生 PowerPoint/Google Slides 做兼容测试。可分享的 PPT、静态成绩单与可复现源保存在工作区外的同日 deliverables 目录。

语料仍是公开 authored-provisional 试点；sequence 顺序、扩展类型事实和第三方编辑验收仍有适配缺口。已有试点分可以解释和比较同配置的有效实验，不代表权重已经过人类偏好校准。权重敏感性导出与事实干预回放是计分器分析，不能冒充真实模型组件消融。

测试临时目录、编辑副本、Chrome profile 与 PPT 构建临时数据均清理；保留的只有明确交付文件及验证证据。没有调用真实模型、征集真实人评、更新 live Archify、推送或创建 PR。
