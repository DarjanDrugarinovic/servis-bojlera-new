# Pravljenje „pixel-perfect" sajta iz slike (mockup → HTML)

Ovaj dokument opisuje ceo proces pravljenja HTML stranice koja **izgleda identično**
kao zadata slika dizajna (`app.jpg`), sa posebnim fokusom na **mobilni prikaz**.
Služi kao kontekst za buduće sajtove koje ćemo praviti na isti način.

Konkretan primer: `metalac/ai-sajt-slika/app.jpg` (740×1600) → `metalac/darjan-sajt/index.html`.

> Platforma: **Windows 11**, shell **PowerShell** (primarni) + **Git Bash**.
> Alati: **Chrome DevTools (MCP)** za render/screenshot, **OpenCV + Pillow** za isecanje
> delova slike, **Python 3.11**.

> Povezani dokument: [`rad-sa-slikom.md`](./rad-sa-slikom.md) — detaljnije o OpenCV
> kropovanju, inpaintingu i alternativnim alatima (`System.Drawing`, Edge headless).

---

## 1. Ključni princip — ne crtaj ono što možeš da isečeš

Najvažnija lekcija celog procesa:

> **Layout, tekst, dugmad i ikone → praviti u HTML/CSS-u.
> Složene fotografije proizvoda → iseći direktno iz `app.jpg` pomoću OpenCV-a.**

Zašto:
- **HTML/CSS za strukturu** = tekst je selektabilan, lako se menja, oštar na svim
  rezolucijama, lagan. Idealno za: header, naslove, liste, dugmad, trake, footer.
- **Isečene slike za fotografije** = bojler, grejač, termostat, ventil, elektronika,
  PCB… nemoguće je verno odraditi kroz CSS/SVG, a pokušaj daje „crtani" izgled koji
  odmah odaje da nije original. Isecanjem iz mockup-a dobijamo **piksel-identičan**
  proizvod bez ikakvog truda oko senki/refleksija.

Ranije smo te slike pokušavali da odradimo kao SVG (bojler kao gradijent + krugovi,
termostat kao sat…) — izgledalo je „ok" ali ne identično. Čim smo ih zamenili
isečcima iz `app.jpg`, te sekcije su postale 1:1 sa dizajnom.

---

## 2. Priprema — dimenzije i „mapa sekcija"

### 2.1 Dimenzije slike

```powershell
python -c "from PIL import Image; im=Image.open(r'...\app.jpg'); print(im.size)"
# -> (740, 1600)
```

Renderujemo stranicu na **tačno toj širini (740px)** da bi poređenje bilo 1:1
(1 px slike = 1 px stranice). `.wrap { max-width: 740px; }`.

### 2.2 Pronalaženje granica sekcija (tamne trake)

Dizajn ima tamne navy trake (header, stats, CTA). Njih je lako detektovati po
svetlini reda — tako dobijamo tačne `y` granice svih sekcija bez ručnog merenja:

```python
import numpy as np
from PIL import Image
app = np.array(Image.open(r'...\app.jpg').convert('RGB'))
prev = False
for y in range(app.shape[0]):
    dark = (app[y].mean(axis=1) < 70).mean()   # udeo tamnih piksela u redu
    cur = dark > 0.45
    if cur != prev:
        print(('START' if cur else 'end  '), 'tamna traka @ y=', y)
        prev = cur
```

Za `app.jpg` dobili smo:
| Sekcija | y opseg | visina |
|--------|---------|-------|
| Header (navy) | 0–102 | 102 |
| Hero (svetlo) | 102–643 | 541 |
| Stats traka (navy) | 643–798 | 155 |
| Kvarovi + Modeli | 798–~1410 | — |
| CTA traka (plavo) | ~1410–1500 | ~90 |
| Footer (svetlo) | 1500–1600 | 100 |

Ove brojeve direktno koristimo kao `min-height`, paddinge i pozicije u CSS-u.

---

## 3. Isecanje slika proizvoda iz `app.jpg` (OpenCV)

Cilj: izvući svaku fotografiju proizvoda kao zaseban PNG, automatski „uokviren"
(trim na sadržaj), i sačuvati u `darjan-sajt/assets/`.

### 3.1 Provera / instalacija biblioteka

```powershell
python -c "import cv2,numpy,PIL; print('cv2',cv2.__version__)"
# ako fali:
python -m pip install --quiet opencv-python-headless numpy pillow
```

