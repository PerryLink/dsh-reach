# 分析 03 — 重建方向与开发方案（2026-09-03）

> 输入：pan17/dsh-wechat@0.7.2 + 19 处补丁（本包）、分析 01/02、30+ 竞品源码级调研
> （微信类 9 仓 / 多通道类 13 仓 / 推送与 Telegram 类 14 仓）。
> 本文是「彻底重开发」的方向定稿与分阶段方案；未经用户拍板的项见 §9 开放问题。

## 1. 结论速览

- **新方向**：从「微信第二客户端」升级为「**多渠道决策与远程控制层**」——
  任何工作区/会话的决策卡（审批/提问）推送到任意 IM（微信 P{n} 文本、飞书/Telegram
  按钮卡），在 IM 里直接拍板；同时保留完整会话控制台、主动任务与开放推送服务。
- **保住唯一差异**：跨会话整卡推送 + 编号直回是生态空白（调研实锤），是新插件的一号特性。
- **架构主线**：三层分离（channel-core 适配器契约 / harness 桥 / 渠道适配器），
  微信 iLink 适配器从 pan17 移植为第一适配器，飞书/Telegram 作为按钮卡验证通道。
- **命名候选**：`dsh-reach`（首选，触达之意）/ `dsh-omnirelay` / `dsh-chatlink`；
  npm/GitHub 可用性 Phase 0 实测。
- **不修旧壳**：19 处补丁只作行为规格（验收基准），代码从零重写；旧包保留为回滚参照。

## 2. 取长补短矩阵

### 2.1 我的长处（保留并强化）

| 能力 | 出处 | 新方案中的位置 |
|---|---|---|
| 跨会话整卡推送 + P{n} 编号直回 | 19 处补丁（生态唯一） | 一号特性，升级为稳定编号（见 §4.3） |
| 决策走原生 pending 表（谁先回复谁生效、审计/防双决原生） | pan17 架构 | 保持，绝不建第二审批引擎 |
| 微信 iLink 官方协议（无账号风险） | pan17 | 第一适配器；跟随 openclaw-weixin PR #161 修复 |
| ctx.commands 原生命令透传 | pan17 | 保留（wsz987 佐证该模式正确） |
| 断点续传（sync-buf + 会话映射持久化） | pan17 | 保留，扩展为 per-chat 状态文件 |
| 限流预算 + FIFO 队列（10 条/窗口） | pan17 | 保留，升级为可配 + per-channel 节流配额 |
| 静默模式 / busyEnter 同步 / 渠道提示词注入 | pan17 | 保留 |
| 317 单测 + 零运行时 @deepseek-ai 依赖（结构形状调用） | pan17 | 测试并入新套件；依赖策略见 §6.7 |

### 2.2 别人的长处（采纳，注明出处）

