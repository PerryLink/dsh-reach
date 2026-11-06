#!/usr/bin/env python3
"""README visuals for dsh-reach — v5.

The plugin is a two-sided decision bridge, so neither figure is a node row:

* hero — the product moment: a permission card delivered into IM chat, answered
  with `1`, with the six channel registrations (and their real chat-id
  prefixes) on a routing rail beside the conversation.
* flow — a round-trip loop across a boundary: the DSH host (waterfalls and
  session events) on the left bank, the six IM channels on the right bank, the
  card-delivery lane on top, the decision-return lane on the bottom, and the
  pending ledger (P{n} / #token) holding the deferred promise in the middle.
  `④ SECURITY` sits first on the return lane, because every reply crosses the
  fail-closed gate before a card is settled.

Every label is a real seam, config key, prefix or number from `src/`,
`cordis.patch.yml` or the README: no invented features.
"""
import os
import re

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'assets')

FONT_CJK = r'C:\Windows\Fonts\msyh.ttc'
FONT_CJK_BOLD = r'C:\Windows\Fonts\msyhbd.ttc'
FONT_MONO = r'C:\Windows\Fonts\consola.ttf'
for _p in (FONT_CJK, FONT_CJK_BOLD, FONT_MONO):
    if not os.path.exists(_p):
        raise SystemExit(f'FATAL: font missing: {_p}')

# Shapes are composited at 2x and downsampled: crisp card edges and icons.
S = 2

SKIN = {
    'light': dict(bg_from='#f9f6fd', bg_to='#e4eaf8', card='#ffffff',
                  edge='#e2dff0', text='#141419', sub='#4d5261',
                  faint='#8f94a4', accent='#4B67B4', accent_soft='#ece9fa',
                  pill='#ece7f9', bubble='#f4f1fb', bubble_edge='#e6e0f3',
                  green='#16a34a', green_tint='#eaf7ef', on_accent='#ffffff',
                  shadow=(38, 30, 72), shadow_a=28),
    'dark': dict(bg_from='#131a2a', bg_to='#0c1016', card='#1b2231',
                 edge='#2e374b', text='#f0f3f9', sub='#a8b1c4',
                 faint='#737b8d', accent='#8496f5', accent_soft='#222c46',
                 pill='#242d42', bubble='#232c3f', bubble_edge='#303a50',
                 green='#3fb950', green_tint='#15281c', on_accent='#0c1016',
                 shadow=(0, 0, 0), shadow_a=120),
}


def font(size, kind='cjk_bold'):
    return ImageFont.truetype(
        {'cjk': FONT_CJK, 'cjk_bold': FONT_CJK_BOLD, 'mono': FONT_MONO}[kind],
        int(round(size)))


def hx(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(x + (y - x) * t) for x, y in zip(hx(a), hx(b)))


def gradient(w, h, c1, c2):
    base = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(base)
    for y in range(h):
        t = 0.18 * (y / h) + 0.82 * (y / h) ** 1.45
        d.line([(0, y), (w, y)], fill=mix(c1, c2, t))
    return base


def glow(img, cx, cy, r, color, alpha=48):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(12, 0, -1):
        rr = r * i / 12
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                  fill=color + (int(alpha * (1 - i / 13)),))
    layer = layer.filter(ImageFilter.GaussianBlur(30))
    return Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')


MEASURE = ImageDraw.Draw(Image.new('RGB', (8, 8)))


def tw(text, size, kind='cjk'):
    return MEASURE.textlength(text, font=font(size, kind))


