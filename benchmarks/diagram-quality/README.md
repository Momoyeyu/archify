# Diagram quality benchmark v2：公开试点

这是离线验收工具和公开试点语料。它检查结构化源、实际浏览器观测、运行账目及可选人评之间的一致性。设计依据见[完整设计](../../docs/superpowers/specs/2026-10-21-benchmark-v2-design.md)和[实现计划](../../docs/superpowers/plans/2026-10-21-benchmark-v2.md)。现有 v1 suite 与历史分数保持原口径。

**当前所有 40 题均为 `authored-provisional`，几何 profile 为 `calibrated:false`。** 事实由本实现阶段编写，尚未经独立人工核定；这些任务没有真实模型对照结果。该公开语料和当前阈值不能支撑正式工具排名、泛化结论或 autodev keep/rollback。名为 `holdout` 的公开分组只是预留的工作流分层，不能声称题目对优化 Agent 保密。

## 四个互补轨道

| 轨道 | 问题 | 本切片的边界 |
| --- | --- | --- |
| diagnostic-replay | 缺陷反馈是否正确、可执行，合法输入是否误拒 | 可复用既有诊断 suite；v2 控制性事实干预检验评估器敏感性，不代表完成反馈机制实验 |
| frozen-render | 冻结内容在给定显示条件下是否有已定义几何缺陷 | 浏览器观测实际文本、节点和路径，语义与几何分别出结果 |
| agent-generation | 同一模型和预算下，工具是否影响成功、时间和成本 | 接收外部 runner 保存的产物与账目；CLI 不调度模型、不调用 provider、不自动产生 usage |
| human-review | 读者理解、层级、风格和偏好如何 | 导入绑定 artifact hash 的可选评分；没有评分就保持缺失，不代填、不进入自动分数 |

正式对照需要预先固定共同支持子集、模型与推理配置、Agent、工具/文档版本、任务、预算及环境。工具原生编译、诊断和预览属于真实工作流，所有调用及等待均应记录。论文方法的自行重实现必须标明来源与实现边界。单个成功 demo 不代表完成跨工具实验。

## 语料及事实

[corpus.json](corpus.json) 的 `schemaVersion` 为 2，`publicPilot` 为 true。

| 类型 | small | medium | large | 总数 |
| --- | --- | --- | --- | --- |
| architecture | 2 | 2 | 2 | 6 |
| workflow | 2 | 2 | 2 | 6 |
| sequence | 2 | 2 | 2 | 6 |
| dataflow | 2 | 2 | 2 | 6 |
| lifecycle | 2 | 2 | 2 | 6 |
| erd / class / tree / timeline / waterfall | 每型两个扩展用例 | | | 10 |

30 个核心用例分为 development 15、calibration 5、holdout 10；另外 10 个用例使用 extension split。每题有独立 `family`，当前没有同一基础图改写跨 split 的安排。复杂度是作者暂定分层，包含节点/关系规模、分叉、反馈、长标签或往返消息，尚未经任务难度校准。

每题保存 `id/type/family/complexity/split/prompt/expected/goldStatus`。`expected.nodes` 使用稳定 id 和完整标签，关系明确方向与条件，`requiredLabels` 逐项保存必需可见文字。提示含具体场景和必需关系；金标准不给参考坐标。题目包括审批分支、重试循环、异步处理、数据汇合、状态回退及多参与者消息。

sequence 的 `orderedMessages` 记录逐项消息顺序。扩展用例的 `typedFacts` 分别保留列/PK/FK/基数、类成员/关系/多重性、树层级、日期/时间区间、跨度/数量/单位。当前语义评估器对这些额外要求返回 `unverified`。不能去掉这些事实后把普通图匹配分数当作该题完整正确性。

独立人工核定事实、校准 profile 和完善 adapter 后，应生成新版本及新 hash；不要在同一实验中悄悄改题或阈值。另建真正隔离的保留集，才可评估针对开发集优化后的泛化。

## 实际支持范围

| 输入格式 | 已实现的源提取 | 仍需保留未知的情形 |
| --- | --- | --- |
| Archify | architecture components/connections；workflow nodes/edges；dataflow nodes/flows；lifecycle states/transitions；sequence participants/messages；提取扩展集合 | 序列顺序和扩展类型事实尚无完整自动语义验收；不支持的要求不会得到完整通过 |
| Mermaid | 明确 `flowchart` 或 `graph` 方向；单个节点声明；单条 `-->`，可带 `\|label\|`；简单方形/圆角/菱形节点标签 | subgraph、多端点、连续边、其他图型、样式指令及复杂语法会标为 unverified |
| draw.io | 一个未压缩 mxGraphModel 的 mxCell 节点与有向边；XML 实体及 HTML 标签文字提取 | 压缩图、多页图、方向无法确定或无法绑定的端点 |
| Excalidraw | rectangle/ellipse/diamond、绑定文字及有绑定端点的单向 arrow | 自由线条、未绑定端点、双向/无向箭头、其他未支持元素 |
| SVG / HTML | 浏览器可以观测可见几何；自由源不建立可信拓扑 | 不能用隐藏 metadata 或生成者的声明补出已验证的源语义 |

