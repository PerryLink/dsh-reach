/**
 * The reach settings tab: status card + live switches + QR/logout actions.
 * All data flows through the `remote.reach` namespace; all copy is locale
 * bound; the stylesheet is scoped inline (standalone bundles cannot use the
 * in-repo CSS-module pipeline).
 */

import { createElement, useEffect, useState, type ChangeEvent, type ReactElement, type ReactNode } from 'react'
import type { ReachConfigInput, ReachStatus } from '../wire.ts'
import type { ReachLocaleKey } from './locales.ts'

export interface ReachSettingsTabInjected {
  readonly status: () => Promise<ReachStatus>
  readonly applyConfig: (input: ReachConfigInput) => Promise<{ ok: boolean; reason?: string }>
  readonly relogin: () => Promise<{ ok: boolean; reason?: string }>
  readonly logout: () => Promise<{ ok: boolean; reason?: string }>
}

export interface ReachSettingsTabProps {
  readonly t: (key: ReachLocaleKey) => string
  readonly api: ReachSettingsTabInjected
}

export function ReachSettingsTab(props: ReachSettingsTabProps): ReactElement {
  const { t, api } = props
  const [status, setStatus] = useState<ReachStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [silent, setSilent] = useState(false)
  const [crossSession, setCrossSession] = useState(true)
  const [taskEvents, setTaskEvents] = useState(false)
  const [queueMode, setQueueMode] = useState<'queue' | 'steer'>('queue')
  const [allowFrom, setAllowFrom] = useState('')

  const refresh = (): void => {
    void api.status().then((next) => {
      setStatus(next)
      setSilent(next.silent)
      setCrossSession(next.crossSessionNotify)
      setTaskEvents(next.notifyTaskEvents)
      setQueueMode(next.queueMode)
    }, (reason: unknown) => setError(String(reason)))
  }
  useEffect(() => {
    refresh()
  }, [])

  const row = (label: string, value: ReactNode): ReactElement =>
    createElement('div', { className: 'reach-row' },
      createElement('span', { className: 'reach-row-label' }, label),
      createElement('span', { className: 'reach-row-value' }, value))

  const toggle = (label: string, checked: boolean, onChange: (next: boolean) => void): ReactElement =>
    createElement('label', { className: 'reach-row' },
      createElement('span', { className: 'reach-row-label' }, label),
      createElement('input', { type: 'checkbox', checked, onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked) }))

  const save = (): void => {
    const users = allowFrom.split(',').map((entry) => entry.trim()).filter(Boolean)
    void api.applyConfig({ silent, crossSessionNotify: crossSession, notifyTaskEvents: taskEvents, queueMode, allowFrom: users })
      .then((result) => { if (!result.ok) setError(result.reason ?? 'save failed') })
      .catch((reason: unknown) => setError(String(reason)))
  }

  return createElement('div', { className: 'reach-panel' },
    createElement('h3', null, t('title')),
    error ? createElement('div', { className: 'reach-error' }, String(error)) : null,
    status ? createElement('div', null,
      row(t('phase'), `${status.phase}${status.monitorRunning ? ' · monitor running' : ''}`),
      status.accountId ? row(t('account'), status.accountId) : null,
      status.userId ? row(t('user'), status.userId) : null,
      row(t('pending'), String(status.pendingCards)),
      row(t('queue'), String(status.outboundQueue)),
    ) : null,
    createElement('div', { className: 'reach-switches' },
      toggle(t('silent'), silent, setSilent),
      toggle(t('crossSession'), crossSession, setCrossSession),
      toggle(t('taskEvents'), taskEvents, setTaskEvents),
      createElement('label', { className: 'reach-row' },
        createElement('span', { className: 'reach-row-label' }, t('queueMode')),
        createElement('select', {
          value: queueMode,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => setQueueMode(event.target.value === 'steer' ? 'steer' : 'queue'),
        },
          createElement('option', { value: 'queue' }, t('queueLabel')),
          createElement('option', { value: 'steer' }, t('steerLabel')),
        ),
      ),
      createElement('label', { className: 'reach-row' },
        createElement('span', { className: 'reach-row-label' }, t('allowFrom')),
        createElement('input', { type: 'text', value: allowFrom, placeholder: 'user@im.wechat', onChange: (event: ChangeEvent<HTMLInputElement>) => setAllowFrom(event.target.value) }),
      ),
    ),
    createElement('div', { className: 'reach-actions' },
      createElement('button', { type: 'button', onClick: save }, t('save')),
      createElement('button', { type: 'button', onClick: () => void api.relogin().then(refresh, (reason: unknown) => setError(String(reason))) }, t('scan')),
      createElement('button', { type: 'button', onClick: () => void api.logout().then(refresh, (reason: unknown) => setError(String(reason))) }, t('logout')),
    ),
    createElement('p', { className: 'reach-hint' }, t('hint')),
  )
}