| 采纳项 | 出处 |
|---|---|
| 适配器契约：core 不写死平台、适配器禁调 ctx.agents、MessagePart 结构化、capabilities 协商、新渠道脚手架 | @wsz987/dsh-channels |
| 凭据进 DSH credentials，patch 只存 `*Ref` 引用；状态响应不回 secret | wsz987、xmanrui/dsh-im |
| 按钮卡审批（飞书交互卡 / Telegram 内联按钮 / QQ 按钮）+ 决策人回写 | ZhuoSir/dsh-chatops、jackControls/dsh-telegram-control、imetn/dsh-lark-bridge |
| 审批超时可配：回落 GUI / fail-closed | CMD128/dsh-wx-bridge、lanbaolu、dsh-msg-hub |
| 授权码二次确认 | CMD128 |
| 自然语言审批（LLM 兜底） | nicecx/dsh-relay |
| owner + 白名单 fail-closed + bootstrap 信任模式 + 审计日志 | chatops、lanbaolu、Jesse-njx |
| per-user/per-chat 会话隔离与队列隔离 | lanbaolu、zxz9988 |
| 冷会话列表 + 自动唤醒（sessionQuery + agents.resume，排除归档/子代理） | chatops、CMD128 |
| /model 树状浏览（关键词 / --vision/--ctx/--effort 筛选 / 翻页） | CMD128 |
| 会话级推送开关 + per-session override | CMD128、MHfire |
| 开放推送面：notifier/pushNotifier 服务 + HTTP 接口 + sent 事件 | THEWOLFWALKER/dsh-notifier、chicheng-push |
| cron 主动任务（chatId 绑定、时区/DST、落盘恢复、失败重试） | zhuiyueya/dsh-im-gateway、zxz9988 |
| 心跳/digest + 卡死告警 + 通知卡停止按钮 | dsh-notifier、Jesse-njx |
| 通知节流配额（防风控）+ 超时安抚文案 | lanbaolu |
| 入站附件内容提取（PDF/DOCX/XLSX） | wsz987 |
| Markdown→渠道排版 + (1/n) 分段 + 多段输入合并（`..`/`!!`） | zxz9988、lijian-ui、zhuiyueya |
| 流式呈现（飞书 PATCH 卡/钉钉 AI Card/QQ stream_messages/Telegram 编辑消息） | JMOKSZ、lijian-ui、xmanrui |
| 出站文件路径围栏 + symlink 逃逸拒绝 | chatops、imetn |
| 单例文件锁；24h 凭证体检 + -14 自动重扫码 | lijian-ui、gtaifu |
| 宿主契约断言（43 项）+ 上游漂移检查 + 凭据泄漏验证门禁 | moyu-good/dsh-lark-bridge、xmanrui |
| 双进程守护（可选形态） | lanbaolu |
| 群→Project、话题→Session 映射（v2 候选） | imetn |

### 2.3 我的短处（修复映射，含分析 01 的 7 条自评）

| 短处 | 修复 |
|---|---|
| 单用户裸奔 | §6.1：owner + 白名单 fail-closed + bootstrap 模式 + 审计 |
| P{n} 到达序漂移、内存 pushedCardRpcIds | §6.3：rpcId 短码 + delivered 集落盘 |
| 全局捕获规则劫持聊天 | §6.3：只捕获决策形态文本，其余放行当前会话 |
| 同会话多卡裸回复一锅端 | §6.3：多卡一律强制编号 |
| 出站三路事件无排序 | §6.4：per-user 有序出站队列 |
| 无送达确认 | §6.4：发送状态机 + 重试 + FIFO 兜底 |
| 补丁挂 dist、零补丁测试 | 代码从零重写；19 补丁行为成为回归测试规格 |
| botToken 落自家文件 | 凭据进 DSH credentials + `*Ref` 引用 |
| 30 分钟软超时一刀切 | 超时策略可配三档 |
| send_wechat 无围栏 | 出站文件围栏 + 目录白名单 |
| 仅微信、无按钮卡可能 | 多通道骨架；按钮卡走飞书/Telegram |
| iLink 重启后须先发消息 | 文档化 + 心跳提示 + 多通道替代路径 |

## 3. 产品定位（一句话）

> 任何工作区/会话在「需要做决定」时，把决策卡推到你在用的 IM；任何 IM 都是 DSH 的第二客户端。

- **一号场景**：跨会话决策直推直回（微信 P{n} 文本 / 飞书·Telegram 按钮卡）
- **二号场景**：手机总控台（会话/模型/preset/权限/安全线全命令面）
- **三号场景**：开放推送中台（定时任务、后台完成、心跳告警，第三方插件可消费）

## 4. 架构设计

```
        ┌───────────── channel-core ─────────────┐
        │  MessagePart 归一化 · ChannelAdapter 契约 │
        │  capabilities: text/image/file/card/      │
        │  streaming/typing/reactions · 分片/合并    │
        └──────────────────┬───────────────────────┘
        ┌───────────────────▼────────────────────────┐
        │ bridge（harness 半区，唯一可调 ctx 服务）      │
        │  chat↔session 路由 · approval/request 瀑布监听   │
        │  延迟应答（推卡→持有 promise→回复 resolve）       │
        │  稳定编号 · 决策形态捕获 · 审批超时策略          │
        │  per-user 有序出站队列 · 限流/FIFO · 审计       │
        │  开放推送服务 reach.notify() + HTTP + sent 事件 │
        │  cron 主动任务 · 心跳/digest · 文件围栏        │
        └──────────┬──────────────────┬────────────────┘
      ┌────────────▼────┐   ┌─────────▼─────────────┐
      │ adapter/weixin   │   │ adapter/feishu        │
      │ iLink 长轮询     │   │ WS 长连接 · 交互卡按钮  │
      │ (pan17 移植+PR161)│   │ (card.action.trigger) │
      └─────────────────┘   └───────────────────────┘
      ┌────────────┐   client（settings.section 每通道一卡 + 配对流）
      │ adapter/   │
      │ telegram   │   （内联按钮 · Rich Message 编辑）
      └────────────┘
```