> `opencv-python-headless` — bez GUI zavisnosti; slike čuvamo na disk
> (`cv2.imwrite`), ne prikazujemo u prozoru.

### 3.2 Detekcija kolona (gde su granice kartica)

Kartice su u 4-kolonskoj mreži na **belim** karticama, razdvojene **svetlo-sivim**
razmakom (`#eef1f5`). Granice kolona nalazimo tako što tražimo kolone koje su
„razmak-siva" kroz ceo vertikalni opseg slika:

```python
import cv2, numpy as np
app = cv2.imread(r'...\app.jpg')   # BGR!

def gaps(y1, y2):
    band = app[y1:y2].astype(int)
    gray = np.array([245, 242, 238])             # BGR boja razmaka
    dist = np.abs(band - gray).sum(axis=2)
    colgray = (dist < 22).mean(axis=0)            # udeo "razmak" piksela po koloni
    isgap = colgray > 0.6
    runs, s = [], None
    for x, v in enumerate(isgap):
        if v and s is None: s = x
        if not v and s is not None:
            if x - s > 5: runs.append((s, x)); s = None
    return runs

print(gaps(865, 950))   # vertikalni opseg gde su slike u karticama
# -> razmaci na x ~27-35, ~186-204, ~357-364, ~526-534, ~704-711
```

Iz razmaka izvodimo kolone kartica:
```python
cols = [(35,186), (204,357), (364,526), (534,704)]
```

### 3.3 Iseci + automatski „trim" na sadržaj + sačuvaj

Ključ je `trim_save`: iz pravougaonog regiona nađe **bounding box** ne-belog
sadržaja (proizvod), opseče tesno uz mali padding i sačuva PNG. Pošto su i izvorne
kartice i naše kartice bele, isečak se besšavno uklapa (object-fit: contain centrira).

```python
import cv2, numpy as np, os
app = cv2.imread(r'...\app.jpg')
OUT = r'...\darjan-sajt\assets'
cols = [(35,186),(204,357),(364,526),(534,704)]

def trim_save(region, name, pad=6):
    nonbg = ~(region.min(axis=2) > 232)           # piksel nije ~beo => sadržaj
    ys, xs = np.where(nonbg)
    if len(xs):
        x1, x2 = max(xs.min()-pad,0), min(xs.max()+pad, region.shape[1])
        y1, y2 = max(ys.min()-pad,0), min(ys.max()+pad, region.shape[0])
        region = region[y1:y2, x1:x2]
    cv2.imwrite(os.path.join(OUT, name), region, [cv2.IMWRITE_PNG_COMPRESSION, 6])

# Kvarovi (y 862-952) — grejač, termostat, ventil, elektronika
for (x1,x2), n in zip(cols, ['grejac.png','termostat.png','ventil.png','elektronika.png']):
    trim_save(app[862:952, x1:x2], n)

# Modeli (y 1108-1232) — 4 bojlera
for (x1,x2), n in zip(cols, ['hydra.png','sirius.png','orion.png','taurus.png']):
    trim_save(app[1108:1232, x1:x2], n)

# Heater element (originalni delovi)
trim_save(app[1295:1400, 430:715], 'heater.png', 4)
```

### 3.4 Izolacija po boji (kad „trim" pokupi višak)

Plavi štit je bio blizu teksta „ORIGINALNI DELOVI", pa ga je `trim_save` pokupio.
Rešenje: bounding box računaj **samo od plavih piksela** (B visok, R nizak):

```python
reg = app[1298:1382, 40:150]
b, g, r = reg[:,:,0].astype(int), reg[:,:,1].astype(int), reg[:,:,2].astype(int)
blue = (b > 80) & (r < 120) & (b - r > 30)
ys, xs = np.where(blue)
crop = reg[ys.min()-3:ys.max()+3, xs.min()-3:xs.max()+3]
cv2.imwrite(r'...\assets\shield.png', crop)
```

> Isti princip kao u `rad-sa-slikom.md` §4: **razdvajanje po HSV/boji** kad se
> objekat i okolina preklapaju.

### 3.5 Kontrolni list (pregled svih isečaka odjednom)

Pre ubacivanja u HTML, sve isečke zalepi na jednu sliku i pogledaj:

