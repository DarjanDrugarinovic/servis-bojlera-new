# Rad sa slikama — proces, alati i koraci

Ovaj dokument opisuje ceo proces obrade slika koji je korišćen na ovom projektu
(`servis-bojlera-new`), da bi nam služio kao kontekst kada ponovo budemo radili sa
slikama. Pokriva: okruženje, instalaciju biblioteka, alate, i svaki konkretan korak
sa primerima koda.

> Platforma: **Windows 11**, shell **PowerShell** (primarni) + **Git Bash**.
> Sav kod ispod je pokretan kroz PowerShell, osim Python skriptova.

---

## 1. Pregled — koje smo zadatke rešavali

1. **Kropovanje (isecanje) regiona iz slike** — iz `design.jpeg` (ceo mockup stranice,
   728×1536) isekli smo hero deo (bojler + crkva + tekst) u `hero.jpg`.
2. **Uklanjanje teksta sa slike (inpainting)** — iz `hero.jpg` smo uklonili sav
   marketinški tekst i bedževe i rekonstruisali pozadinu (crkva/vatra) → `hero_clean.jpg`.
3. **Vizuelna verifikacija** — renderovanje HTML stranice i pravljenje screenshot-ova
   headless browserom radi poređenja sa dizajnom.

Za **kropovanje i screenshot-ove** koristili smo alate koji su već na Windows-u
(.NET `System.Drawing`, Microsoft Edge headless) — **bez instalacije**.
Za **uklanjanje teksta** bio nam je potreban **OpenCV** (content-aware inpainting),
koji smo morali da instaliramo.

---

## 2. Okruženje i instalacija

### 2.1 Provera Python-a i biblioteka

```powershell
# Da li Python postoji i gde
(Get-Command python -ErrorAction SilentlyContinue).Source
# -> C:\Users\User1\AppData\Local\Programs\Python\Python311\python.exe

# Provera da li su biblioteke već instalirane
python -c "import cv2, numpy; print('cv2', cv2.__version__)"
python -c "import PIL; print('PIL', PIL.__version__)"
```

Ako vrate `ModuleNotFoundError`, biblioteke nisu instalirane.

### 2.2 Instalacija OpenCV + numpy + Pillow

```powershell
python -m pip install --quiet opencv-python-headless numpy pillow
# Provera verzija
python -c "import cv2,numpy,PIL; print('cv2',cv2.__version__,'np',numpy.__version__,'PIL',PIL.__version__)"
# -> cv2 4.13.0 np 2.4.6 PIL 12.2.0
```

**Zašto `opencv-python-headless`, a ne `opencv-python`?**
`-headless` varijanta nema GUI zavisnosti (nema `cv2.imshow` prozore), što je idealno
za skripte na serveru/CI i izbegava nepotrebne GUI biblioteke. Mi ionako slike
**čuvamo na disk** (`cv2.imwrite`), ne prikazujemo ih u prozoru.

**Šta čemu služi:**
| Biblioteka | Uloga |
|-----------|-------|
| `cv2` (OpenCV) | glavni alat — inpainting, maske, konverzija boja, morfologija |
| `numpy` | rad sa pikselima kao matricama (slika = NumPy niz) |
| `pillow` (PIL) | pomoćna; na kraju je nismo suštinski koristili |

> Napomena: ove biblioteke ostaju trajno instalirane u Python 3.11 okruženju.
> Deinstalacija (ako zatreba): `python -m pip uninstall opencv-python-headless numpy pillow`

---

## 3. Kropovanje slike — .NET `System.Drawing` (bez instalacije)

Za prosto isecanje pravougaonog regiona iz slike koristili smo `System.Drawing`
koji dolazi uz Windows/.NET — **ne treba ništa instalirati**.

Bitno: `design.jpeg` je **728×1536** px, a stranica ima `max-width: 728px`, pa se
slika i stranica poklapaju **1:1** (1 px slike = 1 px stranice). Zato su koordinate
za kropovanje direktno čitljive iz dizajna.

### 3.1 Čitanje dimenzija slike

```powershell
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("C:\...\design.jpeg")
"$($img.Width) x $($img.Height)"   # -> 728 x 1536
$img.Dispose()
```

### 3.2 Funkcija za krop (region -> novi PNG)

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

### 3.3 Čuvanje kao JPEG sa kontrolom kvaliteta

