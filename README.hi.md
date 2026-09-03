# dsh-reach

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) के लिए मल्टी-चैनल निर्णय व रिमोट-कंट्रोल ब्रिज: किसी भी वर्कस्पेस के अनुमोदन/प्रश्न कार्ड को IM चैनलों (पहले WeChat iLink) पर भेजता है और चैट से उत्तर देना संभव बनाता है — साथ में सेशन कंसोल, प्रति-चैनल सुरक्षा और एक खुली पुश सेवा।

> **स्थिति: Phase 0 स्कैफ़ोल्ड (v0.1.0)।** डिज़ाइन योजना, प्रतिस्पर्धी शोध,
> आधिकारिक कॉन्ट्रैक्ट सत्यापन और चरणबद्ध रोडमैप
> [`docs/design/03-rebuild-direction-and-plan.md`](docs/design/03-rebuild-direction-and-plan.md) में हैं।
> WeChat चैनल पोर्ट और निर्णय ब्रिज Phase 1 में आएँगे।

## Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-reach
dsh1024 plugin --profile web add dsh-reach
```

इंस्टॉल के बाद DSH पुनः प्रारंभ करें (bundle पैच स्टार्टअप पर लागू होते हैं)।

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

## License

Apache-2.0। तृतीय-पक्ष सूचनाएँ [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) में।