**红线（学 wsz987）**：core 不做渠道特判；适配器禁调 ctx.agents/ctx.approval 等 harness
服务（只收/发 MessagePart）；平台 payload 必须映射为结构化 MessagePart；决策应答只经
bridge 的单一延迟应答出口。

**模块清单**：`core/`（契约+配置+凭据引用）、`bridge/`（路由/决策/出站/推送/审计）、
`adapters/{weixin,feishu,telegram}`、`tools/`（reach_send 等）、`client/`（设置页）、
`contract-tests/`（宿主契约断言 + 上游漂移检查）。

## 5. 功能规格 v1（P0/P1/P2）

| 优先级 | 功能 | 说明 |
|---|---|---|
| **P0** | 微信通道全量平价 | 移植 pan17 0.7.2 全部功能 + 19 补丁行为，作为回归基线 |
| **P0** | 稳定卡片编号 | `#ab12` rpcId 短码；delivered 集落盘；重启 replay 不重推不重编号 |
| **P0** | 收窄捕获规则 | 仅决策形态文本（`P{n}=`/`Q{n}=`、唯一单卡裸 1/2、/rp /rq）被捕获 |
| **P0** | 多卡强制编号 | 含同会话多卡；裸回复拦截并提示 |
| **P0** | 安全基线 | owner 配对（扫码//claim）+ 白名单 fail-closed + bootstrap 模式 + 审计日志 + 凭据 *Ref + 文件围栏 |
| **P1** | 审批超时三档 | 回落 GUI / fail-closed 拒绝 / 原生软超时，per-channel 可配 |
| **P1** | 授权码二次确认 | 可开关 |
| **P1** | 命令面扩展 | /sessions 冷唤醒（排除归档/子代理）、/use 绑定、/model 树浏览、/detail、/policy 安全线、/batch、/cron |
| **P1** | 开放推送服务 | `reach.notify()` + `/reach/api/push` + `reach/sent` 事件 + 节流配额 |
| **P1** | 心跳/digest + 卡死告警 | 可配间隔；通知卡带停止按钮 |
| **P2** | 飞书适配器 | 交互卡按钮审批 + 决策人回写 + 流式卡片（适配器契约的首个验证） |
| **P2** | Telegram 适配器 | 内联按钮审批 + 原消息编辑为结果 + 会话列表/恢复 |
| **P2** | 附件内容提取 | PDF/DOCX/XLSX 入站提取（学 wsz987） |
| **P2** | 自然语言审批 | LLM 兜底（默认关） |
| **P3** | 多用户信任集 | lanbaolu 式 per-user 隔离（v2） |
| **P3** | 群→Project、话题→Session | imetn 式映射（v2，等 iLink 群聊开放） |

## 6. 关键设计决策（D1–D10）

- **D1 决策注入唯一出口（官方契约修正版）**：审批/提问是**进程内 Cordis 瀑布事件**
  `approval/request` / `user-questions/request`（Agent 作用域过滤，返回值即决策：
  `allowed-once|rejected|cancelled|unavailable`，无人应答 fail-closed）。桥接插件以
  **延迟应答监听器**形态参与：收到请求 → 推卡 → 持有瀑布 promise → IM 回复后 resolve；
  超时按策略 `next()` 让出（回落 GUI）/ 返回 `rejected`（fail-closed）/ 继续等待（软超时）。
  GUI 走同一瀑布（经 API Gateway 的 forwarded-events 白名单，两事件均在其中）——
  「谁先返回谁生效」是瀑布原生语义，无需第二审批引擎。审计原生持久化
  （`approval/asked`+`approval/decided` 配对入会话日志）；`approval/policy='never'`
  时不推卡。**pan17 时代的 `apiProxy.events.mux/respond` 在本 checkout 已演进为
  Gateway 转发机制，新实现不再依赖旧名字。**