解析成功只证明该源的受支持事实可提取。客观通过还需要最终实际可见事实、几何和可编辑交付的独立证据。浏览器当前主要绑定原生 SVG 的节点、文字和路径；它不是任意第三方网页/渲染器的通用识图器。第三方源 adapter 可提取并不意味着已完成该工具的渲染及编辑性验收。

可编辑性最低要求是结构化源能重新加载、局部修改标签并重新渲染，保留其他必需事实。当前独立 reload/edit/render probe 仅实现 Archify；其他格式缺少该证据时保持 unverified。位图或整图路径不能冒充可编辑结构源。

## CLI

从仓库根目录运行，Node 要求以仓库 package manifest 为准；先按根目录贡献指南安装测试依赖。浏览器验收需要本机 Chrome，可通过 `--chrome` 指定可执行文件。所有输出使用新文件路径，已有文件不会被覆盖。

```sh
node benchmarks/diagram-quality/benchmark.mjs check \
  --manifest benchmarks/diagram-quality/corpus.json

node benchmarks/diagram-quality/benchmark.mjs verify \
  --manifest benchmarks/diagram-quality/corpus.json \
  --task architecture-01 \
  --source /absolute/path/source.json \
  --format archify \
  --artifact /absolute/path/rendered.html \
  --run /absolute/path/run.json \
  --output /absolute/path/receipt.json \
  --chrome /absolute/path/chrome \
  --screenshot /absolute/path/screenshot.png

node benchmarks/diagram-quality/benchmark.mjs report \
  --manifest /absolute/path/experiment-plan.json \
  --results /absolute/path/receipts.jsonl \
  --output /absolute/path/report.html

node benchmarks/diagram-quality/benchmark.mjs review \
  --receipt /absolute/path/receipt.json \
  --review /absolute/path/review.json \
  --output /absolute/path/reviewed-receipt.json

node benchmarks/diagram-quality/benchmark.mjs ablate \
  --manifest benchmarks/diagram-quality/corpus.json \
  --receipt /absolute/path/receipt.json \
  --source /absolute/path/source.json \
  --format archify \
  --output /absolute/path/sensitivity.json
```

`check` 检查语料结构与覆盖，报告 pilot/optimization eligibility；它不渲染 40 题，也不代表确认金标准。`verify --task` 取语料中的任务 id。`--observation` 可以导入外部测量用于检查，但 CLI 将它标为 `external-unattested` 和 unverified，不能替代独立浏览器验收。最终产物/source hash 实际计算，若运行文件提供了不符 hash 则拒绝。

`run.json` 至少需包含真实的 `runId/taskId/arm/model/repeat`、ISO `startedAt/completedAt`、运行 `status`、有序 `candidates`；每个候选有 `submittedAt/artifactHash`，最后一个 hash 必须与实际产物匹配。`identity.budget` 保存预先约定预算，manifest/evaluator/profile hash 可由 verify 填入；显式提供不匹配的身份会被拒绝。完整使用量由 runner 填入 `usage.calls`。不能把示例时间或估计费用伪装成真实记录。详尽接收规则以 [records.mjs](records.mjs) 为准。

`report` 的 experiment-plan 与 corpus 是两个用途不同的文件。实验计划含 `identity`（manifestHash/evaluatorHash/profileHash/budget）和预声明 `plannedRuns`，每个矩阵格含 `taskId/arm/model/repeat`。results 是 JSONL，每行一个验收 receipt；没有回执的计划运行仍留在分母。不要直接把没有计划矩阵的 corpus 当 report manifest。

`ablate` 对已保存的源事实和实际观测作内存控制干预，包括删节点、反转边、隐藏、截字、缩字、重叠、等价平移与 10/12/14px 敏感性。它不会生成新的真实渲染产物或调用模型；配色控制保留相同几何。这是评估器敏感性回放，不能称为关闭工具反馈组件的因果实验或人类偏好实验。

## 语义与几何如何解释

节点按稳定语义 key、冻结别名及可选类型作一对一最大匹配。直接关系按有向端点和标签匹配，一条实际关系最多命中一次。重复标签、重复边不会重复获得语义 credit；反向、漏条件、必需文字截断和隐藏节点会失败。源中存在但最终不可见的事实不能通过。无法确定提取或出现尚不支持的要求时记 unverified。