`System.Drawing` podrazumevano čuva JPEG na ~75% kvaliteta. Za oštriju sliku
postavlja se Quality enkoder (npr. 92):

```powershell
$enc    = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | ? { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
$bmp.Save("C:\...\hero.jpg", $enc, $params)
```

**Saveti za koordinate:** kad ne znaš tačnu granicu (npr. gde se završava hero a
počinje sledeća sekcija), iseci uži „test” pojas (npr. `y=590, h=120`), pogledaj ga,
pa precizno odredi granicu. Tako smo našli da hero ide do `y≈663`.

---

## 4. Uklanjanje teksta sa slike — OpenCV inpainting

Cilj: ukloniti sav nacrtani tekst i bedževe sa `hero.jpg`, a da iza njih
**rekonstruišemo pozadinu** (crkvu, vatru, bojler) tako da ostanu „samo crkva i bojler”.

Ključni alat je **`cv2.inpaint()`** — content-aware popunjavanje: za zadatu masku
(belo = ukloni) popunjava te piksele na osnovu okolnih. Idealno za tanak tekst i
male objekte; **loše za velike pune površine** (pravi sive „mrlje”/difuzne artefakte).

### 4.1 Strategija po regionima (najvažnija lekcija)

Tekst nije svuda na istoj pozadini, pa smo koristili **tri različita pristupa**:

1. **Tekst na ravnoj crnoj pozadini** (leva kolona: naslov, paragraf, lista, dugme,
   trust linija) → **NE inpaint**. Umesto toga **direktno popunimo** taj pravougaonik
   bojom pozadine (uzorkujemo levu crnu ivicu po redovima). Inpaint na velikim
   površinama daje ružne sive artefakte; ravno popunjavanje je čisto i bez šavova.

2. **Tekst koji prelazi preko crkve** (desni krajevi velikih slova) → **tanka „glyph”
   maska + inpaint**. Slova razdvajamo od zlatne crkve **po boji**: beli tekst ima
   nisku zasićenost (saturation) i visoku svetlinu, dok je crkva zlatna (visok hue/sat).
   Maskiramo samo poteze slova, pa inpaint rekonstruiše crkvu između njih.

3. **Bedževi** (štit „GARANCIJA NA RAD”, krug „20 GODINA”) → **puna maska
   (elipsa/krug) + inpaint**. Cela grafika se ukloni, a inpaint popuni vatru/tamno
   iza njih (difuzni glow se lepo rekonstruiše).

### 4.2 Korisni `cv2` / `numpy` alati koje smo koristili

| Funkcija | Čemu služi |
|---------|-----------|
| `cv2.imread(path)` | učitaj sliku (BGR, kao NumPy niz) |
| `cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 92])` | sačuvaj sliku |
| `cv2.cvtColor(img, cv2.COLOR_BGR2HSV)` | BGR→HSV (razdvajanje po boji) |
| `cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)` | u sivu skalu (svetlina) |
| `np.median(img[:, x1:x2, :], axis=1)` | uzorkovanje boje pozadine po redovima |
| `cv2.rectangle / cv2.ellipse / cv2.circle(mask, ..., 255, -1)` | crtanje pune maske |
| `cv2.bitwise_and / bitwise_or` | kombinovanje maski |
| `cv2.dilate(mask, kernel)` | proširi masku (da pokrije i „glow”/anti-aliasing ivice) |
| `cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5))` | kernel za dilataciju |
| `cv2.inpaint(img, mask, radius, cv2.INPAINT_TELEA)` | content-aware popuna (Telea) |
| `cv2.inpaint(img, mask, radius, cv2.INPAINT_NS)` | alternativa (Navier-Stokes) |

Maska je **8-bit, jednokanalna**: `255` = ukloni/popuni, `0` = ostavi.
Slika u OpenCV-u je **BGR** (ne RGB!) — bitno kod praga boja.

### 4.3 Iterativni razvoj maske (preview pre nego što se „peče”)

Pre samog inpaint-a, maske smo crtali kao **poluprovidan crveni/zeleni overlay**
preko slike i pregledali ih, pa korigovali koordinate:

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

### 4.4 Finalna skripta (suština)

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