```python
from PIL import Image; import os
A = r'...\assets'
names = ['grejac.png','termostat.png','ventil.png','elektronika.png',
         'hydra.png','sirius.png','orion.png','taurus.png','shield.png','heater.png']
sheet = Image.new('RGB', (1100, 160), (220,220,220)); x = 5
for n in names:
    im = Image.open(os.path.join(A, n)); im.thumbnail((130,130))
    sheet.paste(im, (x, 10)); x += im.width + 10
sheet.save('_contact.png')
```

---

## 4. Hero pozadina — koristi originalnu `background.jpg`

Hero (bojler na zidu + peškir + biljka) je već postojao kao zasebna slika
`ai-pozadina/background.jpg` (740×1600, isti motiv kao u `app.jpg`). Umesto isecanja,
nju koristimo kao **CSS background** i pozicioniramo da se motiv poklopi sa dizajnom:

```css
.hero{
  min-height:555px;                 /* iz mape sekcija: hero = 102..643 */
  display:flex; flex-direction:column;
  background:#eef1f4 url('../ai-pozadina/background.jpg') no-repeat;
  background-size:600px auto;       /* skaliranje da bojler stane po visini */
  background-position:right -140px; /* bojler desno-gore, peškir uz desnu ivicu */
  padding:30px 20px 26px;
}
```

Vrednosti (`600px`, `right -140px`) smo **iterativno** doterali kroz screenshot
poređenje (vidi §5). Tekst i dugmad idu preko pozadine; dugmad gurnuta na dno
hero-a sa `margin-top:auto` (jer je `.hero` flex-kolona).

---

## 4b. Kad NEMA zasebne background slike (fallback)

U ovom primeru smo dobili gotovu `ai-pozadina/background.jpg`. **Kad je sledeći put
ne bude**, NE pravimo pozadinu „od nule" iz CSS-a (fotorealistična scena se tako ne
može verno napraviti). Umesto toga: **hero pozadina je ionako već u `app.jpg`** —
samo ima tekst/dugmad preko sebe. Izvučemo je i očistimo inpaintingom.

Postupak (kombinacija §2.2 + §3 ovog dokumenta i §4 iz [`rad-sa-slikom.md`](./rad-sa-slikom.md)):

### Korak 1 — iseci hero pojas iz `app.jpg`

Granice znamo iz „mape sekcija" (§2.2), npr. hero = `y 102..643`:

```python
import cv2
app = cv2.imread(r'...\app.jpg')
hero = app[102:643, 0:740]
cv2.imwrite(r'...\assets\_hero_raw.jpg', hero, [cv2.IMWRITE_JPEG_QUALITY, 95])
```

### Korak 2 — ukloni tekst/dugmad inpaintingom, rekonstruiši pozadinu

Tekst i dugmad su skoro uvek **na levoj strani**, preko zida (ravna svetla površina),
dok je bojler/peškir desno. Zato koristimo dve strategije (kao u `rad-sa-slikom.md` §4):

- **Tekst/dugmad na ravnom zidu** → NE inpaint, nego **ravno popuni bojom zida**
  (uzorkuj boju po redu sa čiste ivice). Inpaint na velikim površinama pravi sive mrlje.
- **Slova/ivice koje prelaze preko bojlera** → tanka maska **po boji** (HSV) + inpaint,
  da se rekonstruiše bojler između poteza slova.

```python
import cv2, numpy as np
img = cv2.imread(r'...\assets\_hero_raw.jpg')
h, w = img.shape[:2]

WALL_X = 360          # levo od ove x granice je praktično čist zid (desno bojler)

# boksevi koje uklanjamo (naslov, lista, dugmad) — odredi iz dizajna / preview-om
text_boxes = [ (x1,y1,x2,y2), ... ]

# 1) Deo preko zida -> ravno popuni bojom zida (uzorkovano po redu sa leve ivice)
wall = np.median(img[:, 2:14, :], axis=1)                 # boja zida po svakom redu
for (x1,y1,x2,y2) in text_boxes:
    xr = min(x2, WALL_X)                                   # samo deo preko zida
    if xr > x1:
        img[y1:y2, x1:xr] = wall[y1:y2][:, None, :]

# 2) Deo preko bojlera -> tanka maska po boji + inpaint
mask = np.zeros((h, w), np.uint8)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
S, V = hsv[:,:,1], hsv[:,:,2]
glyph = ((S < 70) & (V > 140)).astype(np.uint8) * 255     # beli tekst: niska sat, visok V
strip = np.zeros((h, w), np.uint8)
for (x1,y1,x2,y2) in text_boxes:
    xl = max(x1, WALL_X)
    if x2 > xl: strip[y1:y2, xl:x2] = 255
mask = cv2.bitwise_and(glyph, strip)
mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5,5)))  # pokrij glow
res = cv2.inpaint(img, mask, 6, cv2.INPAINT_TELEA)

cv2.imwrite(r'...\assets\hero-bg.jpg', res, [cv2.IMWRITE_JPEG_QUALITY, 92])
```