class Layer:
    """Vector layer in design coordinates (1440x576), rasterised at 2x."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def refresh(self):
        self.d = ImageDraw.Draw(self.img)

    def rect(self, box, radius=0, fill=None, outline=None, width=1.0):
        self.d.rounded_rectangle([v * S for v in box], radius=radius * S,
                                 fill=fill, outline=outline,
                                 width=max(1, round(width * S)))

    def line(self, p1, p2, fill, width=1.0):
        self.d.line([p1[0] * S, p1[1] * S, p2[0] * S, p2[1] * S],
                    fill=fill, width=max(1, round(width * S)))

    def ellipse(self, box, fill=None, outline=None, width=1.0):
        self.d.ellipse([v * S for v in box], fill=fill, outline=outline,
                       width=max(1, round(width * S)))

    def arc(self, box, a0, a1, fill, width=1.0):
        self.d.arc([v * S for v in box], a0, a1, fill=fill,
                   width=max(1, round(width * S)))

    def shadow(self, box, radius=20, blur=14, color=(0, 0, 0), alpha=30,
               dy=10):
        sh = Image.new('RGBA', self.img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(sh)
        d.rounded_rectangle([box[0] * S, (box[1] + dy) * S, box[2] * S,
                             (box[3] + dy) * S], radius=radius * S,
                            fill=color + (alpha,))
        sh = sh.filter(ImageFilter.GaussianBlur(blur * S))
        self.img = Image.alpha_composite(self.img, sh)
        self.refresh()

    def flatten(self):
        return self.img.resize((self.w, self.h), Image.LANCZOS)


def text(d, xy, s, f, fill, anchor='ls'):
    d.text(xy, s, font=f, fill=hx(fill), anchor=anchor)


def fit(d, s, kind, start, maxw, floor=11):
    size = start
    while size > floor:
        f = font(size, kind)
        if d.textlength(s, font=f) <= maxw:
            return f, size
        size -= 1
    return font(floor, kind), floor


def draw_fit(d, xy, s, kind, start, maxw, fill, floor=11, what='label'):
    f, _ = fit(d, s, kind, start, maxw, floor)
    if d.textlength(s, font=f) > maxw + 0.5:
        raise SystemExit(f'FATAL: {what} overflows {maxw}px: {s!r}')
    text(d, xy, s, f, fill)
    return f


CJK_RUN = re.compile(r'([\u3000-\u9fff\uff00-\uffef]+)'
                     r'|([^\u3000-\u9fff\uff00-\uffef]+)')


def draw_mixed(d, x, y, s, size, fill):
    """ASCII in Consolas, CJK runs in Microsoft YaHei, same baseline."""
    for m in CJK_RUN.finditer(s):
        part = m.group(0)
        kind = 'cjk' if m.group(1) is not None else 'mono'
        f = font(size, kind)
        d.text((x, y), part, font=f, fill=hx(fill), anchor='ls')
        x += d.textlength(part, font=f)


def lock_icon(d, x, y, color):
    d.rounded_rectangle([x, y + 5, x + 14, y + 16], radius=3,
                        outline=hx(color), width=2)
    d.arc([x + 3, y - 1, x + 11, y + 9], 180, 360,
          fill=hx(color), width=2)
    d.ellipse([x + 6, y + 9, x + 8, y + 11], fill=hx(color))


def check_icon(d, x, y, color):
    d.line([x, y + 7, x + 4, y + 11], fill=hx(color), width=2)
    d.line([x + 4, y + 11, x + 12, y + 2], fill=hx(color), width=2)


# --------------------------------------------------------------------------
# hero: 1440x576
# --------------------------------------------------------------------------
HERO = {
    'zh': dict(
        kicker='DEEPSEEK HARNESS 插件 · IM 决策桥 · FROZEN',
        value=['任意工作区的审批卡，', '发到聊天里，回 1 / 2 就决定。'],
        sub=['微信 iLink · Telegram · 飞书，一条桥；',
             'QQ / 钉钉 / 企微走同一张注册表（v2 基础）。'],
        meta='P1 · P2 · #ab12cd · 白名单闭环 · reach_send',
        foot='Apache-2.0 · PerryLink DSH 插件家族 · v0.1.24 · FROZEN',
        rail_eyebrow='CHANNELS · adapterFor(chatId)',
        rail_names=['微信 iLink', 'Telegram', '飞书', 'QQ', '钉钉', '企微'],
        rail_subs=['catch-all · 0', 'numeric · 1', 'oc_ · 2',
                   'qq: · 3', 'dt: · 3', 'wc: · 3'],
        panel_title='dsh-reach · IM',
        panel_status='logged-in',
        source='approval/request',
        source_rest=' · 任意工作区 · 会话 8f2c1a',
        card_kind='权限卡 · P2',
        card_title='工具: shell',
        card_reply='回复 1 允许一次 · 2 拒绝',
        card_meta='#ab12cd · 任意工作区 · 会话 8f2c1a',
        card_timeout='cardTimeout 1800s',
        answer='1',
        answer_note='允许一次',
        receipt='已允许 shell（一次）。',
        receipt_sub='allowed-once · P2',
        status_left='队列 0 · sendBudget 10 / 60s · audit 200',
        status_right='先答者胜',
        rail_foot='6 通道 · 1 条决策桥',
    ),
    'en': dict(
        kicker='DEEPSEEK HARNESS PLUGIN · IM DECISION BRIDGE · FROZEN',
        value=["Every workspace's approval cards,",
               'answered inside IM chat with 1 / 2.'],
        sub=['WeChat iLink · Telegram · Feishu, one bridge;',
             'QQ / DingTalk / WeCom on the same registry.'],
        meta='P1 · P2 · #ab12cd · fail-closed allowlist · reach_send',
        foot='Apache-2.0 · PerryLink DSH plugin family · v0.1.24 · FROZEN',
        rail_eyebrow='CHANNELS · adapterFor(chatId)',
        rail_names=['WeChat iLink', 'Telegram', 'Feishu', 'QQ',
                    'DingTalk', 'WeCom'],
        rail_subs=['catch-all · 0', 'numeric · 1', 'oc_ · 2',
                   'qq: · 3', 'dt: · 3', 'wc: · 3'],
        panel_title='dsh-reach · IM',
        panel_status='logged-in',
        source='approval/request',
        source_rest=' · any workspace · session 8f2c1a',
        card_kind='Permission card · P2',
        card_title='Tool: shell',
        card_reply='Reply 1 allow once · 2 reject',
        card_meta='#ab12cd · any workspace · session 8f2c1a',
        card_timeout='cardTimeout 1800s',
        answer='1',
        answer_note='allow once',
        receipt='Allowed shell (once).',
        receipt_sub='allowed-once · P2',
        status_left='queue 0 · sendBudget 10 / 60s · audit 200',
        status_right='first reply wins',
        rail_foot='6 channels · one bridge',
    ),
}


def hero(lang, skin):
    """1440x576 banner: the pitch on the left, the IM card moment on the right."""
    s = SKIN[skin]
    H = HERO[lang]
    W, HT = 1440, 576
    img = gradient(W, HT, s['bg_from'], s['bg_to'])
    img = glow(img, 1160, 90, 430, hx(s['accent']),
               22 if skin == 'light' else 44)
    L = Layer(W, HT)

    # faint reach rings behind the conversation panel
    for r, op in ((318, 10), (256, 9), (196, 8)):
        L.ellipse((1178 - r, 262 - r, 1178 + r, 262 + r),
                  outline=hx(s['accent']) + (op,), width=1.2)

    # ------------------------------------------------------- channel rail
    rail_x, rail_w, rail_y, chip_h, gap = 744, 170, 80, 58, 8
    for i, (name, sub) in enumerate(zip(H['rail_names'], H['rail_subs'])):
        y = rail_y + i * (chip_h + gap)
        active = i == 0
        if active:
            L.shadow((rail_x, y, rail_x + rail_w, y + chip_h), radius=14,
                     blur=8, color=s['shadow'], alpha=s['shadow_a'], dy=5)
            L.rect((rail_x, y, rail_x + rail_w, y + chip_h), radius=15,
                   fill=hx(s['accent_soft']), outline=hx(s['accent']),
                   width=1.4)
            L.rect((rail_x, y + 12, rail_x + 3, y + chip_h - 12), radius=1.5,
                   fill=hx(s['accent']))
            L.ellipse((rail_x + 13, y + 25, rail_x + 22, y + 34),
                      fill=hx(s['accent']))
        else:
            L.rect((rail_x, y, rail_x + rail_w, y + chip_h), radius=15,
                   fill=hx(s['card']), outline=hx(s['edge']), width=1.1)
            L.ellipse((rail_x + 15, y + 27, rail_x + 20, y + 32),
                      fill=hx(s['faint']))

    # routing connector from the active channel into the panel
    L.line((rail_x + rail_w, 109), (932, 109), hx(s['accent']), 1.6)
    L.ellipse((928, 106, 936, 114), fill=hx(s['accent']))

    # ------------------------------------------------------ chat panel
    cb = (932, 56, 1380, 520)
    L.shadow(cb, radius=26, blur=16, color=s['shadow'],
             alpha=s['shadow_a'], dy=12)
    L.rect(cb, radius=26, fill=hx(s['card']), outline=hx(s['edge']), width=1.2)
    L.line((952, 106), (1360, 106), hx(s['edge']), 1.0)

    # header mark
    L.ellipse((956, 78, 970, 92), fill=hx(s['accent']))
    L.ellipse((961, 83, 965, 87), fill=hx(s['card']))
    L.ellipse((1288, 83, 1294, 89), fill=hx(s['green']))

    # source strip
    src_w = tw(H['source'], 10, 'mono') + 20
    L.rect((952, 118, 952 + src_w, 138), radius=10, fill=hx(s['pill']))

    # delivered card bubble
    L.rect((952, 150, 1332, 318), radius=18, fill=hx(s['bubble']),
           outline=hx(s['bubble_edge']), width=1.0)
    L.line((972, 260), (1312, 260), hx(s['bubble_edge']), 1.0)

    timeout_w = tw(H['card_timeout'], 10, 'mono') + 18
    L.rect((972, 292, 972 + timeout_w, 312), radius=10,
           fill=hx(s['pill']))

    # answer bubble
    L.rect((1176, 334, 1332, 388), radius=18, fill=hx(s['accent']))

    # receipt bubble
    L.rect((952, 402, 1248, 458), radius=16, fill=hx(s['green_tint']),
           outline=mix(s['green'], s['card'], 0.55), width=1.0)

    base = Image.alpha_composite(img.convert('RGBA'), L.flatten())
    d = ImageDraw.Draw(base)

    # ------------------------------------------------------- left column
    kx, ky = 60, 42
    kw = tw(H['kicker'], 15, 'cjk') + 34
    d.rounded_rectangle([kx, ky, kx + kw, ky + 34], radius=17,
                        fill=hx(s['pill']))
    text(d, (kx + 17, ky + 22), H['kicker'], font(15, 'cjk'), s['accent'])

    draw_fit(d, (kx, 206), 'dsh-reach', 'mono', 88, 650, s['text'],
             72, 'hero title')
    draw_fit(d, (kx, 288), H['value'][0], 'cjk_bold', 36, 650, s['text'],
             28, 'hero value 1')
    draw_fit(d, (kx, 336), H['value'][1], 'cjk_bold', 36, 650, s['text'],
             28, 'hero value 2')
    draw_fit(d, (kx, 396), H['sub'][0], 'cjk', 25, 650, s['sub'],
             20, 'hero sub 1')
    draw_fit(d, (kx, 426), H['sub'][1], 'cjk', 25, 650, s['sub'],
             20, 'hero sub 2')
    draw_mixed(d, kx, 474, H['meta'], 20, s['faint'])

    d.line([kx, 494, kx + 640, 494], fill=hx(s['edge']), width=2)
    draw_fit(d, (kx, 530), H['foot'], 'cjk', 16, 650, s['faint'],
             13, 'hero footer')

    # ------------------------------------------------------- rail text
    text(d, (744, 60), H['rail_eyebrow'], font(11, 'mono'), s['accent'])
    for i, (name, sub) in enumerate(zip(H['rail_names'], H['rail_subs'])):
        y = rail_y + i * (chip_h + gap)
        active = i == 0
        text(d, (772, y + 25), name, font(15, 'cjk_bold'),
             s['accent'] if active else s['text'])
        text(d, (772, y + 44), sub, font(10.5, 'mono'),
             s['accent'] if active else s['faint'])
    text(d, (744, 496), H['rail_foot'], font(11, 'cjk'), s['faint'])

    # ------------------------------------------------------- panel text
    text(d, (978, 89), H['panel_title'], font(15, 'cjk_bold'), s['text'])
    text(d, (1356, 89), H['panel_status'], font(10.5, 'mono'), s['green'],
         anchor='rs')

    text(d, (962, 133), H['source'], font(10, 'mono'), s['accent'])
    text(d, (952 + src_w + 10, 133), H['source_rest'],
         font(11, 'cjk'), s['faint'])

    lock_icon(d, 970, 170, s['accent'])
    text(d, (992, 185), H['card_kind'], font(12.5, 'cjk_bold'),
         s['accent'])
    text(d, (972, 220), H['card_title'], font(21, 'cjk_bold'), s['text'])
    text(d, (972, 248), H['card_reply'], font(13, 'cjk'), s['sub'])
    text(d, (972, 282), H['card_meta'], font(10.5, 'cjk'), s['faint'])
    text(d, (982, 306), H['card_timeout'], font(10, 'mono'), s['accent'])

    text(d, (1194, 373), H['answer'], font(24, 'cjk_bold'), s['on_accent'])
    text(d, (1224, 371), H['answer_note'], font(11, 'cjk'), s['on_accent'])

    check_icon(d, 970, 420, s['green'])
    text(d, (994, 432), H['receipt'], font(14, 'cjk_bold'), s['green'])
    text(d, (994, 449), H['receipt_sub'], font(10, 'mono'), s['faint'])

    text(d, (956, 486), H['status_left'], font(10.5, 'cjk'), s['faint'])
    text(d, (1356, 486), H['status_right'], font(10.5, 'cjk'), s['accent'],
         anchor='rs')

    path = os.path.join(OUT, f'dsh-reach-hero-{lang}-{skin}.webp')
    base.convert('RGB').save(path, 'WEBP', quality=92)
    print(f'dsh-reach-hero-{lang}-{skin}.webp')


# --------------------------------------------------------------------------
# flow: 1100x660
# --------------------------------------------------------------------------
FLOW = {
    'light': dict(bg1='#f9f6fd', bg2='#e4eaf8', dots='#ddd6ee',
                  card='#ffffff', edge='#e2dff0', text='#141419',
                  sub='#4d5261', faint='#8f94a4', accent='#4B67B4',
                  accent_soft='#f1eefb', pill='#ece7f9', grid='#e6e1f2',
                  green='#16a34a', warn='#bc4c00', danger='#c02b2b',
                  shadow='#1b1735', shadow_op='.09'),
    'dark': dict(bg1='#131a2a', bg2='#0c1016', dots='#1c2536',
                 card='#1b2231', edge='#2e374b', text='#f0f3f9',
                 sub='#a8b1c4', faint='#737b8d', accent='#8496f5',
                 accent_soft='#1e2740', pill='#242d42', grid='#1b2434',
                 green='#3fb950', warn='#d29922', danger='#f87171',
                 shadow='#000000', shadow_op='.55'),
}

SANS = ("ui-sans-serif, system-ui, -apple-system, 'Segoe UI', "
        "'Microsoft YaHei', 'PingFang SC', sans-serif")
MONO = ("ui-monospace, SFMono-Regular, 'Cascadia Mono', Consolas, "
        "'Microsoft YaHei', monospace")


def esc(body):
    return (str(body).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;'))


def flow_svg(skin):
    """1100x660: two banks, a top delivery lane, a bottom return lane, and
    the pending ledger in the middle — a loop, not a pipeline row."""
    s = FLOW[skin]
    W, H = 1100, 660
    lines = []
    add = lines.append

    def t(x, y, body, size=11.5, fill=None, weight='400', family=SANS,
          anchor='start', opacity=None, extra=''):
        op = f' opacity="{opacity}"' if opacity else ''
        add(f'<text x="{x}" y="{y}" fill="{fill or s["text"]}" '
            f'font-family="{family}" font-size="{size}" font-weight="{weight}" '
            f'text-anchor="{anchor}"{op}{extra}>{esc(body)}</text>')

    def cw(body, size, mono=True):
        return len(body) * size * (0.60 if mono else 0.53)

    def box(x, y, w, h, r=18, fill=None, sw=1.2, stroke=None):
        add(f'<g filter="url(#soft)"><rect x="{x}" y="{y}" width="{w}" '
            f'height="{h}" rx="{r}" fill="{fill or s["card"]}" '
            f'stroke="{stroke or s["edge"]}" stroke-width="{sw}"/></g>')

    def chip(x, y, body, size=11, mono=True, fg=None, bg=None, h=24, padx=8):
        w = cw(body, size, mono) + padx * 2
        add(f'<rect x="{x:.1f}" y="{y}" width="{w:.1f}" height="{h}" '
            f'rx="{h / 2}" fill="{bg or s["pill"]}"/>')
        t(x + padx, y + h / 2 + size * 0.35, body, size, fg or s['accent'],
          '400', MONO if mono else SANS)
        return w

    def eyebrow(x, y, body):
        t(x, y, body, 11, s['accent'], '700', MONO,
          extra=' letter-spacing="1.1"')

    add(f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="dsh-reach structure: a two-sided decision bridge. On the left, the DSH host emits approval/request, user-questions/request, session/event and reach_send; the top lane captures the card, renders P-number plus #token, queues it per user under a send budget, and adapterFor(chatId) delivers it to one of six IM channels on the right. The reply crosses the fail-closed security gate, the decision parser chooses a target card, and the held promise is settled; the pending ledger in the middle holds the deferred card while it waits, with timeout and dispose exits.">
<title>dsh-reach: one card, one round trip across the host/IM boundary</title>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{s['bg1']}"/>
    <stop offset="1" stop-color="{s['bg2']}"/>
  </linearGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="180%">
    <feDropShadow dx="0" dy="7" stdDeviation="10" flood-color="{s['shadow']}" flood-opacity="{s['shadow_op']}"/>
  </filter>
  <pattern id="dots" width="30" height="30" patternUnits="userSpaceOnUse">
    <circle cx="1.4" cy="1.4" r="1.4" fill="{s['dots']}"/>
  </pattern>
  <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="{s['accent']}"/>
  </marker>
</defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>
<rect width="{W}" height="{H}" fill="url(#dots)" opacity=".45"/>''')

    # ------------------------------------------------------------ header
    t(40, 46, 'dsh-reach', 26, s['text'], '700', MONO)
    t(40, 71, 'one card, one round trip — the bridge, both directions',
      12.5, s['sub'])
    t(1060, 44, 'TWO-SIDED BOUNDARY · LOOPBACK', 11, s['accent'], '700',
      MONO, 'end', extra=' letter-spacing="1.1"')
    t(1060, 67, '6 channels · 1 pending ledger · fail-closed', 11,
      s['faint'], '400', MONO, 'end')

    # ------------------------------------------------------------ panels
    box(40, 112, 230, 486, 22)
    box(830, 112, 230, 486, 22)

    # left: DSH host sources
    eyebrow(60, 140, 'DSH HOST · SOURCES')
    rows = [
        ('approval/request', 'permission card · deferred answerer'),
        ('user-questions/request', 'question card · same held promise'),
        ('session/event', 'assistant replies · turn end'),
        ('reach_send / reachPush', 'proactive push · loopback HTTP'),
    ]
    y = 182
    for name, sub in rows:
        add(f'<circle cx="52" cy="{y - 4}" r="2.6" fill="{s["accent"]}"/>')
        t(64, y, name, 13, s['text'], '700', MONO)
        t(64, y + 18, sub, 11, s['faint'])
        add(f'<line x1="56" y1="{y + 30}" x2="254" y2="{y + 30}" '
            f'stroke="{s["edge"]}" stroke-width="1"/>')
        y += 60

    eyebrow(56, 438, 'NATIVE OUTCOME · GUI CHAIN')
    chip_rows = [
        [('allowed-once', s['green']), ('rejected', s['danger'])],
        [('cancelled', s['warn']), ('unavailable', s['faint'])],
    ]
    for row, yy in enumerate((452, 484)):
        x = 56
        for label, col in chip_rows[row]:
            w = cw(label, 11) + 18
            add(f'<rect x="{x}" y="{yy}" width="{w:.1f}" height="24" '
                f'rx="12" fill="{s["pill"]}"/>')
            t(x + 9, yy + 16, label, 11, col, '700', MONO)
            x += w + 8
    t(56, 540, 'first reply wins · GUI parallel', 11, s['sub'])
    t(56, 564, "timeout: next() / 'rejected'", 11, s['faint'], '400', MONO)
    t(56, 586, "dispose → 'unavailable'", 11, s['faint'], '400', MONO)

    # right: IM channel registry
    eyebrow(850, 140, 'IM CHANNELS · ROUTING')
    channels = [
        ('WeChat iLink', '0 · catch-all'),
        ('Telegram', '1 · numeric'),
        ('Feishu', '2 · oc_'),
        ('QQ', '3 · qq:'),
        ('DingTalk', '3 · dt:'),
        ('WeCom', '3 · wc:'),
    ]
    y = 184
    for idx, (name, pattern) in enumerate(channels):
        t(850, y, name, 13, s['text'], '700', MONO)
        t(1046, y, pattern, 11, s['faint'], '400', MONO, 'end')
        if idx < len(channels) - 1:
            add(f'<line x1="850" y1="{y + 24}" x2="1046" y2="{y + 24}" '
                f'stroke="{s["edge"]}" stroke-width="1"/>')
        y += 48
    add(f'<line x1="850" y1="456" x2="1046" y2="456" '
        f'stroke="{s["edge"]}" stroke-width="1.2"/>')
    t(850, 480, 'adapterFor(chatId)', 13, s['accent'], '700', MONO)
    t(850, 500, 'priority scan · first match', 11, s['sub'])
    t(850, 526, 'monitor held by the bridge', 11, s['sub'])
    t(850, 548, 'unknown sender → audited', 11, s['faint'])
    t(850, 570, 'v2: qq: · dt: · wc:', 11, s['faint'], '400', MONO)

    # ------------------------------------------------------ outbound lane
    eyebrow(292, 140, 'OUTBOUND · CARD DELIVERY')
    t(808, 140, 'approval/request → adapter.send', 10.5, s['faint'], '400',
      MONO, 'end')

    box(292, 158, 160, 124)
    box(470, 158, 160, 124)
    box(648, 158, 160, 124)

    cards = [
        (292, '01 CAPTURE', 'Capture',
         ['deferred answerer', '#token · 6 hex'], 'P{n} on admit'),
        (470, '02 RENDER', 'Render',
         ['P{n} · card text', 'workspace · session'], 'timeout 1800s'),
        (648, '03 OUTBOX', 'Queue',
         ['per-user FIFO', 'budget 10 / 60s'], 'fail → requeue'),
    ]
    for x, eb, title, detail, badge in cards:
        t(x + 16, 180, eb, 11, s['accent'], '700', MONO,
          extra=' letter-spacing="0.8"')
        t(x + 16, 208, title, 17, s['text'], '700', SANS)
        t(x + 16, 232, detail[0], 11, s['sub'], '400', MONO)
        t(x + 16, 252, detail[1], 11, s['faint'], '400', MONO)
        chip(x + 16, 260, badge, 11, True, s['accent'], s['pill'], 18, 7)

    # gaps between the boxes are short: small, explicit arrows
    for x0, x1 in ((452, 470), (630, 648)):
        add(f'<line x1="{x0}" y1="220" x2="{x1 - 2}" y2="220" '
            f'stroke="{s["accent"]}" stroke-width="2" marker-end="url(#a)"/>')
    add(f'<line x1="270" y1="220" x2="290" y2="220" '
        f'stroke="{s["accent"]}" stroke-width="2.2" marker-end="url(#a)"/>')
    add(f'<line x1="808" y1="220" x2="828" y2="220" '
        f'stroke="{s["accent"]}" stroke-width="2.4" marker-end="url(#a)"/>')

    # ------------------------------------------------------ pending ledger
    add(f'<rect x="292" y="306" width="516" height="92" rx="18" '
        f'fill="{s["accent_soft"]}" stroke="{s["accent"]}" '
        f'stroke-opacity=".42" stroke-width="1.2"/>')
    eyebrow(312, 330, 'PENDING LEDGER · HELD PROMISE')
    x = 312
    for label, w in (('P1', 34), ('P2', 34), ('P3', 34), ('#ab12cd', 66)):
        add(f'<rect x="{x}" y="342" width="{w}" height="24" rx="12" '
            f'fill="{s["card"]}" stroke="{s["edge"]}" stroke-width="1"/>')
        t(x + 8, 358, label, 11, s['text'], '700', MONO)
        x += w + 8
    t(312, 388, 'delivered markers ≤ 1000 · first reply wins', 11, s['sub'])
    t(788, 352, 'cardTimeout 1800s', 11, s['faint'], '400', MONO, 'end')
    t(788, 374, 'delegate · reject · wait', 11, s['faint'], '400', MONO,
      'end')
    t(788, 392, 'audit tail 200', 11, s['faint'], '400', MONO, 'end')

    # dashed state links inside the loop
    add(f'<line x1="546" y1="282" x2="546" y2="304" stroke="{s["accent"]}" '
        f'stroke-width="1.6" stroke-dasharray="5 4" opacity=".65" '
        f'marker-end="url(#a)"/>')
    t(536, 298, 'hold', 11, s['faint'], '400', MONO, 'end')
    add(f'<line x1="370" y1="398" x2="370" y2="446" stroke="{s["accent"]}" '
        f'stroke-width="1.6" stroke-dasharray="5 4" opacity=".65" '
        f'marker-end="url(#a)"/>')
    t(360, 426, 'settle', 11, s['faint'], '400', MONO, 'end')

    # ------------------------------------------------------ inbound lane
    t(808, 430, 'INBOUND · DECISION RETURN', 11, s['accent'], '700', MONO,
      'end', extra=' letter-spacing="1.1"')

    box(648, 448, 160, 124)
    box(470, 448, 160, 124)
    box(292, 448, 160, 124)

    return_cards = [
        (648, '04 SECURITY', 'Gate',
         ['owner = first sender', 'no allowlist = deny'], 'authCode suffix'),
        (470, '05 DECIDE', 'Parse',
         ['1 / 2 · P1=1', '#ab12cd=…'], 'bare guard on 2+'),
        (292, '06 SETTLE', 'Resolve',
         ['resolve(outcome)', 'delegate → next()'], 'abort → cancelled'),
    ]
    for x, eb, title, detail, badge in return_cards:
        t(x + 16, 470, eb, 11, s['accent'], '700', MONO,
          extra=' letter-spacing="0.8"')
        t(x + 16, 498, title, 17, s['text'], '700', SANS)
        t(x + 16, 522, detail[0], 11, s['sub'], '400', MONO)
        t(x + 16, 542, detail[1], 11, s['sub'], '400', MONO)
        chip(x + 16, 550, badge, 11, True, s['accent'], s['pill'], 18, 7)

    # arrows on the return lane point left, back toward the host
    add(f'<line x1="828" y1="510" x2="810" y2="510" '
        f'stroke="{s["accent"]}" stroke-width="2.4" marker-end="url(#a)"/>')
    for x0, x1 in ((648, 632), (470, 454)):
        add(f'<line x1="{x0}" y1="510" x2="{x1 + 2}" y2="510" '
            f'stroke="{s["accent"]}" stroke-width="2" marker-end="url(#a)"/>')
    add(f'<line x1="290" y1="510" x2="272" y2="510" '
        f'stroke="{s["accent"]}" stroke-width="2.2" marker-end="url(#a)"/>')

    # ------------------------------------------------------------ footer
    add(f'<line x1="40" y1="636" x2="1060" y2="636" stroke="{s["grid"]}"/>')
    t(40, 652, 'solid = card out / decision back · dashed = to/from the '
               'pending ledger · decision replies are consumed, not forwarded',
      11, s['faint'])
    t(1060, 652, 'src/bridge.ts · decision.ts · security.ts', 10.5,
      s['faint'], '400', MONO, 'end')

    add('</svg>')
    path = os.path.join(OUT, f'dsh-reach-flow-v5-{skin}.svg')
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(lines) + '\n')
    print(f'dsh-reach-flow-v5-{skin}.svg')


def main():
    os.makedirs(OUT, exist_ok=True)
    for skin in ('light', 'dark'):
        for lang in ('zh', 'en'):
            hero(lang, skin)
        flow_svg(skin)


if __name__ == '__main__':
    main()
