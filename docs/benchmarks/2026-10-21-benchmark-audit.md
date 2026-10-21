# Archify benchmark 方法与证据审计

日期：2026-10-21。代码基线：`e49cfd2aff5bc9839332367b5b12c862a97c08ac`。

现有 repair-rounds 是有价值的诊断回归工具，但还不是全面的绘图 benchmark。它既没有测量真实 AI 的任务理解与 token 消耗，也没有建立不使用 Archify 的对照组。其指标不能独立证明语义正确、美观或端到端提速。扩展设计见 [benchmark v2 设计](../superpowers/specs/2026-10-21-benchmark-v2-design.md)。

## 原始需求与实际实现

- [#175](https://github.com/tt-a1i/archify/issues/175) 指向首稿探索、反复修复和晚暴露错误造成的时间开销，而不是单纯 renderer CPU。
- [#594](https://github.com/tt-a1i/archify/issues/594) 明确把首版限定为离线、确定性、不调模型的 repair rounds、诊断阶段和文本成本测量。
- [#634](https://github.com/tt-a1i/archify/pull/634) 实现该范围。当前 manifest 有 41 个用例、51 个注入缺陷、5 种图型。当前产品已有 10 种原生图型，首版不能代表全部产品覆盖。
- [#654](https://github.com/tt-a1i/archify/pull/654) 用该 suite 优化诊断。审查发现合法输入误拒、诊断丢信息、相同 message 的归因冲突和建议与验证不一致。
- [#670](https://github.com/tt-a1i/archify/issues/670)、[#672](https://github.com/tt-a1i/archify/pull/672)、[#707](https://github.com/tt-a1i/archify/pull/707) 增补代表性回归，但“每条建议都被逐项执行验证”仍不能由少数代表性契约测试替代。
- 当前 [real-repo-generation](../../benchmarks/real-repo-generation/README.md) 是有固定项目和会话留存要求的试点协议，状态仍是未运行；并非已有真实 AI 比较结果。

旧 `feat/repair-bench` 已恢复为历史分支。新版设计从当前 dev 建立在 `feat/benchmark-v2-design`，避免把已合入功能和过期目录结构重新带回。

## 论文是否真实存在 以及究竟借用了什么

可以核实论文和现有代码之间的方法对应关系；没有当时 DeepSeek 的完整调研记录，不能据此判定它是否真的读过论文，更不能推断其动机。以下把“存在相关论文”“借用了概念”和“复现了具体方法”分开。

| 原有引用 | 一手来源与原方法 | 现有代码对应 | 审计结论 |
| --- | --- | --- | --- |
| ConvCodeBench / ConvCodeWorld，ICLR 2025 | [论文 §4–5](https://proceedings.iclr.cc/paper_files/paper/2025/file/6091f2bb355e960600f62566ac0e2862-Paper-Conference.pdf)：固定历史反馈减少实时反馈生成；仍评价模型生成，报告 Recall 和 MRR，未解决题的 MRR 为 0 | 注入缺陷、调用 CLI、规则或 oracle 修复；没有模型生成，也未采用 MRR | 多轮反馈和低成本重放是合理启发；“论文静态 benchmark = 不调用模型的规则修复器”不成立。成功样本平均轮数还漏掉了原论文对失败样本的处理 |
| HAL，ICLR 2026 | [论文 §2–4](https://arxiv.org/html/2510.11977v1)、[官方说明](https://hal.cs.princeton.edu/about)：标准化环境、真实调用成本和轨迹、模型与 scaffold 的分离比较 | 保存 CLI 运行记录，使用固定词法计数；没有 provider usage 或完整 Agent trace | 可借鉴可复现和成本与正确性并报；没有证据支持把 Archify 特有的“首次报错 gate / 晚发现率”说成 HAL 的直接方法 |
| TALE，ACL 2025 Findings | [论文](https://aclanthology.org/2025.findings-acl.1274/)：按任务复杂度控制推理 token 预算，考察成本和准确性 | 正则拆分词、标点和空白，估算文档、候选和回执 | 成本意识属于概念关联；未实施 TALE 的预算控制，也没有采用 provider tokenizer。词法估计器是本项目的工程选择 |
| DiagramGenBenchmark，CVPR 2025 | [会议论文](https://openaccess.thecvf.com/content/CVPR2025/html/Wei_From_Words_to_Structured_Visuals_A_Benchmark_and_Framework_for_CVPR_2025_paper.html)、[可读预印本 §5.2、附录 D](https://arxiv.org/html/2411.11916v1)：生成、转换和编辑；代码与图像参考相似度；三位评审 1–5 分 | repair-rounds 未实施论文的代码、图像相似度或人评流程 | 任务领域相关；不能声称复现其评估体系。其人评混合了参考相似度、逻辑和视觉一致性，也不是独立审美量表 |
| GraphArena，ICLR 2025 | [会议来源](https://proceedings.iclr.cc/paper_files/paper/2025/hash/77fa8253adfc8b33209639f3e9985741-Abstract-Conference.html)：图计算任务及正确、次优、不可行、缺失的结果分类 | passed / stalled / silent / unreached 等分类 | 结果分类是可借鉴思路；图推理不是图的布局或审美，现有分类也是工程自定义 |

“晚发现率”“一轮披露率”、规则修复可执行率、必读文件集、词法 token 估计，以及 r5 的 `1000/500/1000/1` 加权公式，都应明确标为本项目设计。工程自定义并非错误，但必须通过有效性实验，而不能靠引用替代证明。

## 新一轮相关研究筛选

本轮针对程序生成的结构图、图表代码和评估方法定向检索，不是所有会议论文的穷尽综述。论文方法不以 GitHub stars 判断学术相关性；产品对照遵循用户指定的至少 1k stars。

| 研究 | 已核实来源与范围 | 对 Archify 的用途 | 不照搬的部分 |
| --- | --- | --- | --- |
| DiagramAgent / DiagramGenBenchmark，CVPR 2025 | 同上，正文评估和附录人评 | 生成与编辑分任务；独立比较编译反馈和完整性检查 | 参考代码 BLEU、像素相似度不适合作为跨 DSL 开放布局的主分数 |
| FlowGen，ICLR 2026 | [会议页](https://proceedings.iclr.cc/paper_files/paper/2026/hash/21b7e46991301ad2126c3e39384df6ed-Abstract-Conference.html)、[作者代码说明](https://github.com/nju-websoft/FlowGen)：可控制节点规模、分叉、密度、嵌套和渲染后端，主要测解析与 QA | 分层语料设计；同一语义图在不同后端的配对；严格与宽松结构匹配的区别 | 不能把解析模型的 QA/F1 当成生成器质量或美观性 |
| OmniDiagram，ACL 2026 Findings | [会议页](https://aclanthology.org/2026.findings-acl.809/)、[作者实现](https://github.com/Haoyue-Yang/OmniDiagram)：TikZ、Mermaid、PlantUML 的生成、转换和编辑；用针对渲染结果的问题做视觉反馈 | 内容需求问题化、可选视觉评审；有发布模型可作为不同模型的系统级对照 | VQA 奖励是模型判断，不能标成确定性客观真值；原模型对比不能归因于工具差异 |
| ChartMimic，ICLR 2025 | [会议页](https://proceedings.iclr.cc/paper_files/paper/2025/hash/42806406dd99e30c3796bc98b2670fa2-Abstract-Conference.html)、[论文 v2 §2.4](https://arxiv.org/html/2406.09961v2)：高层 judge 与代码执行追踪分开，低层比较 text/layout/type/color | 从最终运行产物取证，分离语义、布局和视觉评审；对 metric 做人评校准 | 图表复刻的参考颜色、子图位置相似度不是开放式架构图的“美” |
| DiagramEval，预印本 | [论文 §4–5](https://arxiv.org/html/2510.25761v1)：节点与路径对齐及与人评的相关性 | 拆开节点与关系的 precision/recall；主分数必须能解释错误 | 不宣称已核实顶会录用；仅可达性会掩盖直接边错误，不能替代有向直接边和条件的验证 |
| GGBench，CVPR 2026 | [会议页](https://openaccess.thecvf.com/content/CVPR2026/html/Wei_GGBench_A_Geometric_Generative_Reasoning_Benchmark_for_Unified_Multimodal_Models_CVPR_2026_paper.html)、[作者指标说明](https://github.com/OpenRaiser/GGBench)：几何构造的计划、执行和结果分开评价 | 支持“能执行 ≠ 构造正确”的多层评估原则 | 数学几何题域不是软件结构图；本轮只把已核实摘要和作者指标说明用于该原则 |
| Purchase，Graph Drawing 1997 | [作者机构记录](https://research.monash.edu/en/publications/which-aesthetic-has-the-greatest-effect-on-human-understanding/)：通过理解任务的时间与错误考察图形布局因素 | 边交叉等代理指标应与读图效果验证，而不是把越少拐弯直接等同越美 | 这是经典图绘制研究，不标成 AI 顶会；具体权重不能跨题域套用 |

SciFlow-Bench 的主要评价对象包含像素生成图，超出此次主要比较范围；不把它当作程序生成图的主对照。检索到的 MermaidBench 名称没有获得可独立核实的一手方法来源，本轮不据此设计指标。

## 现有每个 metric 的作用与盲区

| metric | 能支持的决策 | 不能支持的结论与风险 | v2 处理 |
| --- | --- | --- | --- |
| passed / stalled / exhausted | 哪些注入场景可收敛，修复器在哪里卡住 | CLI pass 不保证保留语义；只测五个示例的变异 | 保留为诊断子轨；外部成功率另外验证内容、几何与预算 |
| roundsToPass | 已成功用例修复步数 | 只统计成功者；放弃困难题可让平均轮数变好 | 主报告加全样本 success@budget、MRR 或成功率随轮数曲线，成功均值只作附属解释 |
| firstRoundDisclosureRate | 初次反馈暴露了多少注入错误 | 各类错误同权，语料分布主导结果；不能保证定位和建议正确 | 与定位、误报和建议执行结果一同分析，不单独优化 |
| firstSeenGate / lateDiscoveryRate | 哪类问题需要后段检查 | 真实字体与 viewport 错误就需要浏览器；提前静态拒绝可能误伤合法图；比例只以已检出缺陷为分母 | 记录阶段和实际修复增量成本，不奖励把测量移到不可靠早期 gate |
| silent / unreached / unattributed | 区分通过时没报、前序阻塞和不在白名单的诊断 | `attributeDiagnostics` 贪心匹配 code，缺少 subject/位置对应；换合法诊断码也可能影响统计 | 用缺陷身份与指针联合归因；保留未知；以独立检查验证缺陷是否仍在 |
| fullyDescribed / unactionableRepairs | 回执字段是否完整，当前规则能否使用 | evidence 非空可能只是无关键；规则正则匹配文案不等于真实 AI 可修复 | 做字段消融和逐步执行验证；真实性与信息保留是独立条件 |
| meanReceiptTokensPerRound | 固定文本计数口径下的回执体积 | 不是 provider token，均值受轮数分母影响；删必要信息也能下降 | 改称 lexical units，另报 bytes；仅作局部目标且受诊断功能护栏约束 |
| meanEstimatePerCase | 按固定阅读模型的上下文与输出体积 | 假定读过全部文件且只读一次，候选与回执没有聊天重放；缺推理、缓存、图片与真实 usage | 保留估计标签；实际成本只取完整会话 usage，缺失记 null |
| wallMs | 本机 CLI 总工作时间的观察 | 不含 AI 推理、反复读源码与队列，不能外推总耗时；失败快也可能显得更好 | 任务 wall time 与模型/工具工作总量分别报告，并保留失败 |
| r5 composite score | 固定权重下自动保留数值更高的候选 | 权重没有经验校准，重复奖励诊断变化，可能掩盖语义损失或视觉退化 | 不作为通用 Archify 总榜；每轮 autodev 固定一个相关目标，其余为有效性护栏 |

还有两个已复现的报告解释问题：`check` 在 manifest `evidence_eligible:false` 时报告 false，而完整 `report` 仅按覆盖完整度报告 true；该 true 只能解释成“矩阵齐全”，不是外部效度。`validate` 模式使用 `validate:render/check` gate 名称，late 集合仅含 `check/browser-check`，所以其 late=0 不能跨模式比较。

## 已执行的审计与消融

环境：macOS、Node v22.23.3，当前 dev 原样；没有调用生成模型或运行人工评审。原始记录与探针脚本保存在 `.autodev/runs/benchmark-review-20261021/`，核心结果副本见 [audit-summary.json](evidence/2026-10-21-audit-summary.json)。

### 历史分数项剔除

使用 r5 保存的同一 41 题 baseline、三次顺序优化与 verify 记录重新计算，不把历史顺序改动说成独立组件消融。

| 状态 | 通过数 | 成功者平均调用轮数 | 晚发现率 | 回执词法单位每轮 | 原分数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 22/41 | 2.0909 | 0.28 | 816.68 | 20903.32 |
| 候选排序与 top-3 | 22/41 | 2.0909 | 0.28 | 803.08 | 20916.92 |
| 删除 unavailable update 文本 | 22/41 | 2.0909 | 0.28 | 781.08 | 20938.92 |
| 删除重复 schema params 文本 | 22/41 | 2.0909 | 0.28 | 771.54 | 20948.46 |

逐题比对的通过、轮数与 disclosure 记录全部相同。去掉回执项，四者全为 21720；原分数全部收益来自文本缩短。回执词法体积下降 5.53%，估计总词法体积只下降 0.181%。这证明该轮缩小了回执，不能证明真实 API 成本、生成延迟或图形质量提高。

### 诊断字段干预

固定六个机制探针：缺 output、非法 type、超长 label、重复 ID、悬空端点和过大 viewBox。使用同一未修改 CLI 与规则修复器，唯一干预是交给修复器前删除某个诊断字段；最多八轮，只跑 validate。完整反馈六题均能通过，因此这是用来探测机制的有意选样，不是代表性总体成功率。

| 交给规则修复器的反馈 | validate 收敛 | 首轮诊断总词法单位 | 主要含义 |
| --- | ---: | ---: | --- |
| 全字段 | 6/6 | 1256 | 机制基线 |
| 去 subject | 2/6 | 1070 | 定位字段参与了四题的可执行修复 |
| 去 evidence | 3/6 | 836 | 结构化值信息参与了三题的修复 |
| 去 supportedFixes | 3/6 | 956 | 建议包含另外三题需要的修复参数 |
| 去 message | 5/6 | 1046 | 长标签规则仍依赖自然语言正则 |

删除字段使记录更短，却降低了规则修复结果。因此“回执越短越好”不成立。该试验没有测量真实 AI 对这些字段的利用，也不是字段的 Shapley 归因，字段之间存在互补。

完整反馈的长标签修复会截短输入 label，原 suite 仍记 passed。该合成测试没有独立的“必须完整保留该标签含义”判据，因此此例不能证明真实任务信息被正确保留。v2 必须把信息保留与几何通过分开验证。

### 当前完整 validate 子轨

suite check 41/41 无问题。rules 为 32/41 passed、9 stalled；oracle 为 37/41 passed、4 stalled。这些是 validate-only 结果，不与历史 finalize 的 22/41 作版本提升比较。该模式不测浏览器溢出，rules 的 13 个 silent 与 oracle 的 14 个 silent 包含这些有意未测的缺陷。

现存回执只保存 `evidenceKeys` 而非完整 evidence，不能直接用它重放所有字段消融；本次探针重新读取真实 CLI 全量回执，并保存每轮输入与原始回执。

## 真实 AI 收益目前有什么证据

[#654 的独立审查](https://github.com/tt-a1i/archify/pull/654#pullrequestreview-5392297327) 已报告八组真实 AI 小样本两边均 8/8，通过所用 finalize 总调用分别为 15 和 16；该样本没有观察到减少返工。后续 [合入审查](https://github.com/tt-a1i/archify/pull/654#pullrequestreview-5438294782) 也明确不宣称真实 AI 提速。

[#395](https://github.com/tt-a1i/archify/issues/395) 还给出了非成员节点被画进边界、原生检查仍通过的实例，适合成为“源数据合法但最终视觉语义错误”的独立反例。

这不否定更准确诊断的价值，但说明便宜的规则代理还需要用真实 Agent 校准。v2 的消融应同时问“字段/功能有什么作用”和“代理指标是否能预测真实结果”。

## 同类项目筛选

stars 为 2026-10-21 通过 GitHub API 读取的快照；它只是用户指定的入选门槛，不是质量分数。

| 项目 | stars | 比较层次与取舍 |
| --- | ---: | --- |
| [Next AI Draw.io](https://github.com/DayuanJiang/next-ai-draw-io) | 36,330 | 优先作为同一 Agent 的工具对照；MCP 有源码到图、编辑、截图与导出。若使用其自带生成应用，另列系统对照 |
| [官方 draw.io MCP](https://github.com/jgraph/drawio-mcp) | 5,674 | 优先工具对照；同一模型写 XML / 用官方绘图说明；固定本地格式与导出路径 |
| [官方 Excalidraw MCP](https://github.com/excalidraw/excalidraw-mcp) | 5,549 | 工具对照；先核实最终 scene 的保存和 SVG/截图导出边界，不能只记录交互预览成功 |
| [mingrammer/diagrams](https://github.com/mingrammer/diagrams) | 42,748 | 后端对照，主要覆盖云架构子集；由同一 Agent 生成 Python，不当作一个自带推理的 Agent 系统 |
| [D2](https://github.com/d2lang/d2) | 25,695 | DSL 与布局后端对照；固定开源布局引擎配置，不使用商业引擎混入结果。仓库已由 terrastruct/d2 转到 d2lang/d2 |
| [lgazo/drawio-mcp-server](https://github.com/lgazo/drawio-mcp-server) | 1,489 | 符合门槛，但先不加入首轮，避免与两个 draw.io 路径重复扩大实验矩阵 |

DiagramAgent 官方仓库只有 README 与 LICENSE，暂不把它当成可直接复现的完整系统；如依论文重新搭建，必须标明重实现。OmniDiagram 有模型与推理入口，但改变了底层模型，应列学术系统对照，不用于推断 Archify 的工具因果效应。两者只有十余 stars，保留其论文方法相关性，不把它们包装成符合 1k 门槛的热门项目。

这些项目本轮未安装或实际跑生成比较，不能根据功能说明给出胜负排名。
