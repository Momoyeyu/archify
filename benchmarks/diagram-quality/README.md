# 绘图 Benchmark：一张 0–100 分成绩单

每个方法最终输出 **内容、布局、速度、成本、人评五个分数，以及加权总分**。所有分数都是 0–100，越高越好。中文成绩单、柱状图、CSV 和 JSON 使用同一份计算结果。

## 先看效果

[本次真实实验：完整成绩、柱状图、23张原图和人工评分](../../docs/benchmarks/2026-10-22-peer-results/README.md)。

最新实跑：[四题 × 六方式完整结果与真人评分](../../docs/benchmarks/2026-10-22-peer-rerun.md)。**24/24格自动计分完整**：Mermaid **100.0**、Next AI Draw.io MCP **99.9**、SVG **90.8**、Excalidraw MCP **85.0**、HTML **77.9**、Archify **74.1**。复用同一48次真实调用，修正验收器后并发重评，新增模型费用0。人评入口 `http://127.0.0.1:6388`，23图五项1–5分、自动保存、即时个人综合表与柱状图。

已有一轮真实 API 首稿对比：[两题 × 四种方式的结果与限制](../../docs/benchmarks/2026-10-21-real-pilot.md)。同一个 `deepseek-flash`、相同题目，每格只生成一次，保留失败；自动分为 Archify **49.4**、直接 Mermaid **100.0**、直接 SVG **82.6**、直接 HTML **100.0**。这不是正式工具排名，人评尚未进行。

**配置缺陷已确认（2026-10-22）：** 本轮 Archify 提示词强制 schema v1，使新 workflow 使用旧 fixed-v1，偏离当前文档要求的 readable-v2。原数据保留供审计，不能代表当前推荐用法。`executePilot` 留作原实验复现，不能直接沿用为公平比较的新协议。

在仓库根目录安装贡献指南中的测试依赖后，运行：

```sh
node benchmarks/diagram-quality/benchmark.mjs demo --output /tmp/archify-benchmark-demo
```

打开输出目录的 `index.html`。浏览器验收需要本机 Chrome，可加 `--chrome /absolute/path/chrome`。输出目录必须新建或为空。

这个命令包含两个明确分开的部分：

- **计分演示**：虚构 A/B 分项，演示综合分 90.2 / 82.5、表格和柱状图。这不是 Archify 的实测成绩。
- **真实离线样图**：实际渲染 architecture-02 和 workflow-01，独立检查内容与布局。不调用模型，所以生成时间、实际模型费用、人评及总分保持未测。可以打开匿名评分表体验五项打分。

## 总分怎么算

当前评分版本为 `diagram-quality-score-v1-pilot-20261021`，权重和阈值冻结在 [scoring.mjs](scoring.mjs)。它们是公开的试点政策，不是论文证明的最优权重。

| 分项 | 综合权重 | 含义与计算 |
| --- | ---: | --- |
| 内容 C | 45% | `100 × (0.4 × 节点 F1 + 0.6 × 有向关系 F1)`；没有关系的题只用节点分。名称、方向、条件及最终可见事实都参与匹配 |
| 布局 L | 20% | 遮挡、裁切、字号、路径四项等权平均；按必需节点、标签和边测量，连续扣分，避免细微字号问题清空整题 |
| 速度 T | 10% | 从 dispatch 到交付最终候选的实际生成耗时，按复杂度固定锚点线性缩放 |
| 成本 K | 10% | 实际模型调用费用 USD，按复杂度固定锚点线性缩放；同时保留原始 tokens |
| 人评 H | 15% | 可读性、层级、排版、风格、美观五项各打 1–5 分；`H = 25 × (平均分 − 1)` |

**综合分 = 0.45 C + 0.20 L + 0.10 T + 0.10 K + 0.15 H。**

无人参与的自动优化使用另一条固定轨道：**自动分 = (45 C + 20 L + 10 T + 10 K) / 85**。人工评分不会改变自动分。两种总分分别比较，不混排。

布局的字号分为 `100 × min(1, 有效字号 / 12px)`；遮挡按相交区域的并集占比扣分，裁切按可见比例扣分，路径按侵入无关节点或越界的长度占比扣分。必需对象缺失贡献零，分母由题目冻结；额外空白、删除难画节点或堆叠装饰节点不能稀释惩罚。明确声明且实际包含端点的合法父容器不作为路径障碍。逐对象扣分可在成绩单展开查看。

速度、费用的分数均为 `100 × clamp((bad − 实测值) / (bad − good), 0, 1)`：

| 复杂度 | 速度 good / bad | 费用 good / bad（USD） |
| --- | --- | --- |
| small | 10 / 60 秒 | 0.01 / 0.25 |
| medium | 30 / 180 秒 | 0.03 / 0.75 |
| large | 60 / 360 秒 | 0.06 / 1.50 |

