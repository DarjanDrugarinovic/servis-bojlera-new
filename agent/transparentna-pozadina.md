# Transparentna pozadina — izrezivanje proizvoda (cutout u PNG sa alfa kanalom)

Cilj: od fotografije proizvoda na **tamnoj/crnoj pozadini** napraviti PNG sa
**providnom pozadinom** (alfa kanal), da proizvod „lebdi" na sajtu (radi i na svetloj
i na tamnoj temi). Primer: `kapilarni-termostat.jpg` (kapilarni termostat na crnoj
pozadini) → `kapilarni-termostat.png` (providno).

> Preduslovi: Python + **cv2 + numpy** (instalacija: [`instalacija-alata.md`](./instalacija-alata.md)).
> Ovo je **drugačiji zadatak** od inpaintinga u [`hero-pozadina.md`](./hero-pozadina.md):
> inpaint *popunjava* pozadinu; ovde je *uklanjamo* i pravimo alfa masku (proziran/neproziran).

---

## 1. Zašto NE običan prag po tamnoći

Iako je pozadina skoro čisto crna (`gray ≈ 0`), **i sam proizvod ima tamne delove**
(crno plastično kućište termostata). Ako bismo rekli „svaki tamni piksel → providan",
pojeo bi i tu plastiku. Zato koristimo **segmentaciju prednjeg plana** (GrabCut), ne prag.

Pre svega proveri pozadinu i opseg tamnoće (da znaš pragove):

```python
import cv2, numpy as np
img = cv2.imread('kapilarni-termostat.jpg')
g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
print('uglovi (bg):', g[0,0], g[0,-1], g[-1,0], g[-1,-1])   # npr. 0 0 0 0 -> čista crna
print('udeo gray<8:', (g<8).mean(), '  <25:', (g<25).mean())
```

---

## 2. GrabCut sa „trimap" maskom

Trimap = svakom pikselu unapred dodelimo: sigurno-bg / sigurno-fg / verovatno.
GrabCut onda razreši „verovatno" zone (uključujući tamnu plastiku koja se „drži"
za svetli metal):

```python
import cv2, numpy as np
img = cv2.imread('kapilarni-termostat.jpg')
h, w = img.shape[:2]
g  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
S  = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[:,:,1]

mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)          # podrazumevano: verovatno bg
mask[g > 25] = cv2.GC_PR_FGD                              # iznad crne -> verovatno proizvod
mask[(g > 90) | ((S > 120) & (g > 40))] = cv2.GC_FGD     # svetli metal / zasićena žica = sigurno fg
mask[g < 8] = cv2.GC_BGD                                  # čista crna = sigurno bg

bgd = np.zeros((1,65), np.float64); fgd = np.zeros((1,65), np.float64)
cv2.grabCut(img, mask, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
fg = np.where((mask==cv2.GC_FGD) | (mask==cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
```

---

## 3. Čišćenje maske — najveća komponenta + popuna rupa

Difuzna senka na podu ume da ostane kao zaseban blob; uzmemo **najveću povezanu
komponentu** (proizvod), zatvorimo i popunimo rupe:

```python
n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
if n > 1:
    big = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    fg = np.where(lab == big, 255, 0).astype(np.uint8)
fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE,
                      cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7,7)))
ff = fg.copy(); m2 = np.zeros((h+2, w+2), np.uint8)
cv2.floodFill(ff, m2, (0,0), 255)                        # popuni rupe (flood spolja + invert)
fg = fg | cv2.bitwise_not(ff)
```

---

## 4. Alfa kanal + snimanje BGRA PNG-a (+ trim na bbox)

```python
alpha = cv2.GaussianBlur(fg, (3,3), 0)                   # blaga, meka ivica
bgra = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA); bgra[:,:,3] = alpha
ys, xs = np.where(fg > 0); pad = 12
x1, y1 = max(xs.min()-pad,0), max(ys.min()-pad,0)
x2, y2 = min(xs.max()+pad,w), min(ys.max()+pad,h)
cv2.imwrite('kapilarni-termostat.png', bgra[y1:y2, x1:x2])  # PNG čuva alfu (JPG NE!)
```