- **D2 稳定编号**：卡片推送带 rpcId 派生短码（`#ab12cd`），回复 `#ab12cd=1` 或 P{n}= 均可；
  delivered 集经 `ctx.storage` 落盘；重启 replay 只补发未投递卡。修分析 01 第 1/2 条。
- **D3 捕获规则收窄**：有卡 pending 时，仅「决策形态」文本被当决策；其余文本放行当前会话。
  修分析 01 第 1 条（聊天被劫持）。
- **D4 微信文本天花板**：iLink 无法承载按钮卡/CoT；微信端以 P{n} 文本为唯一决策形态并做到
  极致（稳定编号+防误操作+超时策略），按钮体验交给飞书/Telegram。这是渠道事实，不是妥协。
- **D5 超时策略可配**：per-channel `approval.timeout`（秒）与 `onTimeout: delegate|reject|soft`
  三档；默认 delegate（回落 GUI，学 CMD128），微信侧保留原 30min 软超时为第三档。
- **D6 安全默认**：白名单空 = 全部拒绝（fail-closed，学 Jesse-njx/omni-bridge）；
  首个扫码者为 owner；陌生消息只记审计不回复（可 notifyRejected）。
- **D7 出站有序队列**：assistant 文本 / 卡片 / 回执 / 工具推送汇流为 per-user 单一有序队列，
  统一走限流预算 + FIFO；发送状态机（queued→sent→delivered 尽力而为）。
- **D8 依赖策略（本工作区双基线原则 + 社区共识）**：peerDependencies 三元组
  `@deepseek-ai/cordis ^4.0.2` + `@deepseek-ai/dsh-tools >=0.1.0-rc.8 <0.2.0` +
  `@deepseek-ai/schemastery`（版本开工实测）——只钉已发布线、**scoped 单轨**
  （unscoped cordis 混用 = 双身份分裂）；devDeps 同钉；typecheck 经 tsconfig paths
  对照宿主 checkout（适配最新版）；运行时保持结构形状调用、零 @deepseek-ai 运行时依赖
  （继承 pan17 优势）；tsdown `external: [/@deepseek-ai\//]` 防误内联。
- **D9 微信适配器来源**：移植 pan17 `src/weixin/`（MIT，保留出处注释）+ openclaw-weixin
  PR #161 的 -14 恢复修复 + gtaifu 式 24h 凭证体检；不再依赖 pan17 上游节奏。
- **D10 兼容性护栏**：`approval/request`、`user-questions/request`、`commands`、
  `settings`、`credentials`、`agents`、`session/event` 关键形状写 43+ 项宿主契约断言
  （对照已发布类型）+ 上游 master 漂移检查（学 lark-bridge）；断约即 CI 红，绝不静默。

## 6b. 官方契约核实（2026-09-03 实测，对照宿主 checkout `D:\deepseek-harness`）

> 全部来自官方源码与 docs 实读（非竞品转述）。方案中每个 seam 均按下表落地；
> `verify` 门禁对关键形状做契约断言，上游漂移即 CI 红（D10）。