只有内容完全正确、交付可编辑且预算合规的结果才能获得效率分。内容有错但已测量完整，T/K 为零；缺少实际账目则是未测，不能虚构费用或把验收器的运行时间算作生成时间。详细契约见[评分设计](../../docs/superpowers/specs/2026-10-21-benchmark-scorecard-redesign.md)。

## 跑自己的实验

CLI 接收外部 runner 保存的源码、产物和真实账目；它负责渲染/验收/计分，不调度模型，也不产生 provider usage。

实验配置示例（路径相对这个文件解析）：

```json
{
  "corpus": "/absolute/path/corpus.json",
  "entries": [
    {
      "taskId": "architecture-02",
      "source": "outputs/weather.json",
      "format": "archify",
      "run": "runs/weather.json"
    }
  ],
  "plannedRuns": [
    {"taskId":"architecture-02","arm":"Archify","model":"your-model","repeat":1}
  ]
}
```

```sh
node benchmarks/diagram-quality/benchmark.mjs run \
  --experiment /absolute/path/experiment.json \
  --output /absolute/path/results
```

Archify 可以省略 `artifact`，由本机 CLI 渲染；其他格式必须提供外部渲染后的 `artifact`。重新渲染保留原始源码 hash 和生成完成时间。`run` 也可直接填写记录对象。运行记录至少包含 `runId/taskId/arm/model/repeat/status/startedAt/completedAt`，以及预先约定的 `identity.budget`、真实 `usage`；候选历史使用有序 `candidates:[{submittedAt,artifactHash}]`。只记录最终候选时可由 `completedAt` 补建该候选，不会猜测更早的成功时间。

`usage` 可保存输入/输出 tokens 和实际 `costUsd`；多次调用应提供 `usage.calls`，包括失败重试、子 Agent 与缓存/推理 token 的包含关系。详尽校验规则见 [records.mjs](records.mjs)。不能把词数或估算费用当成真实计费。`timeout/no_candidate/provider_error` 可没有源码和产物，但仍须有有效的运行身份与时间记录。

每次运行输出：

| 文件 | 用途 |
| --- | --- |
| `index.html` | 中文总分、柱状图、五项分数、原始单位、逐题扣分及产物 |
| `scores.png` | 可直接放进对比图的静态柱状图（有 Chrome 时导出） |
| `scores.csv` | 与页面相同的显示数值，支持表格和绘图 |
| `scorecard.json` | 未舍入分数、固定权重、缺失原因和逐题数据 |
| `review.html` | 隐藏方法/模型/费用/自动分的数值评分表 |
| `receipts.jsonl`、`experiment-plan.json` | hash 绑定的验收证据与计划分母 |
| `weight-sensitivity.json` | 去掉一个分项及权重 ±20% 时的描述性敏感性 |

交付秒数、tokens、USD 的方法级汇总都是**先平均同题重复、再平均各题的每题均值**，不是总消耗；原始运行账目保留在回执中。`raw.deliveryDurationMs` 是速度分采用的最终候选提交耗时；`raw.durationMs` 是完整运行至结束的耗时，独立保留，避免把末尾的等待或离线验收误算进交付速度。已知失败留在分母，交付无效或内容完全未命中贡献零。计划内缺回执、几何未知或真实费用缺失会使相应总分显示“待完成”，不会悄悄重新分配权重。各方法必须使用相同题目集合；不同重复次数先在题内平均，不能通过多跑容易题提高排名。

有回执后可重新计分，无须重新渲染：

```sh
node benchmarks/diagram-quality/benchmark.mjs score \
  --results /absolute/path/results/receipts.jsonl \
  --manifest /absolute/path/results/experiment-plan.json \
  --output /absolute/path/rescored --track auto
```

自定义语料加 `--corpus`。`--machine true` 输出 JSON；`--score-only true` 只向 stdout 输出一个自动分，供 autodev 读取。后者要求一个完整方法、内容全对且无已知失败；使用 `--baseline /absolute/path/scorecard.json` 时还要保持同一工作负载、身份、已有内容分和已正确事实。不能用缺测或丢事实换取 keep。

## 人只需打分，不必写报告

打开 `review.html`，填写稳定的评审标识，确认独立评审，对五项选择 1–5 分，下载 JSON。文字意见和语义判断均为可选。页面以固定 seed 随机排列样图，预览只显示裁剪后的图，不显示工具页头；图本身的风格仍可能透露工具。

每个可交付产物至少需要两名不同的独立评审，并使用相同 rubric。合并下载文件中的 `reviews` 数组后导入：

```sh
node benchmarks/diagram-quality/benchmark.mjs score \
  --results /absolute/path/results/receipts.jsonl \
  --manifest /absolute/path/results/experiment-plan.json \
  --reviews /absolute/path/combined-reviews.json \
  --track full --output /absolute/path/reviewed-results
```