# Proširi masku da pokrije i „glow”/ivice, pa inpaint u dva prolaza
mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))
res  = cv2.inpaint(img, mask, 6, cv2.INPAINT_TELEA)
res  = cv2.inpaint(res, mask, 4, cv2.INPAINT_NS)

cv2.imwrite(r"...\hero_clean.jpg", res, [cv2.IMWRITE_JPEG_QUALITY, 92])
```

Pokretanje:

```powershell
python "C:\...\_inpaint.py"
```

### 4.5 Naučene lekcije (da ne ponavljamo greške)

- **Inpaint je za tanke regione.** Velike pune površine → ravno popunjavanje bojom
  pozadine (ili uzorkovanje), nikad inpaint (daje sive difuzne mrlje).
- **Razdvajanje po boji (HSV)** je ključ kada se tekst i pozadina preklapaju a različite
  su boje (beli tekst vs. zlatna crkva).
- **Velike bokseve** za tekst koji je iznad/ispod važnih detalja (crkve) tretiraj
  punom maskom; samo tamo gde je preko detalja koristi tanku „glyph” masku.
- **Dilataciju** uvek primeni pre inpaint-a — tekst ima blagi „glow”/anti-aliasing
  oreol koji ostaje ako maska prati tačno poteze slova.
- **Iteriraj sa preview-om** (overlay maske) pre finalnog inpaint-a; jeftino je i
  spasava od pogrešnih koordinata.
- Bedževi/ikonice koje su **fizički deo proizvoda** (npr. `ARISTON` logo, `60°` displej
  na bojleru) smo namerno **ostavili** — to nije „marketinški tekst”.

---

## 5. Renderovanje i verifikacija — Microsoft Edge (headless)

Za poređenje rezultata sa dizajnom renderovali smo HTML i pravili screenshot-ove
**bez instalacije** — koristeći Edge koji je već na sistemu.

### 5.1 Putanja do Edge-a

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
Test-Path $edge
```

### 5.2 Screenshot stranice

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

### 5.3 ⚠️ Zamka: `--window-size` ≠ stvarni viewport

Primetili smo da Edge headless ume da renderuje stranicu na **širem viewport-u**
nego što je `--window-size` (npr. tražili 360, a `window.innerWidth` bio 476).
Screenshot platno jeste široko koliko je traženo, ali je layout širi → izgleda kao
da je sadržaj „isečen”, iako u stvarnosti nije.

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

Ovako smo izmerili tačne pozicije i utvrdili da preklapanje hero teksta sa sledećom
sekcijom dolazi od toga što tekst prelazi visinu slike (a ne od horizontalnog
„overflow”-a, koji je bio samo varka snimka).

### 5.4 Crop screenshot-a za detaljan pregled

Za zumiranje dela screenshot-a koristili smo isti `System.Drawing` Crop iz sekcije 3,
uz `InterpolationMode = NearestNeighbor` kada želimo oštre piksele (npr. da pročitamo
sitan tekst).

---

## 6. Privremeni fajlovi i čišćenje

Sve radne fajlove (preview maske, međukoraci, screenshot-ovi, `.py` skripte, `_measure.html`)
imenovali smo sa prefiksom `_` i obrisali na kraju:

```powershell
$f = "C:\Users\User1\Desktop\servis-bojlera-new"
Get-ChildItem $f -Filter "_*" -File | Remove-Item -Force
```

Na kraju u folderu ostaju samo **rezultati** (npr. `hero.jpg`, `hero_clean.jpg`),
ne i radni kod/screenshot-ovi.

---

## 7. Sažet „cheat sheet” za sledeći put

1. **Treba samo iseći deo slike?** → `System.Drawing` Crop (bez instalacije).
2. **Treba ukloniti tekst/objekat sa slike?** → `pip install opencv-python-headless numpy`,
   pa: maska (po regionu — ravno popunjavanje vs. glyph maska po HSV vs. puna maska),
   `cv2.dilate`, `cv2.inpaint` (TELEA, pa po potrebi NS). Inpaint samo za tanke regione.
3. **Treba videti kako izgleda u browseru?** → Edge `--headless=new --screenshot`,
   ali proveri stvarni `window.innerWidth` ubrizganim JS-om ako meriš responsive.
4. **Uvek**: preview maske pre „pečenja”, dilatacija pre inpaint-a, JPEG kvalitet 92,
   i očisti `_*` privremene fajlove na kraju.