geometry 独立接收真实节点/文本矩形、有效字号和实际路径采样点。试点 profile 为 1440×900 CSS viewport、DPR 1，将图按相同比例 contain 到 1280×720 区域。记录节点意外重叠、文字重叠、文字超出所属节点、无关边穿节点和裁切；字号候选阈值是 12 CSS px，两轴侵入容差是 0.5 CSS px。明确合法父子包含必须有独立显式关系，单纯矩形包住另一个矩形不会自动免责。

这些是可版本化的试点护栏，不等于通用美观标准。`calibrated:false` 仍可给出几何 pilot 结果，但不授权正式排名或自动优化。字形矩形与路径观测也不代表完成感知性审美、所有遮挡/对比度问题或任意 CSS clip/mask 的完备判断。边交叉或拐弯数量本身不构成审美优劣结论。

## 运行、时间与成本

预算内 objective success 需要通过语义、几何和可编辑交付证据；解释分量分别保留，不使用“漂亮但漏事实”的加权补偿。计划分母保留缺失运行、timeout 和 provider error。报告区分覆盖、客观已验证与人工已评，拒绝重复 runId、重复矩阵格、混合 manifest/evaluator/profile/budget 或不兼容模型配置。

首稿也是候选检查的一轮。timeToObjectiveSuccess 使用首个后来获得独立验收的候选提交时间，dispatch 起算；最终候选就绪、验收完成和最终响应不是同一时间。更早候选需要独立绑定的 receipt；自报 objectivePassed 不算成功，缺少早期证据时不能虚构 first-success 轮次/时刻。MRR 是全计划题的 success/k，未成功贡献 0；证据不足的修复效率必须披露。

usage 记录每次模型调用、失败重试和子 Agent，区分 input、output、cached input、reasoning 及其包含关系。缓存已经包含在输入、推理已经包含在输出时不能再相加。没有拿到账单或某字段时保留 null/partial，报告可观测量；不把词数、词法单位或工具运行时间称为 provider token/真实生成速度。成本需要对应 provider 定价快照与计费口径，setup/cold start 与正式运行另记。CLI 不会填造这些记录。

## 可选人工评估

默认 `human.status=not_requested`。导入 review 绑定 `artifactHash/taskId/reviewerId/rubricVersion`；更换产物后不能沿用旧评分。状态可为 requested、in_progress、completed、partial、skipped。completed 要求可交付产物、五个整数 1–5 分以及独立 `semantic.judgement=correct/incorrect/unverified`。

五项 ratings 字段是 `readability/hierarchy/layout/style/aesthetics`，分别评价阅读追踪、层级分组、排版平衡、风格区分和整体偏好。缺评不记零，部分评不伪装完成，人评分数始终不改变 objective score。当前工具保存并展示原始评分，不宣称已实施完整盲评、评审间一致性或统计功效充分。

正式人评应隐藏工具与模型名称、成本和自动分数；随机 A/B 顺序并保留 seed，允许平局和“两者都不可用”。风格可能泄露工具，需披露。建议至少两名独立评审，关键分歧引入第三名，保存分项原始评分与语义证据；作者自评只能作为非独立记录。样本足够后再做任务级配对汇总、一致性和聚类区间估计。

## 验证与后续工作

```sh
npm run test:focus -- test/diagram-quality-metrics.test.mjs \
  test/diagram-quality-records.test.mjs test/diagram-quality-cli.test.mjs
ARCHIFY_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  npm run test:focus -- test/diagram-quality-cli.test.mjs test/diagram-quality-e2e.test.mjs
npm test
```

这些检查保护已实现的契约；browser 路径的证据以实际 Chrome 执行为准。未运行、跳过或 unverified 不应写成通过。后续需独立核定全部事实、用合法和缺陷样本校准几何阈值、实现类型专属及第三方端点/可编辑性验收、固定真实实验环境，才适合扩大模型对照。当前语料与离线 demo 不构成真实 Agent 胜率、成本优势或审美优势证据。

E2E 使用手写 architecture-02 与 workflow-01 fixture 检验整个本地链路；不是模型完成题目的实验。默认删除全部测试目录、编辑副本和临时 Chrome profile。需要保留审阅样本时，可另设 `ARCHIFY_E2E_EXPORT=/absolute/path/review-demo`；它只保留静态报告、源、产物、截图和离线回执。公开 pilot 的 holdout 已用于开发检查，不能声称正式隔离评估。

报告按 arm/model 单独汇总；图型与复杂度分桶的分母来自 experiment-plan 每格的 `taskType/complexity`。缺 metadata 标为 unknown，不从成功回执猜测遗漏题的归属。必需 guard 失败时 optimization 返回 invalid（`eligible:false,score:null`）；objective 原始失败仍留在计划分母。v2 是离线证据契约，JSON 哈希绑定不等于签名认证；报告应来自受信 runner 和独立重新验收，不应把任意导入 JSON 当作防伪证明。