评分绑定 `taskId/artifactHash/reviewerId/rubricVersion`；更换图片不能沿用旧评分。缺评不是零，单人评分不会被当作完整综合分。已知未交付任务贡献零，无须让人对空图打分。合成评审只能用于测试，不能作为真实人评结论。

## 语料、参考与支持边界

[corpus.json](corpus.json) 有 40 个公开试点任务：architecture/workflow/sequence/dataflow/lifecycle 各 6 题，以及 erd/class/tree/timeline/waterfall 各 2 题。它们均为 `authored-provisional`，独立人工金标准核定和阈值校准尚未完成；公开 `holdout` 已用于开发，不能声称对优化 Agent 隔离。计分可以展示，正式泛化/领先结论仍需真实共同题集实验。

| 格式 | 已有能力 | 当前边界 |
| --- | --- | --- |
| Archify | 原生节点/边提取、浏览器观测、独立 reload/edit/render | sequence 顺序及扩展类型事实尚无完整验收，保持 unverified |
| Mermaid | 简单 flowchart/graph 的明确节点与单条有向边；受限 pilot 支持实际渲染、可见拓扑和独立编辑验收 | subgraph、连续边、复杂语法未支持；通用 CLI 尚未接入 pilot 验收路径 |
| draw.io | 单页未压缩 mxGraphModel 的节点与有向边 | 压缩/多页/不明确方向及独立编辑验收未支持 |
| Excalidraw | 支持形状、绑定文字、单向绑定箭头 | 自由线等未支持；无独立编辑验收 |
| SVG / HTML | 通用验收提供可见几何；受限 pilot 从实际矩形、文字、箭头路线独立提取拓扑并编辑重载 | 只支持静态矩形节点、明示标签和局部三角箭头；自由源码或歧义保持 unverified，通用 CLI 不猜拓扑 |

第三方源码能提取不代表已经具备跨工具完整评测。正式比较应先冻结共同支持题集、模型/推理配置、Agent、工具/文档版本、预算与环境；实际编译、诊断、预览和等待都属于工作流。CLI 会拒绝混合身份、重复矩阵格和不一致配置。

受限实跑入口是 [pilot.mjs](pilot.mjs) 的 `executePilot`，固定 `architecture-01/workflow-01` 与四种格式，调用前保存计划。调用者在内存提供凭据、全新输出目录、Chrome 路径和外部 Mermaid runtime 根目录；runtime 使用精确 `mermaid@12.2.0`，不安装到用户的 Archify。该入口只允许本次选定的 DeepSeek 官方源及模型，计费表冻结于 2026-10-21 非高峰窗口，过期费率需要先重新核实。无须重新调用模型即可用已保存回执重算分数。

文献及方法溯源见[完整 v2 设计](../../docs/superpowers/specs/2026-10-21-benchmark-v2-design.md)与[研究核对](../../docs/benchmarks/2026-10-21-benchmark-audit.md)。论文启发、已有通行指标和本项目自行选择的公式/权重应分别披露。`ablate` 的删节点、反向边、遮挡、字号干预是评估器敏感性回放；`weight-sensitivity.json` 是评分权重分析，都不能冒充关闭工具组件后重跑模型的因果消融。真实组件消融与人评相关性仍需新实验。

## 兼容与验证

旧 `check/verify/review/ablate` 命令继续可用。`report --manifest PLAN --results JSONL --output FILE` 默认生成中文成绩单；加 `--legacy true` 可查看原 v2 证据报告。v1 suite 和历史分数保持原口径。回执 hash 用于检查一致性，不等于签名认证，应由受信 runner 保存并独立验收。

```sh
ARCHIFY_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  npm run test:focus -- test/diagram-quality-metrics.test.mjs \
  test/diagram-quality-records.test.mjs test/diagram-quality-cli.test.mjs \
  test/diagram-quality-e2e.test.mjs test/diagram-quality-scoring.test.mjs \
  test/diagram-quality-score-report.test.mjs test/diagram-quality-score-cli.test.mjs
npm test
```

E2E 使用手写样图，只检验本地链路；不是模型完成任务的实验。测试自动清理临时产物、编辑副本和 Chrome profile。保留新版 demo 可设 `ARCHIFY_SCORE_EXPORT=/absolute/path/review-demo`；这些静态样本不会变成真实模型实验结果。

受限 pilot 另有 `test/diagram-quality-{portable,pilot-render,pilot}.test.mjs`。真实 Mermaid 集成测试需要外部 runtime；用 `ARCHIFY_PILOT_RUNTIME_ROOT=/absolute/path/runtime` 指定，默认使用仓库旁交付目录。本次验收实际运行了 Chrome 和 Mermaid；测试不会调用模型。