| 方案依赖 | 官方契约（实测） |
|---|---|
| 审批应答 | `ctx.approval`（`interaction/user-approval`）：`approval/request` 瀑布（`this: Scoped<Agent>`，req: `{agent, toolName, callId?, reason?, signal?}`，next() 让出）；返回值词表 `allowed-once/rejected/cancelled/unavailable`；req.signal abort → `cancelled`；审计 `approval/asked`/`approval/decided` 持久化配对；会话级 `approval/policy`（`ask/never`） |
| 提问应答 | `user-questions/request` 瀑布（同模式）；问题结构 `{id, question, detail?, header?, options?[{label,description?}], multiSelect?, intent?}`；答案 `{answers:[{id, selected[], custom?}]}` —— `P1=Q1=2` 语法直映此结构；`intent: {kind:'plan-review', approve}` 是官方计划审批呈现 |
| 命令透传 | `ctx.commands`（`interaction/commands`）：`register(def)`（name 正则 `[a-z][a-z0-9_-]*`，handler→`CommandResult {kind:'success',text?} | {kind:'error',text}`，返回 disposer）；**`execute(agent, line, images, signal)` 官方直通入口**（自动记 `command/run`+`command/done`）；`find/list` 查询。text 即回执文案 |
| 设置存储 | `ctx.settings.register(ns, schemastery schema, {base?…})` → 拥有者句柄（read/update/patch/replace/edit + on-updated）；schema 支持**秘密槽位**（线上 redact）；客户端 `ctx.settingsScope` 镜像 + `settings.section` slot（`{id, order, label}`，label 随 locale 重注册）。取代 pan17 的 `~/.dsh-wechat/config.json` |
| 凭据 | `ctx.credentials`（`credentials/credentials`）：`credentialKey('dsh-reach','weixin-token')` 品牌键 + `modifyRecord` 写入 + `resolve/describe/list`；或 `CredentialRef`（环境变量名）。token 永不过浏览器线 |
| 工作区 | `ctx.workspaceRegistry`：`create(path, title?) / get / list / resolveByPath / archiveSession` |
| Agent | `ctx.agents`：`create(options) / resume(options) / register(agent) / get(id) / list()`；`agent.inject(createUserMessage(…))` 注入消息（`createUserMessage` 来自 `@deepseek-ai/dsh-llm`） |
| 出站事件 | `session/event`（emit）+ 会话事件 `turn/start`、`turn/end {turn, reason}`、`assistant/message {turn, step, message, usage?, interrupted?}`、`user/message`、`tool/call`、`tool/result`；`agent/error` |
| 工具注册 | `ctx.tools.register(ToolDefinition extends ToolSchema)` → disposer（`reach_send` 等工具） |
| 渠道提示词 | `ctx.systemPrompt.context({name, order, text(context)})`（官方 approval 服务同款用法） |
| /status 扩展 | `ctx.sessionProjections`：ProjectionDefinition（init/apply/view）注册（计划/目标/用量等四段展示的数据源） |
| /preset | `ctx.agentPresets`：`list / read / resolve / select(agent, id) / recompose` |
| /model | `ctx.agentDefaultModel`：`currentSelection() / saveSelection()` |
| /perm | `ctx.permissionPresets`：`current(session) / resolve / optionOf / set(session, name)`（内部写 sandbox 模式 + 审批策略） |
| HTTP 路由 | `ctx.webServer.register(route)`（exact/prefix）+ `registerUpgrade` + `registerFallback`（QR/status/推送 API 路由） |
| 包清单 | `dsh.bundle.patch: './cordis.patch.yml'`（profile composer 解析为 bundle 层）；`dsh.client`（platform + inject）——bundle 包测试实测确认 |
| 网关（参考） | `/api/remote.mux` + `API_REMOTE_FORWARDED_EVENTS`（`approval/request`、`user-questions/request` 均在白名单，mode=waterfall）——仅浏览器客户端需要；进程内插件直接监听瀑布即可 |

**对方案的修正**：① 删除「apiProxy.respond 注入」表述（D1 已改）；② 配置/状态迁移到
settings 命名空间 + credentials，`~/.dsh-wechat` 目录退役；③ 命令透传走
`ctx.commands.execute()` 官方入口（比 pan17 自找 handler 更稳，且自带生命周期审计）；
④ 提问卡语法直接映射官方 `AskUserQuestion*` 结构，天然支持多选与 plan-review。

## 6c. 社区开发经验吸收（dsh-plugin-guide 实测，2026-09-03 通读）

> 来源：`dsh-plugin-guide/guide/plugin-dev-guide.md`（综合指南，§7.3 含 20 个实测坑）、
> `references/community-repo-deep-dive.md`（15 仓库深读 + 跨仓库共识 §2）、
> `SKILL.md`（技能工作流）、`templates/ts/`（脚手架模板）、`quick-reference.md`。

