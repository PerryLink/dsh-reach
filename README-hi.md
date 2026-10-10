# dsh-reach

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh--plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![dsh-doctor](https://raw.githubusercontent.com/PerryLink/dsh-plugin-doctor/main/badges/PerryLink__dsh-reach.svg)](https://github.com/PerryLink/dsh-plugin-doctor#verified-徽章)
[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-en.svg)](https://dsh.market/)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-reach)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-reach/ci.yml?branch=main&label=CI)](https://github.com/PerryLink/dsh-reach/actions)
[![Version](https://img.shields.io/github/v/tag/PerryLink/dsh-reach?label=version)](https://github.com/PerryLink/dsh-reach/releases)
[![npm version](https://img.shields.io/npm/v/dsh-reach)](https://www.npmjs.com/package/dsh-reach)
[![npm downloads](https://img.shields.io/npm/dm/dsh-reach)](https://www.npmjs.com/package/dsh-reach)
[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-reach?metric=downloads&lang=hi)](https://dshfind.com/hi/plugins/PerryLink/dsh-reach?ref=badge)

[English](README.md) | [简体中文](README-zh.md) | [Español](README-es.md) | [Português](README-pt.md) | **हिन्दी**

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) के लिए मल्टी-चैनल निर्णय व रिमोट-कंट्रोल ब्रिज: किसी भी वर्कस्पेस के अनुमोदन/प्रश्न कार्ड को IM चैनलों (WeChat iLink, Telegram, Feishu — साथ ही QQ/DingTalk/WeCom v2 फाउंडेशन) पर भेजता है और चैट से उत्तर देना संभव बनाता है — साथ में सेशन कंसोल, प्रति-चैनल सुरक्षा और एक खुली पुश सेवा।

> **स्थिति: Phase 1–3 पूर्ण (WeChat + Telegram + Feishu चैनल, v0.1.17); v2 चैनल फाउंडेशन (QQ/DingTalk/WeCom) खुले `reachChannels` रजिस्ट्री पर।**
> डिज़ाइन योजना, प्रतिस्पर्धी शोध, आधिकारिक कॉन्ट्रैक्ट सत्यापन और चरणबद्ध रोडमैप
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md) में हैं।


**📖 इकोसिस्टम नॉलेज बेस** — मापे गए आँकड़े, मार्केटिंग नहीं: [डेवलपमेंट गाइड · चयन डेटा · रखरखाव मानदंड](https://perrylink.github.io/dsh-plugin-guide/)।

<!-- star-cta -->

## What is dsh-reach?

पूर्ण प्रमाण: `dsh-plugin-supersession-review-20261005.md`। पूरा पाठ [README.md](README.md) के **Maintenance status: 🧊 FROZEN** अनुभाग में।

![dsh-reach का टर्मिनल डेमो: dsh-reach — install, then answer a decision card from chat](https://raw.githubusercontent.com/PerryLink/dsh-reach/main/docs/assets/dsh-reach-demo.png)

![Animated terminal demo of dsh-reach](https://raw.githubusercontent.com/PerryLink/dsh-reach/main/docs/assets/dsh-reach-demo.gif)

*वही रन, एनिमेटेड।*

## रखरखाव स्थिति: 🧊 फ़्रीज़

> **2026-10-05 से फ़्रीज़। कोई नई सुविधा नहीं।** यह पैकेज अभी भी काम करता है और **सेवानिवृत्त नहीं है**, पर अब इसमें नई सुविधाओं का काम नहीं होगा; केवल वास्तविक खराबी ठीक की जाएगी।

रखरखावकर्ताओं का मानना है कि इस क्षमता में **अधिक अपनाए गए विकल्प अब मौजूद हैं**, इसलिए प्रयास अन्यत्र स्थानांतरित किया गया। 2026-10-05 को मापी गई तुलना:

| | पैकेज | साप्ताहिक डाउनलोड |
|---|---|---|
| **यह पैकेज** | `dsh-reach` | 600 |
| अधिक अपनाया गया विकल्प | [`@xmanrui/dsh-im`](https://github.com/xmanrui/dsh-im) | **17,384** |

👉 **नए काम के लिए @xmanrui/dsh-im को प्राथमिकता दें।** मौजूदा इंस्टॉल बिना किसी बदलाव के काम करते रहेंगे।

*पूर्ण प्रमाण: `dsh-plugin-supersession-review-20261005.md`। पूरा पाठ [README.md](README.md) के **Maintenance status: 🧊 FROZEN** अनुभाग में।*

## ⭐ 如果它帮到了你

यह प्लगइन [DSH प्लगइन परिवार](https://github.com/PerryLink) का हिस्सा है (40+ प्लगइन, सभी Apache-2.0)। अगर यह उपयोगी लगे, तो **एक स्टार दें** — इससे कोई सुविधा अनलॉक नहीं होती, पर अगला व्यक्ति इसे खोज में आसानी से पा लेता है।

*English:* part of a 40+ plugin family for DeepSeek Harness. If it is useful, **a star helps the next person find it** — nothing is gated behind it.
## Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-reach
dsh1024 plugin --profile web add dsh-reach
```

इंस्टॉल के बाद DSH पुनः प्रारंभ करें (bundle पैच स्टार्टअप पर लागू होते हैं)।

## संगतता

| सतह | स्थिति |
|---|---|
| Harness | DeepSeek Harness **dsh-v0.2.1-alpha.1** (GitHub tag)। peer रेंज `>=0.1.2-rc.1 <0.2.0 \|\| >=0.1.5-alpha.1 <0.2.0 \|\| >=0.1.6-0 <0.2.0 \|\| >=0.1.7-0 <0.2.0`; dev/test pins जान-बूझकर प्रकाशित `0.1.7-rc.2` लाइन पर हैं — यही वह face है जिसे `typecheck:ci` रूलर मापता है (`typecheck` रूलर `tsconfig.json` के `paths` से checkout मापता है)। 2026-09-25 को पूर्ण gate chain के साथ सत्यापित; bare-import + scratch-profile + keyless smoke हर PR पर Compat workflow में चलता है। |
| Node | `^22.19.0 \|\| >=24.0.0` |

## Features (Phase 1)

```sh
dsh plugin --profile web add github:PerryLink/dsh-reach
```

- किसी भी वर्कस्पेस के निर्णय कार्ड WeChat पर स्थिर क्रमांकन के साथ भेजे जाते हैं; `1`/`2`, `P1=1 P2=2` या `/rp` `/rq` से उत्तर दें।
- Fail-closed सुरक्षा: पहला प्रेषक owner बनता है; खाली सूची सभी को अस्वीकार करती है।
- सेशन कंसोल (`/reach /help /status /silent /notify /tasks /enter /workspace /session /preset /model /perm /history /stop /next`) और सेटिंग्स टैब।

## Configuration

| कुंजी | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `crossSessionNotify` | `true` | किसी भी वर्कस्पेस/सेशन के निर्णय कार्ड भेजें (मास्टर स्विच) |
| `notifyTaskEvents` | `false` | पृष्ठभूमि कार्य पूर्ण/त्रुटि सूचनाएँ |
| `cardTimeoutSec` | `1800` | कार्ड का सॉफ्ट टाइमआउट सेकंड में (`0` = हमेशा प्रतीक्षा) |
| `textChunkLimit` | `4000` | लंबे उत्तर का प्रति-संदेश खंड सीमा (अक्षर) |
| `silent` | `false` | केवल अंतिम उत्तर, चरण-दर-चरण स्ट्रीमिंग नहीं |
| `cwd` | `''` | नए IM सेशन के लिए डिफ़ॉल्ट कार्य निर्देशिका |
| `authCode` | `''` | Shared secret the IM side must present before a message is accepted |
| `digestSec` | `300` | Digest window in seconds (`0` disables the digest) |
| `pushToken` | `''` | Token for the open push service (`reach_send` HTTP surface) |
| `telegramToken` | `''` | Telegram bot token for the Telegram channel |

## Development

```bash
pnpm install
pnpm run typecheck && pnpm run typecheck:ci && pnpm test
pnpm run build && pnpm run verify:self-contained && pnpm run verify:artifacts
pnpm run check:readmes && pnpm pack
```

### DSH Desktop मार्केट से इंस्टॉल करें

सभी PerryLink प्लगइन DSH Desktop के बिल्ट-इन मार्केट में देखे जा सकते हैं: **Market → Sources → add source → पेस्ट करें** `https://perrylink-dsh-catalog.perrylink.workers.dev/catalog-source.json` **→ चुनें**। इंस्टॉलेशन मार्केट के npm-identity सत्यापन और आपकी पुष्टि से ही होता है।

## Interoperability with other DSH plugins

**DSH `0.2.0-rc.2`** (वह रनटाइम जिसके लिए यह README प्रकाशित है) और 2026-10-05 को सर्वे किए गए उच्च-स्टार प्लगइन सेट के विरुद्ध सत्यापित।

यह प्लगइन अन्य प्लगइनों में **हस्तक्षेप नहीं करता**, उन उच्च-स्टार प्लगइनों सहित जो व्यापक रूप से इंस्टॉल हैं:

- **कोई टूल-नाम टकराव नहीं।** सभी टूल नेमस्पेस युक्त हैं; कोई भी ऐसा नंगा नाम नहीं लेता जो पहले से किसी अंतर्निहित टूल या अन्य प्लगइन का हो।
- **कोई सर्विस-की टकराव नहीं।** यह केवल `reach`, `reachChannels`, `reachPush` प्रदान करता है; यह key न अंतर्निहित सीम है और न किसी सर्वे किए गए उच्च-स्टार प्लगइन द्वारा प्रदान की जाती है।
- **कोई स्लॉट टकराव नहीं।** यह कोई क्लाइंट slot key पंजीकृत नहीं करता, इसलिए `shadows-shipped-ui` सीट के लिए प्रतिस्पर्धा नहीं करता।
- **कोई HTTP रूट टकराव नहीं।** यह कोई `webServer` प्रीफ़िक्स पंजीकृत नहीं करता।
- **कोई patch-लेयर टकराव नहीं।** बंडल patch केवल अपनी पंक्ति `insert` करता है; कभी किसी अंतर्निहित पंक्ति का `config` ओवरराइड नहीं करता।
- **कोई वैश्विक परिवर्तन नहीं।** यह प्रोटोटाइप नहीं बदलता, `process.env` नहीं लिखता, और वैश्विक fetch dispatcher प्रतिस्थापित नहीं करता।

**साझा ईवेंट लिसनर रचना से ही अहस्तक्षेपी हैं।** यह क्रम-संवेदनशील ईवेंट `approval/request`, `user-questions/request` को `ctx.on()` से देखता है — Cordis का **ब्रॉडकास्ट** पंजीकरण, जहाँ हर लिसनर चलता है और कोई किसी दूसरे को वंचित नहीं कर सकता। **यहाँ प्रत्येक लिसनर `next()` से डेलिगेट करता है**, इसलिए श्रृंखला कभी शॉर्ट-सर्किट नहीं होती:

स्थैतिक प्रमाण: इस रिपॉज़िटरी पर `dsh-plugin-doctor` के K10–K13 सभी `pass` हैं।

## PerryLink DSH Plugin Family

यह प्रोजेक्ट [PerryLink](https://github.com/PerryLink) के DeepSeek Harness प्लगइन परिवार का हिस्सा है — **33 सक्रिय रूप से अनुरक्षित**, कुल सूची **42** है जिसमें **6 फ़्रोज़न** और **3 सेवानिवृत्त** हैं; हर एक की पंक्ति नीचे बनी रहती है, कारण “स्थिति” कॉलम में है। अगर यह उपयोगी लगे, तो अन्य भी मददगार होंगे:

| Plugin | एक पंक्ति में | स्थिति |
|---|---|---|
| **[dsh-auto-review](https://github.com/PerryLink/dsh-auto-review)** | Second-model auto-review on the approval chain, fail-closed by default | |
| **[dsh-autotier](https://github.com/PerryLink/dsh-autotier)** | Automatic strong/cheap model-tier routing with deterministic risk guards and a `/tier` command | |
| **[dsh-background-agents](https://github.com/PerryLink/dsh-background-agents)** | Durable background child agents with a Web UI sidebar, messaging and interrupt | 🚫 **सेवानिवृत्त** — ऊपर देखें |
| **[dsh-budget](https://github.com/PerryLink/dsh-budget)** | Cost governance for DeepSeek Harness: budgets, carbon, and latency in one panel. | 🧊 फ़्रोज़न — रिपॉज़िटरी README देखें |
| **[dsh-catalog](https://github.com/PerryLink/dsh-catalog)** | DSH Desktop Market standard catalog source for the PerryLink family | |
| **[dsh-cert-mcp](https://github.com/PerryLink/dsh-cert-mcp)** | Read-only MCP server exposing the certification registry: grades, snapshots and five-dimension evidence | |
| **[dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind)** | Claude Code /rewind-equivalent: snapshots, session forks, one-shot restore | |
| **[dsh-claude-move](https://github.com/PerryLink/dsh-claude-move)** | Migrate Claude Code sessions, memory, skills and CLAUDE.md into DSH | 🧊 फ़्रोज़न — रिपॉज़िटरी README देखें |
| **[dsh-click](https://github.com/PerryLink/dsh-click)** | Cross-platform native desktop control for DeepSeek Harness — Windows first. | |
| **[dsh-composer-history](https://github.com/PerryLink/dsh-composer-history)** | Terminal-style input history for the web composer: arrows, Ctrl+R search | |
| **[dsh-data-quality](https://github.com/PerryLink/dsh-data-quality)** | Dataset quality checks and citation cross-checks (the optional numeric bridge consumed here) | |
| **[dsh-defend](https://github.com/PerryLink/dsh-defend)** | Prompt-injection, jailbreak, and secret-leak defense for DeepSeek Harness. | 🧊 फ़्रोज़न — रिपॉज़िटरी README देखें |
| **[dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck)** | Engineering-discipline guard: requirements grill, test gates, adversary review | |
| **[dsh-draw](https://github.com/PerryLink/dsh-draw)** | Unified static-image generation routing for DeepSeek Harness. | 🧊 फ़्रोज़न — रिपॉज़िटरी README देखें |
| **[dsh-fast](https://github.com/PerryLink/dsh-fast)** | Read-only performance diagnostics for DeepSeek Harness. | |
| **[dsh-fund-research](https://github.com/PerryLink/dsh-fund-research)** | Deterministic research reports for Chinese public mutual funds | |
| **[dsh-github](https://github.com/PerryLink/dsh-github)** | GitHub PR/issues integration for DSH, every write gated by approval | |
| **[dsh-industry-research](https://github.com/PerryLink/dsh-industry-research)** | Industry research orchestration that seals its deliverables through this plugin's `ctx.researchReport.assemble` | |
| **[dsh-laya](https://github.com/PerryLink/dsh-laya)** | Laya typed decisions (`noul`/`choice`/`score`) as a first-class Cordis service and model-visible tools | |
| **[dsh-library](https://github.com/PerryLink/dsh-library)** | Local document knowledge base for DeepSeek Harness. | |
| **[dsh-local-ai](https://github.com/PerryLink/dsh-local-ai)** | Local-model (Ollama) integration for DeepSeek Harness. | |
| **[dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions)** | LSP diagnostics, formatting, completion, code actions and rename over language servers | |
| **[dsh-mask](https://github.com/PerryLink/dsh-mask)** | PII masking middleware: anonymize at the model boundary, restore at the display layer | |
| **[dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel)** | Read-only MCP runtime panel: /mcp command + Settings tab with status, tools and errors | |
| **[dsh-memento](https://github.com/PerryLink/dsh-memento)** | Approval-gated cross-session memory: ctx.memory seam + SQLite + memory tool | 🧊 फ़्रोज़न — रिपॉज़िटरी README देखें |
| **[dsh-observe](https://github.com/PerryLink/dsh-observe)** | OpenTelemetry and Langfuse observability exporter for DeepSeek Harness. | |
| **[dsh-output-styles](https://github.com/PerryLink/dsh-output-styles)** | Claude Code outputStyles-equivalent runtime style switching | |
| **[dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules)** | Claude Code-style declarative allow/deny/ask permission rules with audit | |
| **[dsh-plugin-certification](https://github.com/PerryLink/dsh-plugin-certification)** | Community certification registry with repro-checkable grades and badges | |
| **[dsh-plugin-doctor](https://github.com/PerryLink/dsh-plugin-doctor)** | Zero-dependency static + sandbox smoke detector for DSH plugins | |
| **[dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide)** | Plugin-development knowledge base as an on-demand agent skill | |
| **[dsh-plugin-kit](https://github.com/PerryLink/dsh-plugin-kit)** | Shared zero-runtime-dependency toolkit for the PerryLink DSH plugins | |
| **[dsh-plugin-upgrade](https://github.com/PerryLink/dsh-plugin-upgrade)** | One-package, one-corridor-index plugin upgrade skill: routes a repository to the matching closed corridor card | |
| **[dsh-plugin-upgrade-015](https://github.com/PerryLink/dsh-plugin-upgrade-015)** | Merged `0.1.3-alpha.1` → `0.1.5-rc.1` upgrade corridor card plus a zero-dependency seam scanner | 🚫 सेवानिवृत्त — कॉरिडोर अब `dsh-plugin-upgrade` द्वारा |
| **[dsh-reach](https://github.com/PerryLink/dsh-reach)** | Multi-channel approval/question bridge: WeChat/Telegram/Feishu, session console | 🧊 फ़्रोज़न — रिपॉज़िटरी README देखें |
| **[dsh-research-report](https://github.com/PerryLink/dsh-research-report)** | Verifiable research-report engine: content-addressed evidence ledger and sealed versions | |
| **[dsh-score](https://github.com/PerryLink/dsh-score)** | Multi-dimensional quality scoring for DeepSeek Harness plugins. | |
| **[dsh-session-pin](https://github.com/PerryLink/dsh-session-pin)** | Pin sessions in the Web sidebar with durable ordering | 🚫 **सेवानिवृत्त** — ऊपर देखें |
| **[dsh-session-sync](https://github.com/PerryLink/dsh-session-sync)** | Cross-device session sync for DeepSeek Harness — a dedicated git mirror of your session store. | |
| **[dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security)** | Security-audit skill pack: secret scan, dependency and supply-chain review | |
| **[dsh-talk](https://github.com/PerryLink/dsh-talk)** | Voice-first session loop for DeepSeek Harness: talk to it, hear it answer. | |
| **[dsh-team-rooms](https://github.com/PerryLink/dsh-team-rooms)** | Cross-session team rooms: shared message bus, task board and timeline | 🚫 **सेवानिवृत्त** — ऊपर देखें |
| **[dsh-test-drive](https://github.com/PerryLink/dsh-test-drive)** | Isolated install-and-smoke test drives for DeepSeek Harness plugins. | |
| **[dsh-ticktick](https://github.com/PerryLink/dsh-ticktick)** | TickTick/Dida365 task bridge: session-header panel + 11 tools | |
| **[dsh-translate](https://github.com/PerryLink/dsh-translate)** | Vendor parameter translation and deterministic JSON repair for DeepSeek Harness. | |

## License

Apache-2.0। तृतीय-पक्ष सूचनाएँ [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) में।
