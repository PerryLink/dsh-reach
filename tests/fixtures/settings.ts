/**
 * Test double for the host's `settings` service, pinned to the real
 * `SettingsForms` surface.
 *
 * The pre-fix fixtures provided a `register(ns, schema, options)` method and
 * returned a writable scope from it. No published settings service has that
 * method on the `0.1.7` line — it belonged to the replaced `SettingsProvider`
 * seam — so those fixtures kept `pnpm test` green while a real profile died on
 * `settings?.register is not a function` and the whole plugin row failed to
 * activate. This double therefore carries ONLY the public `SettingsForms`
 * surface, and `tests/settings-face.spec.ts` asserts every key of it exists on
 * the real class while the real class has no `register`.
 *
 * `configure(presentation, owner)` is the whole of what `dsh-reach` may call.
 * The call log is deliberately a SIBLING of the service, never a member of it,
 * so the object handed to the plugin has exactly the real service's shape.
 */

/** A presentation policy handed to the fake's `configure`. */
export interface PresentationPolicy {
  readonly auto?: boolean
}

/** One captured `configure` call: the policy and the owner identity. */
export interface ConfigureCall {
  readonly presentation: PresentationPolicy
  readonly owner: unknown
}

/** The minimal service object, plus the log the service itself must not carry. */
export interface SettingsFormsDouble {
  /** What gets passed to `ctx.provide('settings', …)` — the real surface only. */
  readonly service: { configure(presentation: PresentationPolicy, owner?: unknown): () => void }
  /** Every `configure` call still in force, oldest first. */
  readonly calls: ConfigureCall[]
}

/**
 * Build the fake settings service. The returned disposer removes the call from
 * {@link SettingsFormsDouble.calls}, so an assertion after `fiber.dispose()`
 * proves the policy rode the plugin's effects.
 *
 * Both parameters are required here on purpose: the real
 * `SettingsForms.configure` reports `length === 2` (its `owner` default is a
 * runtime default, not a signature default), and `settings-face.spec.ts`
 * compares the arities.
 * @param onConfigure - optional hook run on every call (e.g. to record the owner).
 * @returns the plugin-facing service and its call log.
 */
export function fakeSettingsForms(onConfigure?: (call: ConfigureCall) => void): SettingsFormsDouble {
  const calls: ConfigureCall[] = []
  const service = {
    // `owner` is optional so the reported arity matches the real
    // `SettingsForms.configure`, whose owner default is a runtime default
    // (`owner = this.ctx.fiber`) and therefore does not count.
    configure(presentation: PresentationPolicy, owner?: unknown): () => void {
      const call: ConfigureCall = { presentation, owner }
      calls.push(call)
      onConfigure?.(call)
      return () => {
        const index = calls.indexOf(call)
        if (index >= 0) calls.splice(index, 1)
      }
    },
  }
  return { service, calls }
}
