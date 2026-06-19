# Hero pozadina — izvlačenje i čišćenje iz mockup-a dizajna

Ovaj dokument opisuje kako iz **gotovog mockup-a dizajna** (`design.jpeg`) izvučemo
hero pojas i očistimo ga od marketinškog teksta/bedževa, da dobijemo **čistu hero
pozadinu** za sajt (npr. samo crkva + bojler, bez teksta).

Konkretan primer: `design.jpeg` (728×1536) → `hero.jpg` (isečen hero) → `hero_clean.jpg`
(uklonjen tekst, rekonstruisana pozadina).

> Preduslovi: Python + **cv2 + numpy** (instalacija: [`instalacija-alata.md`](./instalacija-alata.md)).
> Crop koristi .NET `System.Drawing` (bez instalacije), render Edge headless / Chrome DevTools.
> Srodni proces (izrezivanje proizvoda u providni PNG): [`transparentna-pozadina.md`](./transparentna-pozadina.md).
> Viši nivo (mockup → ceo sajt): [`pixel-perfect-sajt.md`](./pixel-perfect-sajt.md).

---

## 1. Pregled — koraci

1. **Kropovanje hero pojasa** iz `design.jpeg` → `hero.jpg`
   (.NET `System.Drawing`, bez instalacije).
2. **Uklanjanje teksta i bedževa (inpainting)** iz `hero.jpg` → `hero_clean.jpg`
   (OpenCV `cv2.inpaint`).
3. **Vizuelna verifikacija** — render HTML-a i screenshot radi poređenja sa dizajnom.

---

## 2. Kropovanje hero pojasa — .NET `System.Drawing` (bez instalacije)

Za prosto isecanje pravougaonog regiona koristimo `System.Drawing` (dolazi uz
Windows/.NET) — **ne treba ništa instalirati**.

Bitno: `design.jpeg` je **728×1536** px, a stranica ima `max-width: 728px`, pa se
slika i stranica poklapaju **1:1** (1 px slike = 1 px stranice). Zato su koordinate
za kropovanje direktno čitljive iz dizajna.

### 2.1 Čitanje dimenzija slike

```powershell
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("C:\...\design.jpeg")
"$($img.Width) x $($img.Height)"   # -> 728 x 1536
$img.Dispose()
```

### 2.2 Funkcija za krop (region -> novi fajl)

```powershell
Add-Type -AssemblyName System.Drawing
function Crop($src,$dst,$x,$y,$w,$h){
  $img  = [System.Drawing.Image]::FromFile($src)
  $rect = New-Object System.Drawing.Rectangle($x,$y,$w,$h)
  $bmp  = New-Object System.Drawing.Bitmap($w,$h)
  $g    = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0,0,$w,$h)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
  $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}

# Primer: iseci hero pojas (x=0, y=86, širina=728, visina=577)
Crop "C:\...\design.jpeg" "C:\...\hero.jpg" 0 86 728 577
```

### 2.3 Čuvanje kao JPEG sa kontrolom kvaliteta

`System.Drawing` podrazumevano čuva JPEG na ~75% kvaliteta. Za oštriju sliku
postavi Quality enkoder (npr. 92):

```powershell
$enc    = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | ? { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
$bmp.Save("C:\...\hero.jpg", $enc, $params)
```

**Savet za koordinate:** kad ne znaš tačnu granicu (gde se završava hero a počinje
sledeća sekcija), iseci uži „test" pojas (npr. `y=590, h=120`), pogledaj ga, pa
precizno odredi granicu. Tako smo našli da hero ide do `y≈663`.

> Granice sekcija se mogu i automatski detektovati po svetlini reda (tamne navy trake) —
> vidi `pixel-perfect-sajt.md` §2.2.

---

## 3. Uklanjanje teksta sa slike — OpenCV inpainting

Cilj: ukloniti sav nacrtani tekst i bedževe sa `hero.jpg`, a iza njih
**rekonstruisati pozadinu** (crkvu, vatru, bojler) tako da ostanu „samo crkva i bojler".

