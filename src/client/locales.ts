/** Dictionary namespace for the reach settings tab (en/zh). */

export type ReachLocaleKey = 'tab' | 'title' | 'phase' | 'account' | 'user' | 'pending' | 'queue' | 'silent' | 'crossSession' | 'taskEvents' | 'queueMode' | 'allowFrom' | 'scan' | 'logout' | 'save' | 'queueLabel' | 'steerLabel' | 'hint'

export const en: Record<ReachLocaleKey, string> = {
  tab: 'IM Bridge',
  title: 'dsh-reach bridge',
  phase: 'Channel phase',
  account: 'Bot',
  user: 'Bound user',
  pending: 'Pending cards',
  queue: 'Outbound queue',
  silent: 'Silent mode',
  crossSession: 'Cross-session decision push',
  taskEvents: 'Background completion notices',
  queueMode: 'Busy delivery',
  allowFrom: 'Allowlist (comma-separated user ids)',
  scan: 'Re-scan QR',
  logout: 'Log out',
  save: 'Save',
  queueLabel: 'queue',
  steerLabel: 'steer',
  hint: 'After a fresh login, send the bot any message (e.g. /status) before it can push.',
}

export const zh: Record<ReachLocaleKey, string> = {
  tab: 'IM 桥接',
  title: 'dsh-reach 桥接',
  phase: '通道状态',
  account: 'Bot',
  user: '绑定用户',
  pending: '待处理卡片',
  queue: '出站队列',
  silent: '静默模式',
  crossSession: '跨会话决策推送',
  taskEvents: '后台完成通知',
  queueMode: '繁忙投递',
  allowFrom: '白名单（逗号分隔的用户 id）',
  scan: '重新扫码',
  logout: '退出登录',
  save: '保存',
  queueLabel: '排队',
  steerLabel: '插话',
  hint: '登录后先给机器人发一条消息（如 /status），推送才会开始。',
}
