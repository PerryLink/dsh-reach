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

## License

Apache-2.0। तृतीय-पक्ष सूचनाएँ [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) में।
