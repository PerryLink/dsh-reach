# dsh-reach 真机验证清单

> 目标：在真实 DSH 环境验证三通道登录、决策推送与回复。全部使用**临时 DSH_HOME**
> （工作区红线 3），不触碰现有会话数据。以下命令在 PowerShell 7 执行。

## 0. 前置

```powershell
# 构建并打包（在 dsh-reach 仓库目录）
pnpm run build; pnpm pack
# 临时 home（红线 3 全沙箱）
$env:DSH_HOME = Join-Path $env:TEMP ('dsh-reach-live-' + (Get-Random))
New-Item -ItemType Directory -Force -Path "$env:DSH_HOME\profiles\web" | Out-Null
```

## 1. 微信通道

```powershell
cd D:\deepseek-harness\Project\Plugins\dsh-reach
dsh plugin --profile web add '@deepseek-ai/dsh-base@0.1.2-alpha.5' '@deepseek-ai/dsh-headless@0.1.2-alpha.5' './dsh-reach-0.1.0.tgz'
# 重启 dsh web（或用 dsh1024 对应的 web 启动方式），然后：
Start-Process 'http://127.0.0.1:3080/wechat/qr'   # 或设置 → 插件 → IM 桥接 → 重新扫码
```

1. 微信扫码 → 确认登录（Bot ID 出现即成功）
2. **给机器人发 `/status`**（iLink 限制：重启后必须先入站一条）
3. 期望回执：状态行含「跨会话决策推送: on」
4. 决策验证：在另一个工作区发起一个需要审批的操作（或直接发一条让 agent 用 bash 的指令）
   → 微信应收到 `🔐 P1 权限卡待处理…`；回复 `1` → GUI 同步放行
5. 多卡验证：连续触发两次审批 → 裸回复 `1` 应被拦截并提示编号；`P1=2 P2=1` 逐张裁决

## 2. Telegram 通道

1. 写 bot token（二者选一）：
   - 凭据：临时 `$env:DSH_HOME` 下经设置页/credentials 写 `dsh-reach/telegram-token`（api-key 记录）
   - 或行配置：cordis.patch.yml 的 reach 行加 `telegramToken: '<token>'`
2. 重启 → 给 bot 发 `/status`（入站触发）→ 期望回执
3. 决策卡推送与回复同微信路径（数字 chatId 自动路由 telegram）

## 3. 飞书通道

1. 写 grant 凭据记录 `dsh-reach/feishu-app`：`{ "appId": "cli_...", "appSecret": "..." }`
   （自建应用：开启长连接事件订阅 `im.message.receive_v1`；群聊需 `im:message.group_at_msg`；
   创建版本并发布——见 README 权限表）
2. 重启 → 私聊 bot 发 `/status`；群聊需 @bot
3. 卡片按钮：触发审批 → 飞书收到交互卡 → 点「允许一次/拒绝」→ GUI 同步生效

## 4. 通用检查点

```powershell
Invoke-RestMethod http://127.0.0.1:3080/wechat/api/status   # 如挂载了 wechat 路由（本插件走 settings tab）
# 状态页（设置 → 插件 → IM 桥接）应显示：phase=logged-in、monitorRunning=true、pendingCards=0
```

## 5. 结果回填

验证结果（通过/失败/现象截图）回填到本仓库 CHANGELOG 与 `AGENTS.md` 的 Decisions 段，
作为「真机已验证」证据；失败项开 issue 并记录复现步骤。