> **Bitno:** alfa se čuva samo u formatima sa providnošću — **PNG** (ili WebP), nikako JPG.

---

## 5. Provera providnosti (iz fajla, ne „na oko")

```python
im = cv2.imread('kapilarni-termostat.png', cv2.IMREAD_UNCHANGED)  # UNCHANGED da učita alfu
print('kanala:', im.shape[2])                              # mora 4 (BGRA)
a = im[:,:,3]
print('uglovi alfa:', a[0,0], a[0,-1], a[-1,0], a[-1,-1])  # treba 0 (providno)
print('udeo providnih:', (a==0).mean(), ' neprovidnih:', (a==255).mean())
```

Za vizuelnu proveru, kompozituj preko bele i preko boje kartice:

```python
for name, bg in [('_prev_white.png',(255,255,255)), ('_prev_card.png',(250,246,244))]:
    canvas = np.full((im.shape[0], im.shape[1], 3), bg[::-1], np.uint8)  # BGR
    a3 = im[:,:,3:4]/255.0
    cv2.imwrite(name, (im[:,:,:3]*a3 + canvas*(1-a3)).astype(np.uint8))
```

---

## 6. ⚠️ Zamka na strani sajta — providno ≠ „izgleda providno"

Čak i kad je PNG stvarno providan (uglovi alfa = 0), **na stranici može izgledati
neprovidno** ako iza njega stoji:
- `background-color` na elementu (npr. `var(--card2)`) → vidi se ta boja kroz providne piksele,
- gradient overlay (`::after`) preko slike → tamni dno/ivice.

Ako želiš da se *vidi* providnost (proizvod „lebdi" na pozadini stranice):
```css
.product-btn{
  background: url('kapilarni-termostat.png') center/contain no-repeat;
  background-color: transparent;   /* ukloni karticu iza */
}
/* ukloni i tamni ::after gradient; naslov stavi u čitljivu „pill" pozadinu */
```
> Tako smo i otkrili „grešku" — slika je od početka bila providna; karticu i gradient
> iza nje smo videli kao da pozadina nije uklonjena.

---

## 7. Kada ovo NE radi dobro (granice metode)

- **Proizvod i pozadina iste boje/tona bez ivice** (npr. crni proizvod na crnoj bez
  refleksije) → GrabCut nema za šta da se uhvati; tada ručno dodaj `GC_FGD`/`GC_BGD`
  poteze (slično maskama u [`hero-pozadina.md`](./hero-pozadina.md) §3) ili koristi
  `cv2.grabCut` sa pravougaonikom + par iteracija.
- **Providne/staklaste delove i fine žice** (npr. tanak kabl) meka ivica (`GaussianBlur`)
  čuva bolje nego oštar prag; po potrebi povećaj kernel.
- **Meka senka koju želiš da zadržiš** — nemoj uzimati samo najveću komponentu;
  umesto toga ostavi delimičnu alfu (ramp po svetlini) na zoni senke.

---

## 8. Sažet „cheat sheet"

1. Proveri da je pozadina stvarno tamna i koliki je opseg (`gray` uglovi/histogram).
2. **GrabCut + trimap** (sigurno-bg `g<8`, sigurno-fg svetli/zasićeni, ostalo verovatno).
3. **Najveća komponenta + popuna rupa** (otpada senka s poda).
4. **Alfa = maska**, snimi kao **PNG** (BGRA); JPG ne čuva providnost.
5. **Proveri iz fajla** (`IMREAD_UNCHANGED`, uglovi alfa = 0) + kompozit preko bele/kartice.
6. Na sajtu: `background-color: transparent`, bez tamnog overlay-a, da se providnost vidi.
7. Očisti `_*` privremene fajlove ([`instalacija-alata.md`](./instalacija-alata.md) §3).
