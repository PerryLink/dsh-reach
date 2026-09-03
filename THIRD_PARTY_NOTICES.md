# THIRD_PARTY_NOTICES

This file documents third-party components and their licenses.

## Build-time dependencies

- [tsdown](https://github.com/rolldown/tsdown) — bundler used by the build
  scripts; declared as a regular dependency so the git-install `prepare`
  lifecycle can build with production dependencies alone.
- [TypeScript](https://www.typescriptlang.org/) — declaration emit for the
  build scripts.

## Upstream credits (weixin adapter port, landed Phase 1)

- The weixin adapter ports `dist/weixin/*` and `dist/adapter/inbound.js` from
  [pan17/dsh-wechat](https://github.com/pan17/dsh-wechat) 0.7.2 (MIT),
  originally derived from
  [@tencent-weixin/openclaw-weixin](https://github.com/Tencent/openclaw-weixin)
  (MIT) and [wechat-opencode](https://github.com/pan17/wechat-opencode) (MIT);
  file headers retain the source attribution.

No third-party source is bundled in the published package; zod is inlined at
build time and stays a declared dependency for the node face's type surface.
