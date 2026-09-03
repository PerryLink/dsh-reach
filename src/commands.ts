/**
 * Local slash-command table for `dsh-reach`, registered through the official
 * `ctx.commands` registry so the commands appear in the GUI command list and
 * execute through the SAME pipeline as native commands (`command/run` +
 * `command/done` lifecycle audit included).
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { Bridge } from './bridge.ts'

const HELP_TEXT = `dsh-reach 命令：
/help 帮助
/status 状态（卡片/队列/开关）
/silent on|off 静默模式
/notify on|off|status 跨会话决策推送总闸
/tasks on|off 后台完成/报错通知
/enter queue|steer|status 繁忙时投递
/history 重看所有待处理卡片
/stop 中断当前任务
/next 补发出站缓存
决策卡：单卡回复 1/2 或答案；多卡用 P1=1 P2=2（提问 P1=Q1=2）；/rp /rq 全部拒绝
其它 /xxx 命令由 DSH 原生命令处理或转发给 agent。`

/** Build the bridge-owned command definitions for `ctx.commands.register`. */
export function localCommands(bridge: Bridge): readonly CommandDefinition[] {
  const def = (name: string, description: string, handler: CommandDefinition['handler']): CommandDefinition => ({
    name,
    description,
    handler,
  })
  return [
    def('reach', 'Show the dsh-reach bridge status.', () => ({ kind: 'success', text: 'dsh-reach bridge mounted. /help for commands.' })),
    def('help', 'List dsh-reach commands.', () => ({ kind: 'success', text: HELP_TEXT })),
    def('status', 'Bridge status: pending cards, queues, switches.', (invocation) => ({
      kind: 'success',
      text: [
        'dsh-reach 状态：',
        `- 待处理卡片: ${bridge.pendingCount(invocation.agent.session.id)}`,
        `- 出站队列: ${bridge.outboundFor(invocation.agent.session.id)}`,
        `- 静默: ${bridge.isSilent() ? 'on' : 'off'}`,
        `- 跨会话决策推送: ${bridge.notifyGate()}`,
        `- 后台完成通知: ${bridge.taskEventsGate()}`,
        `- 繁忙投递: ${bridge.queueMode()}`,
      ].join('\n'),
    })),
    def('silent', 'Toggle silent mode (on|off).', (invocation) => {
      const value = invocation.rawInput.trim().toLowerCase()
      if (value !== 'on' && value !== 'off') return { kind: 'success', text: `用法: /silent on|off（当前 ${bridge.isSilent() ? 'on' : 'off'}）` }
      bridge.setSilent(value === 'on')
      return { kind: 'success', text: `静默模式已${value === 'on' ? '开启（每轮只发最终回复）' : '关闭'}。` }
    }),
    def('notify', 'Cross-session decision push master switch (on|off|status).', (invocation) => {
      const value = invocation.rawInput.trim().toLowerCase()
      if (value === 'on') { bridge.setCrossSessionNotify(true); return { kind: 'success', text: '跨会话决策推送已开启。' } }
      if (value === 'off') { bridge.setCrossSessionNotify(false); return { kind: 'success', text: '跨会话决策推送已关闭。' } }
      return { kind: 'success', text: `跨会话决策推送: ${bridge.notifyGate()}；后台完成通知: ${bridge.taskEventsGate()}` }
    }),
    def('tasks', 'Background completion notices (on|off).', (invocation) => {
      const value = invocation.rawInput.trim().toLowerCase()
      if (value === 'on') { bridge.setNotifyTaskEvents(true); return { kind: 'success', text: '后台任务完成/报错通知已开启。' } }
      if (value === 'off') { bridge.setNotifyTaskEvents(false); return { kind: 'success', text: '后台任务完成/报错通知已关闭。' } }
      return { kind: 'success', text: `后台任务通知: ${bridge.taskEventsGate()}（/tasks on|off）` }
    }),
    def('enter', 'Busy delivery mode (queue|steer|status).', (invocation) => {
      const value = invocation.rawInput.trim().toLowerCase()
      if (value === 'queue') { bridge.setQueueMode('queue'); return { kind: 'success', text: '繁忙时投递: queue（排队，轮次结束后自动继续）。' } }
      if (value === 'steer') { bridge.setQueueMode('steer'); return { kind: 'success', text: '繁忙时投递: steer（插入当前轮次）。' } }
      return { kind: 'success', text: `繁忙时投递: ${bridge.queueMode()}（/enter queue|steer）` }
    }),
    def('history', 'Re-show all pending decision cards.', (invocation) => {
      const cards = bridge.pendingCardsForSession(invocation.agent.session.id)
      if (cards.length === 0) return { kind: 'success', text: '当前没有待处理卡片。' }
      return { kind: 'success', text: cards.map((card) => bridge.renderCard(card)).join('\n\n') }
    }),
    def('stop', 'Interrupt the current task.', (invocation) => {
      bridge.stopSession(invocation.agent.session.id)
      return { kind: 'success', text: '已请求中断当前任务。' }
    }),
    def('next', 'Force-drain the cached outbound queue.', () => {
      bridge.drainForFirstUser()
      return { kind: 'success', text: '已尝试补发出站缓存。' }
    }),
  ]
}
