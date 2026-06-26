# Bela pozadina — pretvaranje sivog zida slike u čisto belo

Cilj: od fotografije proizvoda na **svetlo-sivom zidu** napraviti verziju gde je
**pozadina čisto bela (#ffffff)**, a proizvod (bojler), peškir, biljka i polica ostaju.
Tipično za hero pozadine koje treba da se „stope" sa belom stranicom (bez sive ivice).

Konkretan primer u ovom projektu: `metalac/ai-pozadina/background-original.jpg`
(740×1600, bojler na svetlo-sivom zidu ~RGB 225,226,230) →
`background-v1.jpg` / `background-v2.jpg` / `background-v3.jpg`.

> Platforma: **Windows 11**, shell **PowerShell** (primarni) + **Git Bash**.
> Alati: .NET `System.Drawing` (bez instalacije) za v1; Python **cv2 + numpy + pillow**
> za v2/v3 (instalacija: [`instalacija-alata.md`](./instalacija-alata.md)).
> Pregled rezultata: **Read tool** (učita JPEG kao sliku) ili Chrome DevTools (MCP).
>
> Povezani dokumenti:
> [`transparentna-pozadina.md`](./transparentna-pozadina.md) — izrezivanje proizvoda u
> providni PNG (alfa); v3 ovde koristi isti princip siluete, ali kompozituje na **belo**
> umesto na alfa.
> [`hero-pozadina.md`](./hero-pozadina.md) — uklanjanje teksta/bedževa (inpainting) +
> razdvajanje po boji (HSV); ista logika maskiranja po boji koristi se u v2/v3.

---

## 0. Ključna lekcija (pročitaj prvo)

Zid (~225) i sam bojler (beo, ~250) su **oba neutralna i svetla** — razlikuju ih samo
boja (zid je malo tamniji) i meka senka. Iz toga slede tri zaključka koja diktiraju ceo
posao:

1. **Kad je pozadina ravan, svetao, ujednačen ton → globalna kriva tona (levels /
   white-point) je pravi alat.** Ne segmentacija. (v1)
2. **Maskiranje „belo samo tamo gde je zid" ne radi čisto** jer zid i belo telo bojlera
   dele isti ton; svaka prostorna granica pravi **halo/šav** oko bojlera. (v2 — lošije)
3. **Beli proizvod na beloj pozadini gubi ivice** (fizika high-key fotografije).
   Da bi se forma videla, treba mu **čista, meka, usmerena kontaktna senka** — ne sivi
   halo sa svih strana. (v3 — najbolje)

**Preporuka: koristi v3.** v1 je dobar i najbrži; v2 NE koristiti (ostaje za pouku).

---

## 1. v1 — Globalna „levels" / white-point kriva (System.Drawing)

**Ideja:** jedna monotona LUT kriva preko cele slike podigne belu tačku: svaki kanal
`out = min(255, in / belaTacka * 255)`. Zid (225–236) zakuca na 255; sve tamnije
(bojler-senke, peškir, biljka) se glatko skalira.

**Alat:** .NET `System.Drawing` (dolazi uz Windows — **bez instalacije**), preko
PowerShell-a. Isti `LockBits`/LUT obrazac kao za krop u [`hero-pozadina.md`](./hero-pozadina.md).

**Kako naći belu tačku:** uzorkuj zid (uglovi + sredina leve ivice). Belu tačku postavi
na **najtamniji deo zida** (npr. 212) da ceo zid (ukey i donji, tamniji deo) ode u 255.

```powershell
Add-Type -AssemblyName System.Drawing
$src="...\background-original.jpg"; $dst="...\background-v1.jpg"
$bmp=New-Object System.Drawing.Bitmap ([System.Drawing.Image]::FromFile($src))
$w=$bmp.Width; $h=$bmp.Height

$whitePoint=212.0
$lut=New-Object 'int[]' 256
for($i=0;$i -lt 256;$i++){ $v=[int][math]::Round($i/$whitePoint*255); if($v -gt 255){$v=255}; $lut[$i]=$v }

$rect=New-Object System.Drawing.Rectangle 0,0,$w,$h
$d=$bmp.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadWrite,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$bytes=$d.Stride*$h; $buf=New-Object 'byte[]' $bytes
[System.Runtime.InteropServices.Marshal]::Copy($d.Scan0,$buf,0,$bytes)
for($i=0;$i -lt $bytes;$i++){ $buf[$i]=[byte]$lut[$buf[$i]] }
[System.Runtime.InteropServices.Marshal]::Copy($buf,0,$d.Scan0,$bytes)
$bmp.UnlockBits($d)

# JPEG kvalitet 92 (System.Drawing podrazumevano ~75)
$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|?{$_.MimeType -eq 'image/jpeg'}
$ep=New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality,[long]92)
$bmp.Save($dst,$enc,$ep); $bmp.Dispose()
```

**Prednosti:** trivijalno (1 parametar), **bez šavova** (glatka kriva, svi gradijenti
ostaju), pozadina **savršeno ujednačeno bela**, bez instalacije.

**Mane:** sve ≥ belaTacke se **odseca na 255** → bojler gubi sjaj/gradaciju u svetlima,
a **gornja/leva ivica bojlera nestaje** (oslanjala se na to da je zid tamniji). Takođe
**lagano posvetli i peškir/biljku** (gube dubinu/kontrast — vidi tabelu §4).

---

## 2. v2 — Maskirano selektivno beljenje (cv2) — NE KORISTITI

**Ideja (pogrešna za ovaj slučaj):** napravi masku „zid" (neutralno + svetlo) i samo te
piksele gurni u belo, a bojler/objekte zaštiti. Cilj je bio sačuvati 3D formu bojlera.

```python
# suština: wall = (S<24)&(150<=V<=252) & ~boilerBox & ~keep ; out = lerp(orig, white, alpha)
```

**Zašto je lošije od v1:**
- **Halo:** pošto je bojler zaštićen, **siva kontaktna senka oko njega ostaje** →
  pozadina nije ujednačeno bela (otvoren zid 255, ali siv prsten uz bojler).
- **Šavovi / banding:** tvrde granice maske (pravougaoni „boiler box", pragovi S/V)
  prave vidljive prelaze i stepenice u glatkim gradijentima.
- **Brittle:** ~6 parametara; prvi pokušaj je ostavio sive trouglove u uglovima boksa.

> Pouka: segmentacija je za slučaj kad se objekat i pozadina **preklapaju u tonu i moraju
> se razdvojiti po LOKACIJI**. Ovde dele ton, pa svaka prostorna granica = artefakt.

---

## 3. v3 — Silueta isečena na čisto belo + meka kontaktna senka (cv2) ★ NAJBOLJE

**Ideja:** spoji jako od oba — **savršeno ujednačena bela pozadina** (kao v1) +
**objekti u 100% originalnom kvalitetu** (bez odsecanja/pranja kao v1) + **čista, meka,
usmerena senka** da beli bojler ne „nestane" na belom.

Radi se iz `background-original.jpg` (da se izbegne dupli-JPEG gubitak).

### 3.1 Foreground keying — po čemu prepoznajemo objekte

Zid I njegova meka senka su **neutralni, srednje-svetli**. Objekti su:
- **zasićeni** (peškir-teget, biljka-zelena, „metalac" logo) → `S>20`,
- **vrlo tamni detalji** (displej, ventili, kuka) → `V<120`,
- **specularno svetla ivica** (sjaj bojlera, polica) → `V>248`.

Sve između (neutralno, V 120–248) = pozadina (zid **i** njegova siva senka) → u belo.

> Kritično: **drop-senka bojlera je srednje-siva (V~170–210)** i lako se pogrešno uhvati
> kao objekat (`V<200`) → ostane ružan nazubljen sivi oblak. Zato senku NAMERNO
> svrstavamo u pozadinu (prag `V<120`, ne `V<200`).

### 3.2 Solidifikacija siluete + popuna SAMO unutrašnjih rupa

- mali `MORPH_CLOSE (5×5)` — da objekti **ostanu razdvojeni** (ako veliki close spoji
  bojler+policu+peškir, zatvoreni „džep" zida između njih se popuni i ostane siv!),
- zadrži samo velike komponente (`area>=800`) — otpada JPEG šum,
- **popuni samo rupe koje NE dodiruju ivicu** (= unutrašnji sjaj cilindra bojlera);
  otvoren zid između objekata dodiruje ivicu → ostaje pozadina → belo.

### 3.3 Meka usmerena kontaktna senka (da forma ne „nestane")

Svetlo iz gornje-leve → senka pada **dole-desno**: pomeri siluetu `(dx,dy)=(10,16)`,
jako rasplini (`GaussianBlur sigma≈11`), sakrij je ispod samog objekta, opacitet **~0.16**,
ton senke ~218. Suptilno — „uzemlji" bojler/policu, vrati ivicu, a ostaje čisto (nije
sivi halo sa svih strana kao v2).

### 3.4 Cela skripta

```python
import numpy as np, cv2
from PIL import Image

orig = np.array(Image.open('background-original.jpg').convert('RGB')).astype(np.uint8)
h,w,_ = orig.shape
f=orig.astype(int); V=f.max(2); S=f.max(2)-f.min(2)

# 1) foreground = zasićeno ILI vrlo tamno ILI specular-svetlo; neutralna sredina = pozadina
fg = ((S>20) | (V<120) | (V>248)).astype(np.uint8)
fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)),1)

# 2) zadrži velike blobove
n,lab,st,_ = cv2.connectedComponentsWithStats(fg,8)
keep=np.zeros((h,w),np.uint8)
for i in range(1,n):
    if st[i,cv2.CC_STAT_AREA]>=800: keep[lab==i]=1

# 3) popuni SAMO zatvorene unutrašnje rupe (sjaj bojlera), ne otvoren zid
inv=(1-keep).astype(np.uint8)
nh,hl,hs,_=cv2.connectedComponentsWithStats(inv,8)
sil=keep.copy()
for i in range(1,nh):
    x,y,bw,bh,area=hs[i]
    if not (x==0 or y==0 or x+bw==w or y+bh==h): sil[hl==i]=1
sil=cv2.morphologyEx(sil,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)),1)
silf=sil.astype(np.float32)

# 4) meka usmerena kontaktna senka (svetlo gore-levo -> senka dole-desno)
M=np.float32([[1,0,10],[0,1,16]])
sh=cv2.warpAffine(silf,M,(w,h)); sh=cv2.GaussianBlur(sh,(0,0),11)
sh=sh*(1-silf)                                  # sakrij senku ispod objekta
shadow_a=np.clip(sh,0,1)*0.16                   # suptilan opacitet

# 5) kompozit: belo + senka, pa objekat (uski feather = anti-alias, bez haloa)
alpha=cv2.GaussianBlur(silf,(0,0),1.1)[...,None]
bg=255.0 - shadow_a[...,None]*(255.0-218.0)     # ton senke ~218
out=orig.astype(np.float32)*alpha + bg*(1-alpha)
Image.fromarray(np.clip(out,0,255).astype(np.uint8)).save('background-v3.jpg', quality=95)
```

**Prednosti:** pozadina **ujednačeno bela** (kao v1), objekti **netaknuti** (peškir/biljka
zadržavaju punu zasićenost i dubinu — za razliku od v1/v2), forma uzemljена čistom senkom,
**bez haloa i šavova** (uski 1.1px feather).

**Mane / na šta paziti:** zavisi od dobrog keying-a — ako objekat ima neutralan srednje-sivi
deo bez ivice, može se odseći (proveri siluetu preview-om). Parametri `dx/dy/sigma/opacitet`
senke se biraju vizuelno (screenshot petlja).

---

## 4. Poređenje (mereno iz fajlova)

| Verzija | Pozadina (otvoren zid) | Peškir (sat / V) | Beli bojler na belom | Artefakti |
|--------|------------------------|------------------|----------------------|-----------|
| original | 226 (sivo) | 42.6 / 24.5 | vidljiv (sivi zid daje kontrast) | — |
| **v1** levels | **255** (ujednačeno) | 51.1 / 29.5 (oprano) | ivica nestaje, sjaj odsečen | — |
| **v2** mask | 255 (otvoreno) | 51.0 / 29.6 (oprano) | forma očuvana | **sivi halo + šavovi** |
| **v3** ★ | **255** (ujednačeno) | **42.5 / 24.6 (kao original)** | uzemljen mekom senkom | nema |

Mera „belog zida": uzorkuj veliki čist deo zida bez objekata, treba `mean≈255, min≈255`.

```python
from PIL import Image; import numpy as np
im=np.array(Image.open('background-v3.jpg').convert('RGB')).astype(int); g=im.mean(2)
print('open-wall mean/min:', g[1100:1500,80:300].mean(), g[1100:1500,80:300].min())
```

---

## 5. Cheat sheet za sledeći put

1. **Uzorkuj zid** (uglovi + sredina). Ako je ravan, svetao, ujednačen ton → kreni od v1/v3.
2. **Brzo i čisto (pozadina bitna, bojler može high-key):** v1 levels, bela tačka =
   najtamniji deo zida, JPEG q92. Jedan parametar, bez šavova.
3. **Najbolji izgled (pozadina bela + objekti puni + forma uzemljena):** v3 silueta-na-belo
   + meka usmerena senka. Foreground = `S>20 | V<120 | V>248`; senku tretiraj kao pozadinu;
   popuni samo zatvorene rupe; uski feather; suptilna senka (opacitet ~0.15).
4. **NE radi v2** (maskirano selektivno beljenje) — halo + šavovi jer zid i bojler dele ton.
5. **Uvek**: radi iz `*-original.jpg` (ne nad već obrađenim JPEG-om — dupli gubitak),
   pregledaj rezultat (Read tool/screenshot), izmeri belinu zida iz fajla.
6. **Na sajtu**: i hero `background` fallback boja stavi na `#ffffff` (ne `#eef1f4`) da nema
   sive ivice gde slika ne pokriva (slika je `background-size:81%`) — vidi
   `metalac/darjan-sajt/index.html` `.hero`.
7. Privremene `.py`/screenshot fajlove drži u scratchpad-u; u repo idu samo `background-v*.jpg`.
```