Ključni alat je **`cv2.inpaint()`** — content-aware popunjavanje: za zadatu masku
(belo = ukloni) popunjava te piksele na osnovu okolnih. Idealno za tanak tekst i
male objekte; **loše za velike pune površine** (pravi sive „mrlje"/difuzne artefakte).

### 3.1 Strategija po regionima (najvažnija lekcija)

Tekst nije svuda na istoj pozadini, pa koristimo **tri različita pristupa**:

1. **Tekst na ravnoj crnoj pozadini** (leva kolona: naslov, paragraf, lista, dugme,
   trust linija) → **NE inpaint**. Umesto toga **direktno popuni** taj pravougaonik
   bojom pozadine (uzorkuj levu crnu ivicu po redovima). Inpaint na velikim
   površinama daje ružne sive artefakte; ravno popunjavanje je čisto i bez šavova.

2. **Tekst koji prelazi preko crkve** (desni krajevi velikih slova) → **tanka „glyph"
   maska + inpaint**. Slova razdvajamo od zlatne crkve **po boji**: beli tekst ima
   nisku zasićenost (saturation) i visoku svetlinu, dok je crkva zlatna (visok hue/sat).
   Maskiramo samo poteze slova, pa inpaint rekonstruiše crkvu između njih.

3. **Bedževi** (štit „GARANCIJA NA RAD", krug „20 GODINA") → **puna maska
   (elipsa/krug) + inpaint**. Cela grafika se ukloni, a inpaint popuni vatru/tamno
   iza njih (difuzni glow se lepo rekonstruiše).

### 3.2 Korisni `cv2` / `numpy` alati

| Funkcija | Čemu služi |
|---------|-----------|
| `cv2.imread(path)` | učitaj sliku (BGR, kao NumPy niz) |
| `cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 92])` | sačuvaj sliku |
| `cv2.cvtColor(img, cv2.COLOR_BGR2HSV)` | BGR→HSV (razdvajanje po boji) |
| `cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)` | u sivu skalu (svetlina) |
| `np.median(img[:, x1:x2, :], axis=1)` | uzorkovanje boje pozadine po redovima |
| `cv2.rectangle / cv2.ellipse / cv2.circle(mask, ..., 255, -1)` | crtanje pune maske |
| `cv2.bitwise_and / bitwise_or` | kombinovanje maski |
| `cv2.dilate(mask, kernel)` | proširi masku (da pokrije i „glow"/anti-aliasing ivice) |
| `cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5))` | kernel za dilataciju |
| `cv2.inpaint(img, mask, radius, cv2.INPAINT_TELEA)` | content-aware popuna (Telea) |
| `cv2.inpaint(img, mask, radius, cv2.INPAINT_NS)` | alternativa (Navier-Stokes) |

Maska je **8-bit, jednokanalna**: `255` = ukloni/popuni, `0` = ostavi.
Slika u OpenCV-u je **BGR** (ne RGB!) — bitno kod praga boja.

### 3.3 Iterativni razvoj maske (preview pre nego što se „peče")

Pre samog inpaint-a, masku nacrtaj kao **poluprovidan crveni/zeleni overlay** preko
slike i pregledaj je, pa koriguj koordinate:

```python
import cv2, numpy as np
img = cv2.imread(r"...\hero.jpg")
ov  = img.copy()
for (x1,y1,x2,y2) in boxes:                       # tekst boksevi
    cv2.rectangle(ov,(x1,y1),(x2,y2),(0,0,255),-1) # crveno
cv2.ellipse(ov,(637,123),(68,72),0,0,360,(0,255,0),-1)  # štit (zeleno)
cv2.circle (ov,(635,303),66,(0,255,0),-1)               # krug godina
out = cv2.addWeighted(ov,0.45,img,0.55,0)         # 45% overlay
cv2.imwrite(r"...\_preview.png", out)
```

### 3.4 Finalna skripta (suština)

```python
import cv2, numpy as np
img = cv2.imread(r"...\hero.jpg")
h, w = img.shape[:2]
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
H, S, V = hsv[:,:,0], hsv[:,:,1], hsv[:,:,2]

CHURCH_X = 240   # levo od ove x granice pozadina je praktično crna

text_boxes = [ ... ]  # (x1,y1,x2,y2) za badge, naslov, paragraf, listu, dugme, trust

# 1) Deo preko crne pozadine -> RAVNO popuni bojom pozadine (uzorkovano po redu)
bg = np.median(img[:, 2:14, :], axis=1)           # boja leve ivice po svakom redu
for (x1,y1,x2,y2) in text_boxes:
    xr = x2 if (y1 >= 262 or y2 <= 62) else min(x2, CHURCH_X)  # iznad/ispod crkve = puna širina
    if xr > x1:
        img[y1:y2, x1:xr] = bg[y1:y2][:, None, :]

# 2) Deo preko crkve -> tanka maska po BOJI (beli ili narandžasti tekst) + inpaint
mask  = np.zeros((h, w), np.uint8)
white  = (S < 70)  & (V > 140)
orange = (((H < 20) | (H > 165)) & (S > 120) & (V > 120))
glyph  = (white | orange).astype(np.uint8) * 255
strip  = np.zeros((h, w), np.uint8)
for (x1,y1,x2,y2) in text_boxes:
    if y1 >= 262 or y2 <= 62: continue
    xl = max(x1, CHURCH_X)
    if x2 > xl: strip[y1:y2, xl:x2] = 255
mask = cv2.bitwise_or(mask, cv2.bitwise_and(glyph, strip))

# 3) Bedževi -> puna maska (cela grafika se uklanja)
cv2.ellipse(mask, (637,123), (72,76), 0, 0, 360, 255, -1)
cv2.circle (mask, (635,303), 70, 255, -1)

# Proširi masku da pokrije i „glow"/ivice, pa inpaint u dva prolaza
mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))
res  = cv2.inpaint(img, mask, 6, cv2.INPAINT_TELEA)
res  = cv2.inpaint(res, mask, 4, cv2.INPAINT_NS)

cv2.imwrite(r"...\hero_clean.jpg", res, [cv2.IMWRITE_JPEG_QUALITY, 92])
```

Pokretanje: `python "C:\...\_inpaint.py"`

### 3.5 Naučene lekcije (da ne ponavljamo greške)

- **Inpaint je za tanke regione.** Velike pune površine → ravno popunjavanje bojom
  pozadine (ili uzorkovanje), nikad inpaint (daje sive difuzne mrlje).
- **Razdvajanje po boji (HSV)** je ključ kada se tekst i pozadina preklapaju a različite
  su boje (beli tekst vs. zlatna crkva).
- **Velike bokseve** za tekst koji je iznad/ispod važnih detalja (crkve) tretiraj
  punom maskom; samo tamo gde je preko detalja koristi tanku „glyph" masku.
- **Dilataciju** uvek primeni pre inpaint-a — tekst ima blagi „glow"/anti-aliasing
  oreol koji ostaje ako maska prati tačno poteze slova.
- **Iteriraj sa preview-om** (overlay maske) pre finalnog inpaint-a; jeftino je i
  spasava od pogrešnih koordinata.
- Bedževe/ikonice koje su **fizički deo proizvoda** (npr. `ARISTON` logo, `60°` displej
  na bojleru) namerno **ostavi** — to nije „marketinški tekst".

---

## 4. Renderovanje i verifikacija — Microsoft Edge (headless)

Za poređenje rezultata sa dizajnom renderujemo HTML i pravimo screenshot-ove
**bez instalacije** — koristeći Edge koji je već na sistemu.

### 4.1 Putanja do Edge-a

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
Test-Path $edge
```

### 4.2 Screenshot stranice

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$uri  = "file:///c:/Users/User1/Desktop/servis-bojlera-new/index.html"
& $edge --headless=new --disable-gpu --hide-scrollbars `
        --window-size=728,1600 `
        --screenshot="C:\...\_shot.png" "$uri"
```

Korisni flagovi: `--headless=new` (novi headless), `--disable-gpu`,
`--hide-scrollbars`, `--window-size=Š,V`, `--default-background-color=00000000`
(providna pozadina ako treba).

### 4.3 ⚠️ Zamka: `--window-size` ≠ stvarni viewport

Edge headless ume da renderuje stranicu na **širem viewport-u** nego što je
`--window-size` (npr. tražili 360, a `window.innerWidth` bio 476). Screenshot platno
jeste široko koliko je traženo, ali je layout širi → izgleda kao da je sadržaj
„isečen", iako u stvarnosti nije.

**Kako proveriti stvarni viewport / dimenzije elemenata** — ubaci mali JS u kopiju
stranice koji ispiše `getBoundingClientRect()` u fiksni div, pa screenshot-uj:

```powershell
$src = Get-Content "C:\...\index.html" -Raw
$script = @'
<script>
addEventListener("load",function(){
  function b(s){var e=document.querySelector(s);if(!e)return"none";
    var r=e.getBoundingClientRect();return Math.round(r.top)+"-"+Math.round(r.bottom);}
  var d=document.createElement("div");
  d.style.cssText="position:fixed;left:0;top:0;z-index:99999;background:#fff;color:#000;font:17px monospace;padding:6px;white-space:pre;";
  d.textContent="vw "+window.innerWidth+"\nhero "+b(".hero")+"\nsection "+b(".section");
  document.body.appendChild(d);
});
</script>
</body>
'@
$out = $src -replace "</body>", $script
Set-Content "C:\...\_measure.html" -Value $out -Encoding utf8
# pa renderuj _measure.html i pročitaj brojeve sa screenshot-a
```

> Alternativa Edge-u: **Chrome DevTools (MCP)** — `resize_page` / `emulate` +
> `take_screenshot`, pouzdaniji za pravu emulaciju mobilnog (vidi `pixel-perfect-sajt.md` §5, §6b).

### 4.4 Crop screenshot-a za detaljan pregled

Za zumiranje dela screenshot-a koristi isti `System.Drawing` Crop iz §2, uz
`InterpolationMode = NearestNeighbor` kada želiš oštre piksele (npr. da pročitaš
sitan tekst).

---

## 5. Sažet „cheat sheet"

1. **Iseci hero pojas** → `System.Drawing` Crop (bez instalacije); granicu nađi „test" pojasom.
2. **Ukloni tekst/bedževe** → maska po regionu (ravno popunjavanje vs. glyph maska po HSV
   vs. puna maska), `cv2.dilate`, `cv2.inpaint` (TELEA, pa po potrebi NS). Inpaint samo za tanke regione.
3. **Proveri u browseru** → Edge `--headless=new --screenshot` (ili Chrome DevTools MCP),
   uz proveru stvarnog `window.innerWidth` ako meriš responsive.
4. **Uvek**: preview maske pre „pečenja", dilatacija pre inpaint-a, JPEG kvalitet 92,
   očisti `_*` privremene fajlove ([`instalacija-alata.md`](./instalacija-alata.md) §3).
