# THIRD_PARTY_NOTICES

This file documents third-party components and their licenses.

## Build-time dependencies

- [tsdown](https://github.com/rolldown/tsdown) — bundler used by the build
  scripts; declared as a regular dependency so the git-install `prepare`
  lifecycle can build with production dependencies alone.
- [TypeScript](https://www.typescriptlang.org/) — declaration emit for the
  build scripts.

## Planned Phase 1 credits (adapter port)

- The weixin adapter ports `src/weixin/` from
  [pan17/dsh-wechat](https://github.com/pan17/dsh-wechat) (MIT), originally
  derived from
  [@tencent-weixin/openclaw-weixin](https://github.com/Tencent/openclaw-weixin)
  (MIT); file headers will retain the source attribution when the port lands.

No third-party source is bundled in the published package at this time.