### 采纳进方案的经验（逐条）

1. **入口形态**：函数插件 = 命名导出 `name/inject/Config/apply`，**禁止 default export**
   （Loader 解包 `exports.default ?? exports`，多余 default 会丢 inject/Config/name）。
2. **cordis 身份单轨**：只认 scoped `@deepseek-ai/cordis`（unscoped `cordis` 混用 =
   双身份分裂，declaration merging 失效）。peerDependencies 三元组与社区共识一致：
   `@deepseek-ai/cordis ^4.0.2` + `@deepseek-ai/dsh-tools >=0.1.0-rc.8 <0.2.0` +
   `@deepseek-ai/schemastery`（版本以开工时 registry 实测为准）；devDeps 同钉。
   tsdown 配置 `external: [/@deepseek-ai\//]`（否则误内联官方包）。
3. **脚手架形态（模板共识）**：`main/types → lib/`、`files: [lib, cordis.patch.yml]`、
   `build=tsdown`、`typecheck=tsc --noEmit`、`prepare=tsdown`（git 安装自包含，不跑类型检查、
   不假设 monorepo 兄弟目录）、`engines: ^22.19.0 || >=24.0.0`、Apache-2.0。
   tsconfig：`moduleResolution: bundler` + `allowImportingTsExtensions` +
   `rewriteRelativeImportExtensions` + `lib: ES2024` + `types: ["node"]`。
4. **patch 细节**：`- insert: - id: <id> name: '<包名>'`（name 是包名且必须加引号，YAML
   `@` 保留符）；id 定向 patch = 整行替换 config（非深合并，覆盖方重述全部键）；
   `!!js` 只在 plugin `config` 下合法。
5. **注册即 effect + Fiber**：iLink 长轮询、出站队列泵、cron 定时器、心跳、单例锁、
   webServer 路由全部 `ctx.effect()` 化；有顺序依赖的清理放进同一个 disposer。
6. **模型可见 ⟺ 已记录**：IM 入站消息统一 `agent.followup(createUserMessage({content,
   source:{kind:'plugin', plugin:'<名>'}}))`（空闲开新轮）/ `agent.inject(...)`（忙碌排队，
   挂到下一请求）——与官方「定时任务 → followup(cron) / inject()」同款，且天然落进
   会话日志（`user/message` 带 source），无需自造会话事件类型。
7. **SessionEvent 消费规则**：`turn/*`、`step/*`、`tool/call`、`tool/result` 是持久化
   会话事件类型（在 `session/event` 里以 `event.type` 出现），不是 Cordis 事件；
   switch 它们用 merge-extensible 语义（禁 assertNever，落文档化 default 放行）。
   不新增下游插件事件类型（无注册面）；渠道提示词注入这类模型可见输入走
   `ctx.systemPrompt.context()` + 会话日志可重建即可。
8. **工具契约**：`reach_send` 等工具走 `defineTool`（`@deepseek-ai/dsh-tools`）：
   parameters 自动校验、`output.schema` 声明规范 JSON 值、人类文本放 `output.render`、
   尊重 `exec.signal`、UI 卡片 presenter 纯函数（禁 I/O/时钟/随机）。
9. **测试五层（社区共识）**：Unit → HMR disposal（注册可逆）→ 真实 Loader composition
   （`ctx.plugin()` + Loader 解包断言）→ 构建产物 smoke（lib/ 于 plain Node）→
   keyless snapshot/e2e（产品可见行为转录）；外加 `pnpm pack` 装入干净临时
   `DSH_HOME` profile 冒烟（安装+启动+卸载，红线 3 全沙箱）。仅 ctx.plugin() 单测
   不够（社区反模式 16/17）。
10. **分发与收录**：bundle 形态安装后**重启生效**（客户端 UI 依赖 bundle）；git 源安装
    需 prepare + 用户侧 allowBuilds（pnpm≥10），npm/tarball 分发免构建许可；
    发布前过 `dsh-plugin-dev check --strict`（本工作区 guide 自带 CLI：patch 合法性/
    package.json 元数据/peer 依赖/engines/files 白名单/五语 README 一致性）+ 外部
    `dsh-plugin-check`；README 写明安装/卸载/最小示例；仓库加 `dsh-plugin` topic；
    hub/awesome 收录 = 公开 + topic + 合法 manifest + 显式依赖 + 许可证 + 无密钥/PII。
