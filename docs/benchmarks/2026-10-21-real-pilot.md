# 真实试跑：两题、四种方式、八次首稿

> **2026-10-22 配置缺陷更正：这轮不能代表 Archify 当前推荐用法。** 实跑提示词强制 `schema_version:1`，workflow 因而使用旧 `fixed-v1`；当前[编写契约](../../archify/references/authoring-contract.md#workflow)要求新 workflow 使用 `readable-v2`（schema v2）。模型没有读取完整 Skill，也没有获得诊断后修复机会。下面的请求、分数和失败均真实保留，但只描述旧配置的单次首稿，不能据此评判当前 Archify 对 Mermaid/HTML 的总体竞争力。尚未实测正确配置，不能预言改用 v2 就一定成功。

同一个 `deepseek-flash` 实际生成，未人工修图、未选择性重跑。两题平均后的自动成绩如下；所有分数为 0–100，越高越好。人评未填写，综合分保持未完成。

| 方法 | 内容 C | 布局 L | 速度 T | 成本 K | 自动分 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Archify | 50.0 | 47.4 | 50.0 | 50.0 | **49.4** |
| 直接 Mermaid | 100.0 | 100.0 | 100.0 | 100.0 | **100.0** |
| 直接 SVG | 92.5 | 93.0 | 50.0 | 50.0 | **82.6** |
| 直接 HTML | 100.0 | 100.0 | 100.0 | 100.0 | **100.0** |

自动分 = `(45C + 20L + 10T + 10K) / 85`，沿用事前冻结的 `diagram-quality-score-v1-pilot-20261021`，未依据结果调权重或阈值。

## 哪些地方真正扣了分

| 题目 | Archify | Mermaid | SVG | HTML |
| --- | ---: | ---: | ---: | ---: |
| 售票网关 architecture-01 | 98.8 | 100.0 | 65.2 | 100.0 |
| 权限审核 workflow-01 | 0.0 | 100.0 | 100.0 | 100.0 |

- **Archify 流程题未交付**：模型把分支放在同一 lane/column，原生校验报告 `workflow/column-capacity`，Review 与 Grant 在 fixed-v1 布局重叠 12px。保留源码、诊断和零分，没有绕过校验或补图。
- **SVG 售票题连错边**：availability 从 Seat Store 返回 Gateway，题目要求回到 Ticket API。节点正确，四条关系中三条正确，内容分为 85；正确交付门槛未满足，速度、成本分各为零。布局也按题目要求的关系槽位扣分，不能把这个扣分解释成肉眼可见的遮挡。
- **Archify 售票题字号扣分**：内容正确；归一化后标签小于 12px。字号子分 79.2，其余三个布局子分约 100，布局 94.8、自动分 98.8。

满分表示满足这次自动评估及其阈值，不能读作美观满分。所有正确交付都低于 small 档 10 秒及 USD 0.01 的满分锚点，T/K 因此饱和。这次实验揭示了阈值在简单廉价任务上的区分能力不足；原始数值保留，后续校准需要新评分版本和新实验。

## 真实用量和费用口径

以下是各方式**每题均值**，不是总消耗。Archify 的完整运行耗时包含失败；失败没有有效交付时间，不能用这个均值替代速度计分的交付耗时。

| 方法 | 完整运行毫秒/题 | tokens/题 | 按官方费率核算 USD/题 |
| --- | ---: | ---: | ---: |
| Archify | 1706.5 | 557 | 0.000183225 |
| 直接 Mermaid | 1464 | 327 | 0.000073350 |
| 直接 SVG | 2416 | 1122 | 0.000506700 |
| 直接 HTML | 2642 | 1190 | 0.000541650 |

八次正式调用共输入 2723、输出 3669，合计 **6392 tokens**；失败调用计入。依 response usage 中实际缓存命中、未命中及输出数，乘 [DeepSeek 官方非高峰 USD 费率](https://api-docs.deepseek.com/quick_start/pricing/)得 **USD 0.00260985**。使用每百万缓存输入 0.003、未缓存输入 0.15、输出 0.6 USD；未重复叠加推理 tokens。

本次余额查询的 CNY 差值为 0，未获得逐请求现金扣账。因此 K 使用的是实际 usage 对应的官方标准费率核算，**不能宣称账户实际扣除了上述美元金额**。余额不是零成本证据。之前 BUPT 连接探测不属于这八次正式调用。

## 这轮实际比较了什么

- 两题都来自公开开发语料，均为四个节点的简单静态矩形/箭头题。金标准仍是 `authored-provisional`。
- 模型别名 `deepseek-flash`，官方当日标注版本 `DeepSeek-V4.1-Flash-1017`；temperature 0.2，明确关闭 thinking，max_tokens 8192，无工具调用。每格只有一个候选。
- 相同任务要求，加各格式必要文档；文档计入输入用量。架构题按 Archify/Mermaid/SVG/HTML，流程题反序调用。
- 事前冻结每格预算：1 候选、180 秒、输入输出合计 16384 tokens、USD 0.10。八格均保留在计划和平均分母中。
- 耗时从请求 dispatch 到确定性渲染后的最终候选提交；离线评分时间不计入。不是流式首 token 时间。
- Archify 用原生 CLI；Mermaid 用精确 12.2.0 实际编译；SVG/HTML 从生成源码实际渲染。独立浏览器观测可见节点、文字、路线与箭头端点，不采信生成者拓扑 metadata。临时副本编辑标签并重载，证明可编辑性。
- 仅去掉完整外层 Markdown fence；不改内容、坐标或连接。四格式已在无关 Source→Target 样例完成预检后才开始正式调用。

这是**首稿生成 pilot**，不能外推完整 Agent 诊断/修复工作流、复杂图、其他模型或工具总体排名。没有真实人评、统计显著性、组件因果消融。两道小题足以展示端到端实测及真实失败，尚不足以建立正式排行榜。

后续比较必须先冻结新协议：各方法使用当前推荐配置和对应官方说明；所有方法获得同样的检查/修复机会及总预算，并同时保留首稿、最终交付两项结果。修复调用的 tokens、时间和费用都计入。应扩大共同题集并加入分支、回路、长标签和密集关系；人评补上以后才能衡量风格与美观。不能只补跑 Archify 或事后改权重，把旧失败改成成功。

## 结果在哪里，怎样复核

本机交付目录位于仓库旁的 `../deliverables/benchmark-real-pilot-20261021/`，不作为产品发布物或凭据存储：

- `actual-01/index.html`：中文总分、分项、逐题解释、七张实际图和一个失败卡片。
- `actual-01/architecture-comparison.png`：售票题四图对照；`all-generated-diagrams.png` 含全部八格。
- `actual-01/report/{scores.csv,scores.png,scorecard.json}`：同一计算结果的表格、图、未舍入数值。
- `actual-01/report/review.html`：七份真实可交付样图的匿名数字打分表；未填任何人评。
- `actual-01/runs/*/{request.json,response.json,source.*,run.json,receipt.json}`：实际请求正文、返回用量、原始源码、时间及验收；无认证 header。
- `actual-01/{protocol.json,experiment-plan.json,evaluator-source/}`：事前计划、身份及冻结评分器快照。并列标题的显示修复在实跑之后，不改变分数，快照保留实跑版本。
- `validation/{focused-tests.log,browser-e2e.json,report-desktop.png,report-mobile.png}`：本地验证证据；真实调用不在单元测试中重放。

机器可读的简要实测结果和身份见 [evidence/2026-10-21-real-pilot.json](evidence/2026-10-21-real-pilot.json)。完整源图留在本机交付目录，尚未上传或提 PR。

八个 response ID、请求参数、源码/产物 hash 和冻结评分器被独立复核；回执重新计分与保存的 scorecard 完全一致。浏览器 E2E 验证 8 格、7 图、8 份源码下载、7 份匿名人评项，桌面及 390px 宽页面无溢出/页面错误。

最终本地检查：10 个 benchmark 测试文件共 **121/121 通过、0 跳过**，`npm test` 核心 **19/19 通过、0 跳过**。外部核对脚本 `validation/audit-actual.mjs` 可离线验证请求、源码、图像 hash、用量合计和冻结评分器重算；不产生 API 调用。浏览器、临时编辑副本与测试目录已清理，保留正式结果、固定 Mermaid runtime 和验证日志。未运行远程 CI，未推送或提 PR。

代码改动仅在 benchmark 侧，复用既有计分/报告链路；通用自由 SVG/HTML 验收仍不推断拓扑。新增浏览器测试保护错误箭头、隐藏伪事实、遮挡、原样渲染、独立编辑及清理；纯账目测试保护缓存/输出不重复计费和缺测不填零。没有冻结具体自动布局坐标。Scoped test-value 与 simplify-codebase 复查保留了独立源码解析、实际渲染、可见观测三层：它们分别验证 authored intent、可交付性和肉眼可见事实，合并会失去独立验收依据；未发现值得额外扩展的重构。
