/**
 * Build faces for dsh-reach. Phase 0 ships the node half only (the host
 * Loader entry); the Typert host manifest and the browser client half land
 * in Phase 1 (Remote service + settings page) and are added as extra entries
 * here, mirroring the dsh-talk two-face layout.
 *
 * The node half never bundles the scoped platform packages: they are peers
 * injected by the profile closure; `neverBundle: [/^node:/]` keeps Node
 * builtins external.
 */

import { defineConfig } from 'tsdown'

/** Plugin id: the cordis.yml bare row name, the graph row id, and the stamped bundle id must all match. */
const PLUGIN_ID = 'dsh-reach'

export default defineConfig([
  {
    name: PLUGIN_ID,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    fixedExtension: false,
    deps: {
      onlyBundle: [],
      alwaysBundle: [],
      neverBundle: [/^node:/],
    },
  },
])