> **Uvek prvo preview maske** (poluprovidan crveni overlay) pre „pečenja" — vidi
> `rad-sa-slikom.md` §4.3. Jeftino je i spasava od pogrešnih koordinata.

### Korak 3 — koristi je isto kao u §4

```css
.hero{
  background:#eef1f4 url('assets/hero-bg.jpg') no-repeat top center;
  background-size:740px auto;     /* već je isečen na 740 širine -> 1:1 */
  /* po potrebi background-position za fino poravnanje */
}
```

> Pošto je `hero-bg.jpg` isečen tačno iz `app.jpg` na 740px, pozicioniranje je
> trivijalno (`top center`, `background-size:740px`) — za razliku od §4 gde smo
> imali zasebnu sliku drugačijih proporcija.

**Granični slučaj:** ako hero ima i složenih grafika preko sredine (bedževi, krugovi),
njih ukloni **punom maskom** (elipsa/krug) + inpaint — isto kao bedževe u
`rad-sa-slikom.md` §4.1, tačka 3.

**Šta NE radimo:** ne „izmišljamo" scenu iz teksta i ne crtamo je u CSS-u — rezultat
ne bi bio pixel-perfect. Pravo AI generisanje pozadine je moguće samo uz zaseban
alat/servis za to (ako bude dostupan); u suprotnom je crop+inpaint iz `app.jpg`
najpouzdaniji put.

---

## 5. Render + vizuelno poređenje (Chrome DevTools MCP)

Petlja koju ponavljamo dok ne postane identično:

### 5.1 Otvori i postavi viewport na širinu dizajna

```
mcp__chrome-devtools__new_page    url = file:///.../darjan-sajt/index.html
mcp__chrome-devtools__resize_page width = 740, height = 1600
```

### 5.2 Screenshot cele stranice

```
mcp__chrome-devtools__take_screenshot  fullPage = true, filePath = ...\shot.png
```

> Napomena: DevTools ume da vrati screenshot malo uže od 740 (npr. 725) zbog
> scrollbara/DPR-a. Zato pri poređenju **skaliramo na 740** širine.

### 5.3 Napravi „side-by-side" kombinaciju (original | moje)

```python
from PIL import Image
app  = Image.open(r'...\app.jpg').convert('RGB').resize((740,1600))
mine = Image.open('shot.png').convert('RGB')
mw, mh = mine.size
mine = mine.resize((int(mw*1600/mh), 1600))         # na istu visinu
combo = Image.new('RGB', (740 + mine.size[0] + 20, 1600), (40,40,40))
combo.paste(app, (0,0)); combo.paste(mine, (760,0))
combo.save('_combo.png')
```

Otvori `_combo.png` (Read tool) i uporedi sekciju po sekciju. Za sitne detalje
(tekst, ikone) iseci uži pojas obe slike i uporedi zumirano.

### 5.4 Tipične korekcije koje smo radili u ovoj petlji

- Hero pozadina: `background-size` / `background-position` da se bojler poklopi.
- Dugmad: iz „stacked" (vertikalno) u **side-by-side** (`flex-direction:row`),
  pa gurnuta na dno hero-a (`margin-top:auto`).
- Zamena CSS/SVG ikona **stvarnim isečcima** iz §3.
- Fino doterivanje visina kontejnera (`.fimg`, `.mimg`) i paddinga sekcija.

---

## 6. Struktura HTML/CSS-a (šta je ostalo ručno)

