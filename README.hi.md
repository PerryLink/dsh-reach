# dsh-reach

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh-plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-reach)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-reach/ci.yml?branch=main&label=CI)](https://github.com/PerryLink/dsh-reach/actions)
[![Version](https://img.shields.io/github/v/tag/PerryLink/dsh-reach?label=version)](https://github.com/PerryLink/dsh-reach/releases)
[![npm version](https://img.shields.io/npm/v/dsh-reach)](https://www.npmjs.com/package/dsh-reach)
[![npm downloads](https://img.shields.io/npm/dm/dsh-reach)](https://www.npmjs.com/package/dsh-reach)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) के लिए मल्टी-चैनल निर्णय व रिमोट-कंट्रोल ब्रिज: किसी भी वर्कस्पेस के अनुमोदन/प्रश्न कार्ड को IM चैनलों (WeChat iLink, Telegram, Feishu — साथ ही QQ/DingTalk/WeCom v2 फाउंडेशन) पर भेजता है और चैट से उत्तर देना संभव बनाता है — साथ में सेशन कंसोल, प्रति-चैनल सुरक्षा और एक खुली पुश सेवा।

> **स्थिति: Phase 1–3 पूर्ण (WeChat + Telegram + Feishu चैनल, v0.1.2); v2 चैनल फाउंडेशन (QQ/DingTalk/WeCom) खुले `reachChannels` रजिस्ट्री पर।**
> डिज़ाइन योजना, प्रतिस्पर्धी शोध, आधिकारिक कॉन्ट्रैक्ट सत्यापन और चरणबद्ध रोडमैप
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md) में हैं।

## Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-reach
dsh1024 plugin --profile web add dsh-reach
```

इंस्टॉल के बाद DSH पुनः प्रारंभ करें (bundle पैच स्टार्टअप पर लागू होते हैं)।

## संगतता

| सतह | स्थिति |
|---|---|
| Harness | DeepSeek Harness **dsh-v0.1.3-alpha.1** (GitHub tag)। npm डिपेंडेंसी लाइन: `@deepseek-ai/dsh` **0.1.2-rc.1** (peers `>=0.1.2-rc.1 <0.2.0`)। 2026-09-06 को dsh-v0.1.3-alpha.1 master checkout के विरुद्ध सत्यापित (पूर्ण gate chain + profile install smoke)। |
| Node | `^22.19.0 \|\| >=24.0.0` |

## Features (Phase 1)

- किसी भी वर्कस्पेस के निर्णय कार्ड WeChat पर स्थिर क्रमांकन के साथ भेजे जाते हैं; `1`/`2`, `P1=1 P2=2` या `/rp` `/rq` से उत्तर दें।
- Fail-closed सुरक्षा: पहला प्रेषक owner बनता है; खाली सूची सभी को अस्वीकार करती है।
- सेशन कंसोल (`/status /silent /notify /tasks /enter /history /stop /next /help`) और सेटिंग्स टैब।

## Configuration

| कुंजी | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `crossSessionNotify` | `true` | किसी भी वर्कस्पेस/सेशन के निर्णय कार्ड भेजें (मास्टर स्विच) |
| `notifyTaskEvents` | `false` | पृष्ठभूमि कार्य पूर्ण/त्रुटि सूचनाएँ |
| `cardTimeoutSec` | `1800` | कार्ड का सॉफ्ट टाइमआउट सेकंड में (`0` = हमेशा प्रतीक्षा) |
| `textChunkLimit` | `4000` | लंबे उत्तर का प्रति-संदेश खंड सीमा (अक्षर) |
| `silent` | `false` | केवल अंतिम उत्तर, चरण-दर-चरण स्ट्रीमिंग नहीं |
| `cwd` | `''` | नए IM सेशन के लिए डिफ़ॉल्ट कार्य निर्देशिका |

## Development

```bash
pnpm install
pnpm run typecheck && pnpm run typecheck:ci && pnpm test
pnpm run build && pnpm run verify:self-contained && pnpm run verify:artifacts
pnpm run check:readmes && pnpm pack
```

### DSH Desktop मार्केट से इंस्टॉल करें

सभी PerryLink प्लगइन DSH Desktop के बिल्ट-इन मार्केट में देखे जा सकते हैं: **Market → Sources → add source → पेस्ट करें** `https://perrylink-dsh-catalog.perrylink.workers.dev/catalog-source.json` **→ चुनें**। इंस्टॉलेशन मार्केट के npm-identity सत्यापन और आपकी पुष्टि से ही होता है।

## PerryLink DSH Plugin Family

यह प्रोजेक्ट [PerryLink](https://github.com/PerryLink) द्वारा अनुरक्षित [37 DeepSeek Harness प्लगइनों](https://github.com/PerryLink) में से एक है। अगर यह आपकी मदद करता है, तो बाकी भी करेंगे:

| Plugin | One-liner |
|---|---|
| **[dsh-auto-review](https://github.com/PerryLink/dsh-auto-review)** | अनुमोदन श्रृंखला पर द्वितीय-मॉडल स्वतः-समीक्षा, डिफ़ॉल्ट रूप से विफल-बंद | |
| **[dsh-background-agents](https://github.com/PerryLink/dsh-background-agents)** | वेब UI साइडबार, संदेश और अवरोधन के साथ टिकाऊ पृष्ठभूमि चाइल्ड एजेंट | |
| **[dsh-budget](https://github.com/PerryLink/dsh-budget)** | DeepSeek Harness के लिए लागत प्रशासन: बजट, कार्बन और विलंबता एक पैनल में। | |
| **[dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind)** | Claude Code /rewind-समतुल्य: स्नैपशॉट, सत्र फ़ॉर्क, एक-बार पुनर्स्थापना | |
| **[dsh-claude-move](https://github.com/PerryLink/dsh-claude-move)** | Claude Code सत्र, मेमोरी, कौशल और CLAUDE.md को DSH में स्थानांतरित करें | |
| **[dsh-click](https://github.com/PerryLink/dsh-click)** | DeepSeek Harness के लिए क्रॉस-प्लेटफ़ॉर्म नेटिव डेस्कटॉप नियंत्रण — Windows पहले। | |
| **[dsh-composer-history](https://github.com/PerryLink/dsh-composer-history)** | वेब कंपोज़र के लिए टर्मिनल-शैली इनपुट इतिहास: तीर, Ctrl+R खोज | |
| **[dsh-data-quality](https://github.com/PerryLink/dsh-data-quality)** | डेटासेट गुणवत्ता जाँच व उद्धरण सत्यापन (यहाँ उपभोग किया गया वैकल्पिक संख्या-सेतु) | |
| **[dsh-defend](https://github.com/PerryLink/dsh-defend)** | DeepSeek Harness के लिए प्रॉम्प्ट-इंजेक्शन, जेलब्रेक और सीक्रेट-लीक रक्षा। | |
| **[dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck)** | इंजीनियरिंग-अनुशासन रक्षक: आवश्यकताओं की पूछताछ, परीक्षण द्वार, प्रतिद्वंद्वी समीक्षा | |
| **[dsh-draw](https://github.com/PerryLink/dsh-draw)** | DeepSeek Harness के लिए एकीकृत स्थैतिक-छवि निर्माण रूटिंग। | |
| **[dsh-fast](https://github.com/PerryLink/dsh-fast)** | DeepSeek Harness के लिए रीड-ओनली प्रदर्शन डायग्नोस्टिक्स। | |
| **[dsh-fund-research](https://github.com/PerryLink/dsh-fund-research)** | चीनी सार्वजनिक म्यूचुअल फंड के लिए नियतात्मक अनुसंधान रिपोर्ट | |
| **[dsh-github](https://github.com/PerryLink/dsh-github)** | DSH के लिए GitHub PR/issues एकीकरण, हर लेखन अनुमोदन-द्वारित | |
| **[dsh-industry-research](https://github.com/PerryLink/dsh-industry-research)** | उद्योग-अनुसंधान ऑर्केस्ट्रेशन जो इस प्लगिन के `ctx.researchReport.assemble` से डिलीवरेबल सील करता है | |
| **[dsh-library](https://github.com/PerryLink/dsh-library)** | DeepSeek Harness के लिए स्थानीय दस्तावेज़ ज्ञानकोश। | |
| **[dsh-local-ai](https://github.com/PerryLink/dsh-local-ai)** | DeepSeek Harness के लिए स्थानीय-मॉडल (Ollama) एकीकरण। | |
| **[dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions)** | भाषा सर्वरों पर LSP निदान, फ़ॉर्मेटिंग, पूर्णता, कोड क्रियाएँ और नाम बदलना | |
| **[dsh-mask](https://github.com/PerryLink/dsh-mask)** | PII मास्किंग मिडलवेयर: मॉडल सीमा पर अनाम करें, डिस्प्ले लेयर पर पुनर्स्थापित करें | |
| **[dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel)** | केवल-पढ़ने वाला MCP रनटाइम पैनल: /mcp कमांड + स्थिति, टूल और त्रुटियों वाला Settings टैब | |
| **[dsh-memento](https://github.com/PerryLink/dsh-memento)** | अनुमोदन-द्वारित क्रॉस-सत्र मेमोरी: ctx.memory सीम + SQLite + मेमोरी टूल | |
| **[dsh-observe](https://github.com/PerryLink/dsh-observe)** | DeepSeek Harness के लिए OpenTelemetry और Langfuse अवलोकनीयता निर्यातक। | |
| **[dsh-output-styles](https://github.com/PerryLink/dsh-output-styles)** | Claude Code outputStyles-समतुल्य रनटाइम शैली बदलाव | |
| **[dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules)** | ऑडिट के साथ Claude Code-शैली घोषणात्मक allow/deny/ask अनुमति नियम | |
| **[dsh-personal-directive](https://github.com/PerryLink/dsh-personal-directive)** | शीर्ष-बार टॉगल के साथ व्यक्तिगत निर्देश इंजेक्टर (फ्रेमवर्क संस्करण) |
| **[dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide)** | माँग पर एजेंट कौशल के रूप में प्लगइन-विकास ज्ञान आधार | |
| **[dsh-research-report](https://github.com/PerryLink/dsh-research-report)** | सामग्री-पता साक्ष्य और सीलबंद संस्करणों वाला सत्यापन-योग्य अनुसंधान-रिपोर्ट इंजन | |
| **[dsh-score](https://github.com/PerryLink/dsh-score)** | DeepSeek Harness प्लगिनों की बहु-आयामी गुणवत्ता स्कोरिंग। | |
| **[dsh-session-pin](https://github.com/PerryLink/dsh-session-pin)** | टिकाऊ क्रम के साथ वेब साइडबार में सत्र पिन करें | |
| **[dsh-session-sync](https://github.com/PerryLink/dsh-session-sync)** | DeepSeek Harness के लिए क्रॉस-डिवाइस सत्र सिंक — आपके सत्र स्टोर का एक समर्पित git मिरर। | |
| **[dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security)** | सुरक्षा-ऑडिट कौशल पैक: गुप्त स्कैन, निर्भरता और आपूर्ति-श्रृंखला समीक्षा | |
| **[dsh-talk](https://github.com/PerryLink/dsh-talk)** | DeepSeek Harness के लिए आवाज़-प्रथम सत्र लूप: बोलें और उत्तर सुनें। | |
| **[dsh-test-drive](https://github.com/PerryLink/dsh-test-drive)** | DeepSeek Harness प्लगिनों के लिए पृथक इंस्टॉल-एंड-स्मोक टेस्ट ड्राइव। | |
| **[dsh-translate](https://github.com/PerryLink/dsh-translate)** | DeepSeek Harness के लिए वेंडर पैरामीटर अनुवाद और नियतात्मक JSON मरम्मत। | |
| **[dsh-ticktick](https://github.com/PerryLink/dsh-ticktick)** | TickTick/Dida365 कार्य ब्रिज: सत्र-हेडर पैनल + 11 टूल |
| **[dsh-wechat](https://github.com/PerryLink/dsh-wechat)** | WeChat ↔ DSH ब्रिज (Tencent iLink bot): टेक्स्ट/इमेज/फ़ाइल/आवाज़, चैट में अनुमोदन |


## License

Apache-2.0। तृतीय-पक्ष सूचनाएँ [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) में।