11. **工具链复用**：Phase 0 直接用 `dsh-plugin-dev new <名>` 生成骨架（本工作区已有，
    `D:\deepseek-harness\Project\Plugins\dsh-plugin-guide\bin\dsh-plugin-dev.js`），
    先查官方 RFC #1629（`pnpm create dsh-plugin` 提案）是否已落地官方模板，有则对照
    吸收；`dsh-plugin-dev verify` 进 CI 作安装冒烟。
12. **Windows 实测坑速记**：junction 用 `New-Item -ItemType Junction`；vitest 盘符大写
    `C:/`；`DSH_*` 特殊变量经启动环境传入（放 `~/.dsh/.env` 会报错）；`DSH_PERMISSION_MODE=
    danger-full-access` 不写进模板/CI；MSYS 下用 wrapper 启动 bin/dsh。

### 对既有方案的增量修正

- D8 增补：peer 三元组显式化（cordis/dsh-tools/schemastery）+ scoped 单轨 + tsdown external。
- Phase 0：骨架改为「`dsh-plugin-dev new`（对照官方模板）+ 上述 scaffold 共识」，
  并把 `check --strict`/`verify` 纳入 CI。
- Phase 4：发布清单增加 topic/hub/awesome 收录标准 + `dsh-plugin-check` 健康检查 +
  keyless snapshot 覆盖模型可见行为。
- 风险表新增一行：cordis 双身份分裂（构建期，D8 缓解）。

## 7. 分阶段开发计划

> 每阶段验收 = 工作区检查链全绿：`pnpm run typecheck && pnpm test && pnpm run build &&
> pnpm run verify && pnpm pack`。测试与 demo 一律 `%TEMP%` 临时 DSH_HOME（红线 3/5）。

### Phase 0 — 决策收口（0.5 天）
- 交付：名字拍板（§9）、npm/GitHub 名可用性实测；骨架用 `dsh-plugin-dev new <名>`
  （本工作区 guide 自带 CLI）并对照官方模板/RFC #1629 现状；落实 scaffold 共识
  （§6c.3：入口命名导出禁 default、lib/ 产物、prepare 自包含、tsconfig 三件套、
  peer 三元组、files 白名单）；CI 标配（Scorecard/host-compat/README 官方声明/
  dsh1024 安装行/funding/dshWorkshop manifest）；AGENTS.md/ARCHITECTURE.md/五语 README 骨架
- 验收：`dsh-plugin-dev check --strict` 全绿 + 空仓 `pnpm run verify` 全绿

### Phase 1 — 微信单通道重写（MVP，3–5 天）
- 交付：channel-core 契约 v1 + weixin 适配器（iLink 移植 + PR#161）+ bridge 核心
  （路由/决策镜像/稳定编号/收窄捕获/多卡强制/出站队列/审计/围栏）+ 设置页 + 凭据 *Ref
- 测试：单元 + fake-ilink 集成 + **19 补丁行为回归规格**（每条补丁一条 spec，从交接包
  `custom-patch/apply-patch.mjs` 的 from/to 反推预期行为）+ 宿主契约断言
- 验收：临时 DSH_HOME 上对拍「补丁版 0.7.2」行为一致且新安全默认生效；
  对照检查链 + `dsh1024 plugin --profile web add <pkg>` 安装行

### Phase 2 — 决策与命令增强（3–4 天）
- 交付：超时三档 + 授权码 + 自然语言审批（默认关）+ 命令面扩展（冷唤醒/use/model 树/
  detail/policy/batch/cron）+ 开放推送服务（notify + HTTP + sent 事件）+ 心跳/卡死告警
- 测试：通知矩阵、超时策略三档、服务消费者测试（另一测试插件消费 `reach.notify()`）、
  审计完整性
- 验收：全功能在临时 DSH_HOME 冒烟 + 检查链

