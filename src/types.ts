/**
 * Cordis declaration merges owned by `dsh-reach`: the open push service and
 * the `reach/sent` observation event.
 */

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Open push service (mounted when `ctx.webServer` is composed). */
    reachPush: ReachPushService
  }

  interface Events {
    /**
     * One outbound push was delivered to a channel (or failed).
     * @param payload - user, text, and delivery outcome.
     * @mode emit
     */
    'reach/sent'(
      this: unknown,
      payload: { readonly user: string; readonly text: string; readonly ok: boolean; readonly reason?: string },
    ): void
  }
}

/** The open push service: `notify()` for plugins, HTTP for external callers. */
export interface ReachPushService {
  /** Push one text to an authorized user; resolves the delivery outcome. */
  notify(user: string | undefined, text: string): Promise<{ readonly ok: boolean; readonly reason?: string }>
}
