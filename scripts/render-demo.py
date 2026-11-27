#!/usr/bin/env python3
"""Cut the EdgeGlass demo from real simulator frames (video/capture) + VO + music."""
import json, subprocess, os, bisect
from PIL import Image, ImageDraw, ImageFont

V = '/workspace/even-realities/video'
CAP = f'{V}/capture'
W, H, FPS = 1920, 1080, 30
F = '/usr/share/fonts/truetype/dejavu/'
font = lambda n, s: ImageFont.truetype(F + n, s)
f_cap, f_small, f_big, f_mid, f_key = font('DejaVuSans.ttf', 34), font('DejaVuSans.ttf', 24), font('DejaVuSans-Bold.ttf', 72), font('DejaVuSans.ttf', 40), font('DejaVuSans-Bold.ttf', 30)
GREEN = (60, 255, 120)

frames = [json.loads(l) for l in open(f'{CAP}/frames.jsonl')]
ftimes = [f['t'] for f in frames]
inputs = [json.loads(l) for l in open(f'{CAP}/timeline.jsonl')]
inputs = [e for e in inputs if e['label'] == 'input']
LABEL = {'down': 'swipe ↓', 'up': 'swipe ↑', 'click': 'tap', 'double_click': 'double-tap', 'long_press': 'hold · mic on',
         'long_press_release': 'release · send', 'context_menu': 'menu'}

def vo(k): return f'{V}/work/vo/{k}.mp3'
def dur(p): return float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',p],capture_output=True,text=True).stdout)

# (key, kind, src_start, src_end, length, vo_offset, caption)
S = [
 ('s01','card',None,None,6.6,0.6,None),
 ('s02','src',11.2,19.9,None,0.3,'EdgeGlass · trading-session HUD for Even G2 · Crypto & DeFi + Messaging'),
 ('s03','src',19.9,35.4,None,0.3,'Live Polymarket UP price · 1-min move · time left · Hyperliquid mid · edge'),
 ('s04','src',35.4,43.8,None,0.3,'Tap → paper confirm, max loss on screen → tap → filled  (paper fill 68636e1e…)'),
 ('s05','src',43.8,57.5,None,3.4,'Hold: “Long BTC, twenty.” → Whisper on our Worker → confirm → tap  (fill 4af58b60…)'),
 ('s06','src',57.5,71.3,None,6.6,'“Buy up, fifty.” → blocked by the $50/day paper cap → swipe cancels'),
 ('s07','src',71.3,80.4,None,1.6,'Positions · paper ledger (+ read-only Polymarket / Hyperliquid wallets once linked)'),
 ('s08','src',80.4,89.6,None,1.8,'What moved · all 4 markets ranked by their 1-minute move'),
 ('s09','src',89.6,101.0,None,0.4,'Pair with @EdgeGlass_bot by code (no Google sign-in on G2) · alerts while the app is closed'),
 ('s10','card',None,None,9.4,0.6,None),
 ('s11','card',None,None,6.4,0.4,None),
]
CMDS = [(f'{V}/work/cmd1.wav', 44.469), (f'{V}/work/cmd2.wav', 57.952)]

plan, t = [], 0.0
for key, kind, a, b, L, off, cap in S:
    if L is None: L = max(b - a, off + dur(vo(key)) + 0.6)
    plan.append(dict(key=key, kind=kind, a=a, b=b, L=L, off=off, cap=cap, t0=t))
    t += L
TOTAL = t
print('total', round(TOTAL, 2))

cache = {}
def glasses(path):
    if path not in cache:
        a = Image.open(f'{CAP}/frames/{path}').convert('RGBA').split()[3]
        g = Image.merge('RGB', (a.point(lambda v: v * 0.25), a, a.point(lambda v: v * 0.45)))
        cache.clear() if len(cache) > 60 else None
        cache[path] = g.resize((1440, 720), Image.NEAREST)
    return cache[path]

def frame_at(st):
    i = bisect.bisect_right(ftimes, st) - 1
    return frames[max(i, 0)]['f']

def text_center(d, y, s, f, fill=(235,235,235)):
    w = d.textlength(s, font=f); d.text(((W - w) / 2, y), s, font=f, fill=fill)