Ručno (HTML+CSS), jer je tekst/struktura:
- **Header**: logo (drop SVG + „metalac / SERVIS BOJLERA"), telefon, hamburger.
- **Hero tekst**: naslov, lista sa plavim „check" krugovima, 2 dugmeta (poziv/WhatsApp).
- **Stats traka**: 4 kolone sa inline SVG ikonama (sat, pin, štit, palac).
- **Naslovi sekcija**, kartice (okvir/senka), CTA traka, **footer** (4 stavke).

Iz slike (isečci u `assets/`):
- Kvarovi: `grejac/termostat/ventil/elektronika.png`
- Modeli: `hydra/sirius/orion/taurus.png`
- `shield.png`, `heater.png`, + hero `background.jpg` (kao CSS background).

CSS pravila za isečke (da se uklope u kartice):
```css
.fault .fimg img { max-height:66px; width:auto; object-fit:contain; }
.model .mimg img { height:104px;  width:auto; object-fit:contain; }
.original .shield { width:60px; height:auto; }
```

---

## 6b. Mobilni viewport — fiksna širina mockup-a (VAŽNO)

**Najčešća zamka za mobilni.** Mockup (`app.jpg`) je dizajn **fiksne širine** (740px):
font-ovi, naslovi i mreže (4 kolone) su u fiksnim pikselima. Ako ostaviš podrazumevani
viewport:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

…telefon (npr. 390px širine) pokušava da nagura dizajn od 740px u 390px. Fiksne px
veličine ne mogu da se skupe, pa sadržaj **prelazi preko ivice ekrana** → deo stranice
je odsečen i može da se „zoom-out"-uje (horizontalni overflow).

### Rešenje — reci telefonu da renderuje na širini dizajna

```html
<meta name="viewport" content="width=740" />
```

Mobilni browser tada postavi layout na **740px** (širina dizajna) i **automatski
skalira celu stranicu** da stane na ekran. Rezultat: identične proporcije kao mockup,
samo umanjeno (skala ≈ `širina_ekrana / 740`, npr. ~0.53 na 390px telefonu).
**Bez horizontalnog overflow-a, bez odsecanja.**

> Desktop nije pogođen: `width=740` meta se na desktopu ignoriše; tamo radi
> `.wrap { max-width:740px }` koji centrira sadržaj.

### Sigurnosna mreža (da overflow nikad nije moguć)

```css
html, body { overflow-x: hidden; }
.grid4, .stats { min-width: 0; }
.grid4 > * { min-width: 0; }   /* dozvoli da grid ćelije padnu ispod min-content */
```

> `minmax(0,1fr)` / `min-width:0` na grid ćelijama sprečava da slika/tekst „rastegnu"
> kolonu preko kontejnera (default grid track ne ide ispod `min-content`).

### Provera u Chrome DevTools (MCP)

Pravi telefon emuliraj (ne samo `resize_page` — MCP browser ima ~500px „pod"):

```
mcp__chrome-devtools__emulate        viewport = "390x844x3,mobile,touch"
mcp__chrome-devtools__navigate_page  type = reload
mcp__chrome-devtools__evaluate_script
  () => ({ w: window.innerWidth,
           sw: document.documentElement.scrollWidth,
           overflow: document.documentElement.scrollWidth - window.innerWidth })
```

Ispravno stanje: `w = 740`, `overflow = 0` (i `visualViewport.scale < 1`).
Loše stanje (pre fiksa): `overflow > 0`.

---

## 7. Cheat sheet za sledeći sajt

1. **Dimenzije** `app.jpg` → renderuj stranicu na toj širini (`max-width`), 1:1.
2. **Mapa sekcija**: detektuj tamne trake (svetlina reda < 70) → `y` granice → CSS visine.
3. **Isečci proizvoda** (OpenCV):
   - detektuj kolone preko „razmak-sive" boje,
   - `trim_save` (bounding box ne-belog + mali pad) → PNG u `assets/`,
   - za objekte uz tekst/detalj: bounding box **po boji** (HSV/kanali), ne po belom.
   - kontrolni list svih isečaka pre ubacivanja.
4. **Hero**: ako postoji originalna pozadina, koristi je kao CSS `background`
   (`background-size` + `background-position` iterativno).
5. **Petlja poređenja**: Chrome DevTools `resize_page(740,…)` → `take_screenshot
   fullPage` → side-by-side combo → koriguj → ponovi dok nije identično.
6. **Mobilni viewport**: za dizajn fiksne širine stavi `<meta name="viewport"
   content="width=<širina_dizajna>">` (npr. `740`) da se cela stranica skalira na ekran,
   bez horizontalnog overflow-a (vidi §6b). + `overflow-x:hidden` i `min-width:0` na grid.
7. **Pravilo**: struktura/tekst/dugmad = HTML/CSS; fotografije = isečci iz slike.
8. Privremene fajlove drži van projekta (scratchpad), u repo idu samo `assets/` + `index.html`.