### Phase 3 — 多通道验证（4–6 天）
- 交付：feishu 适配器（按钮卡审批+决策人回写+流式卡片）、telegram 适配器（内联按钮+
  原消息编辑+会话列表/暂停恢复）；附件内容提取；per-channel 工作区隔离
- 测试：每通道 fake-channel 集成套件；按钮卡 ↔ 文本卡决策等价性（同一 pending 表竞速）
- 验收：三通道同装互不干扰；iLink token 不与其它微信插件互踢（单例锁）；检查链

### Phase 4 — 工程与发布收口（2–3 天）
- 交付：媒体矩阵补全（视频双向）、Markdown→渠道排版、(1/n) 分段、多段输入合并、
  上游漂移检查 + 凭据泄漏验证门禁 + keyless snapshot（模型/产品可见行为）、
  五语 README + 双语 UI 文案、CHANGELOG、发布流水线（tag→publish，provenance）、
  `dsh-plugin-dev check --strict` + `dsh-plugin-dev verify` + 外部 `dsh-plugin-check`、
  Gitee 镜像 / dsh1024 / omdsh 提交、`dsh-plugin` topic + hub/awesome 收录（§6c.10 标准）
- 验收：CI 全绿 + npm alpha→stable 线 + 收录渠道流程走通

## 8. 风险清单

| 风险 | 影响 | 缓解 |
|---|---|---|
| iLink 协议官方调整 | 微信通道全断 | 适配器隔离 + 漂移检查 + -14 自愈 + 24h 体检 + 多通道兜底 |
| 决策契约变动（瀑布签名/白名单） | 决策镜像失效 | D10 契约断言（含 `API_REMOTE_FORWARDED_EVENTS` 成员检查）+ 漂移检查，断约即红 |
| 微信纯文本天花板 | 按钮体验缺失 | 多通道骨架；微信端把 P{n} 做到极致 |
| context_token（重启须先发消息） | 推送静默失效 | 文档化 + 状态页明示 + 心跳 nudge |
| pan17 上游复活 | 重复劳动 | 我们是独立新仓（MIT 出处合规）；可选择性 cherry-pick |
| 范围蔓延（多用户/群聊/27 平台） | 工期失控 | v1 锁定单 owner + 白名单；多用户 P3、群聊等平台开放 |
| 微信限流/风控 | 消息积压 | per-channel 节流配额 + FIFO + 安抚文案 |
| 与其它微信插件同装互踢 token | 登录态漂移 | 单例文件锁 + 文档明示 |
| cordis 双身份分裂（构建期） | 类型增强失效/运行时挂 | D8：scoped 单轨 + peer 对齐宿主 + tsdown external |

## 9. 开放问题（需用户拍板）

1. **插件名**：`dsh-reach`（首选）/ `dsh-omnirelay` / `dsh-chatlink`？（Phase 0 实测可用性）
2. **v1 通道范围**：先「微信单通道做精」再扩飞书/Telegram（推荐，骨架按多通道设计）？
3. **多用户**：v1 单 owner + 白名单，trust-set 多用户放 v2？（推荐）
4. **依赖策略**：typed peers（推荐，符合本工作区双基线）还是 pan17 式零 peer？
5. **对 pan17 的 PR**：新仓为主、PR 可选（上游停摆且 forks=0，PR 价值下降）——是否仍投？
6. **发布节奏**：MVP 后先内测（临时 profile），还是 Phase 4 一次性全平台发布？
7. **QQ/钉钉/企微**：是否列入 v2 通道清单（调研显示各家均有官方 SDK 与竞品实现）？

## 10. 与既有约定对齐（备忘）

- 独立 git 仓库，默认分支 `main`；License Apache-2.0；五语 README + CHANGELOG
- 检查链与发布流水线、CI 标配（Scorecard/host-compat/README 声明/dsh1024 安装行/funding/dshWorkshop）
- 微信适配器保留 pan17（MIT）出处；feishu/telegram 适配器均为官方 SDK 新写
- 所有「可用/通过」结论必须来自真实执行输出（红线 9）；demo 只用临时 DSH_HOME（红线 3/5）