def card(key, lt):
    im = Image.new('RGB', (W, H), (6, 10, 8)); d = ImageDraw.Draw(im)
    if key == 's01':
        text_center(d, 380, '15-minute crypto markets move in seconds.', f_big, GREEN)
        text_center(d, 500, 'Phone in hand = window missed.', f_mid)
    elif key == 's10':
        text_center(d, 200, 'Safety', f_big, GREEN)
        rows = ['Paper by default · hard $50/day cap · max loss on every confirm',
                'Voice and tap always stop on a confirm card',
                'Wallets are read-only · no keys in the app (Worker secrets only)',
                'Telegram messages never stored, never sent to any AI · /forget',
                'Data: Polymarket + Hyperliquid public APIs only · not financial advice']
        for i, r in enumerate(rows): text_center(d, 360 + i * 70, r, f_mid)
    else:
        text_center(d, 300, 'EdgeGlass', f_big, GREEN)
        text_center(d, 420, 'github.com/yayguru/edgeglass', f_mid)
        text_center(d, 480, 'edgeglass.merjkerm.workers.dev · com.yayguru.edgeglass (.ehpk)', f_mid)
        text_center(d, 560, 'Even Realities G2 hackathon · 02 Crypto & DeFi + 01 Messaging & News', f_cap, (190,190,190))
        text_center(d, 640, 'Not financial advice · paper / testnet only', f_cap, (190,190,190))
    return im

def src_frame(p, lt):
    st = p['a'] + min(lt, p['b'] - p['a'])
    im = Image.new('RGB', (W, H), (6, 10, 8)); d = ImageDraw.Draw(im)
    d.rectangle((236, 86, 1684, 814), outline=(40, 90, 55), width=4)
    im.paste(glasses(frame_at(st)), (240, 90))
    d.text((240, 34), 'Even Hub simulator · 576×288 glasses view (scaled) · live data from the production Worker', font=f_small, fill=(150,150,150))
    d.text((1684 - d.textlength('27 Nov 2026', font=f_small), 34), '27 Nov 2026', font=f_small, fill=(150,150,150))
    for e in inputs:
        if 0 <= st - e['t'] < 1.3:
            s = LABEL.get(e['action'], e['action'])
            w = d.textlength(s, font=f_key)
            d.rounded_rectangle((1684 - w - 40, 830, 1684, 884), 12, fill=(20, 70, 40))
            d.text((1684 - w - 20, 838), s, font=f_key, fill=(220, 255, 230))
    if p['cap']:
        d.rectangle((0, 920, W, 1010), fill=(14, 22, 17))
        text_center(d, 944, p['cap'], f_cap)
    return im

def fade(im, lt, L):
    a = min(1, lt / 0.25, (L - lt) / 0.25)
    return im if a >= 1 else Image.blend(Image.new('RGB', (W, H)), im, max(a, 0))

silent = f'{V}/work/silent.mp4'
if os.environ.get('SKIP_VIDEO') != '1':
  ff = subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',
                       '-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p',silent], stdin=subprocess.PIPE)
  n = int(round(TOTAL * FPS))
  for i in range(n):
    t = i / FPS
    p = next(x for x in reversed(plan) if x['t0'] <= t)
    lt = t - p['t0']
    im = card(p['key'], lt) if p['kind'] == 'card' else src_frame(p, lt)
    ff.stdin.write(fade(im, lt, p['L']).tobytes())
  ff.stdin.close(); ff.wait()

# audio: VO + real voice-command clips at their capture times + quiet music bed
ins, filt, labels = [], [], []
for j, p in enumerate(plan):
    ins += ['-i', vo(p['key'])]; ms = int((p['t0'] + p['off']) * 1000)
    filt.append(f'[{j+1}:a]aresample=44100,adelay={ms}|{ms},volume=1.0[v{j}]'); labels.append(f'[v{j}]')
k = len(plan)
for path, ct in CMDS:
    p = next(x for x in plan if x['kind'] == 'src' and x['a'] <= ct < x['b'])
    ms = int((p['t0'] + ct - p['a']) * 1000)
    ins += ['-i', path]; filt.append(f'[{k+1}:a]aresample=44100,adelay={ms}|{ms},volume=0.9[c{k}]'); labels.append(f'[c{k}]'); k += 1
ins += ['-i', f'{V}/work/music.mp3']
filt.append(f'[{k+1}:a]aresample=44100,atrim=0:{TOTAL:.2f},volume=0.10,afade=t=in:d=1.5,afade=t=out:st={TOTAL-2.5:.2f}:d=2.5[m]'); labels.append('[m]')
filt.append(''.join(labels) + f'amix=inputs={len(labels)}:normalize=0:duration=longest,atrim=0:{TOTAL:.2f},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100[a]')
out = f'{V}/edgeglass-demo.mp4'
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',silent,*ins,'-filter_complex',';'.join(filt),'-map','0:v','-map','[a]',
                '-c:v','copy','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',out], check=True)
print('wrote', out)
