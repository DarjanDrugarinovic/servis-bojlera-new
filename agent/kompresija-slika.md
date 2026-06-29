# Kompresija slika — ubrzavanje učitavanja stranice (resize + WebP)

Cilj: smanjiti veličinu slika koje sajt učitava, bez vidljivog gubitka kvaliteta.
Tipičan problem na ovom projektu: AI-generisani renderi su ogromni (~1–1.8 MB,
dimenzije ~1250×1250 px), a na stranici se prikazuju sitno (npr. 130–230 px u
karuselu). Browser dovlači 5–10× više piksela nego što mu treba → sporo učitavanje.

> Preduslovi: Python + **Pillow (PIL)** — već instalirano
> ([`instalacija-alata.md`](./instalacija-alata.md) §2). Bez novih alata.
> Konkretan primer: sekcije „Popularni modeli" i „Najčešći kvarovi" u
> `metalac/darjan-sajt/index.html`.

---

## 0. Da li je neki postojeći alat dovoljan? (DA)

| Alat | Kompresija | Kako |
|------|-----------|------|
| **Pillow (PIL)** ✅ korišćeno | da | `Image.save(out, "WEBP", quality=82, method=6)` |
| OpenCV (`cv2`) | da | `cv2.imwrite("x.webp", img, [cv2.IMWRITE_WEBP_QUALITY, 82])` |
| `cwebp`, ImageMagick `magick` | da | nisu instalirani na ovom sistemu (ne treba ih instalirati) |

`convert` koji je u PATH-u na Windowsu **nije** ImageMagick nego Windowsov
`convert.exe` (FAT→NTFS) — ignoriši ga.

Biramo **Pillow** jer je već tu, a daje i `resize` (LANCZOS) i WebP enkoder u jednom.

---

## 1. Dijagnoza pre kompresije

Prvo izmeri stvarno stanje (ne nagađaj):

```bash
# veličine po fajlu (Git Bash)
cd metalac/darjan-sajt/assets
ls -la danilo/bojleri/*/*.png | awk '{print $5, $9}' | sort -rn | head
du -sh .            # ukupno
```

Zatim utvrdi **koje se slike zaista koriste** u HTML-u (samo njih ima smisla dirati):

```bash
grep -oE "assets/[^\"']*\.(png|jpg|jpeg|webp)" index.html | sort -u
```

Uporedi prikaznu veličinu (iz CSS-a, npr. `.mimg img{max-height:92px}` /
`max-height:130px` u media query) sa stvarnim dimenzijama slike. Ako je slika
višestruko veća od prikaza → kandidat za smanjenje.

---

## 2. Izbor ciljne rezolucije i kvaliteta

- **Max dimenzija:** uzmi najveći prikaz na stranici i pomnoži ×2 (retina).
  Primer: kartice se prikazuju do ~230 px → `MAX = 500` je sasvim dovoljno i oštro.
- **Kvalitet WebP:** `quality=82` je dobar kompromis (vizuelno isto, mala veličina).
  `method=6` = najsporiji/najbolji enkoding (svejedno je za par sekundi).
- **`thumbnail()` a ne `resize()`** — `thumbnail` čuva proporcije i **nikad ne
  uvećava** (ako je slika manja od MAX, ostaje kakva jeste).

---

## 3. Skripta (resize + WebP), čuva originale

Originali (`.png`) se **ne brišu** — `.webp` se snima pored njih, pa je promena
reverzibilna (samo se promene reference u HTML-u, korak 4).

```python
from PIL import Image
import os

files = [   # SAMO slike koje se koriste u HTML-u (vidi korak 1)
    "assets/danilo/bojleri/aurora/aurora.png",
    "assets/danilo/bojleri/ceramic/ceramic.png",
    # ... ostali ...
]

MAX = 500
total_old = total_new = 0
for f in files:
    old = os.path.getsize(f)
    im = Image.open(f).convert("RGBA")          # RGBA da sačuva providnost ako je ima
    im.thumbnail((MAX, MAX), Image.LANCZOS)     # LANCZOS = najkvalitetnije smanjenje
    out = os.path.splitext(f)[0] + ".webp"
    im.save(out, "WEBP", quality=82, method=6)
    new = os.path.getsize(out)
    total_old += old; total_new += new
    print(f"{os.path.basename(out):28s} {im.size[0]}x{im.size[1]}  {old//1024:5d}KB -> {new//1024:4d}KB")

print(f"\nUKUPNO: {total_old//1024}KB -> {total_new//1024}KB  ({100-total_new*100//total_old}% manje)")
```

> Napomena: `.convert("RGBA")` je bezbedno i za neprovidne slike. Ako su sve
> garantovano bez alfe i želiš još manje fajlove, može `.convert("RGB")`.

---

## 4. Ažuriranje referenci u HTML-u (`.png` → `.webp`)

Pošto ista slika ume da se pojavi više puta (npr. original + `.dup` duplikat u
karuselu), zameni **sve** pojave za svaki path:

```python
paths = [   # bez ekstenzije
    "assets/danilo/bojleri/aurora/aurora",
    # ... isti spisak kao gore ...
]
s = open("index.html", encoding="utf-8").read()
n = 0
for p in paths:
    n += s.count(p + ".png")
    s = s.replace(p + ".png", p + ".webp")
open("index.html", "w", encoding="utf-8").write(s)
print(f"Zamenjeno {n} referenci (.png -> .webp)")
```

---

## 5. Provera rezultata

```bash
# nove veličine
ls -la assets/danilo/bojleri/*/*.webp | awk '{print $5, $9}'
# da nije ostala neka .png referenca koju smo hteli da zamenimo
grep -o 'assets/danilo[^"]*\.png' index.html | sort -u
```

Vizuelno: otvori stranicu u Chrome DevTools → **Network** tab → filtriraj po `Img`
i proveri ukupan transfer sekcije. Pogledaj i da slike izgledaju oštro na 2× zoom-u
(ako su mutne, povećaj `MAX` ili `quality`).

---

## 6. Rezultat na konkretnom primeru (jun 2026, `darjan-sajt`)

10 korišćenih slika (6 hero bojlera + 4 kvara), `MAX=500`, `quality=82`:

| | Pre (PNG) | Posle (WebP) |
|---|---|---|
| ukupno | **~12.9 MB** | **~140 KB** |
| po slici | ~1.0–1.8 MB | ~3–32 KB |
| ušteda | — | **~99%** |

Zamenjeno **20 referenci** u `index.html` (svaka slika 2×: original + `.dup`).
Ostale slike na stranici (`background-v1.jpg` 51 KB, `shield.png` 11 KB,
`heater.png` 17 KB) su već bile male — nisu dirane.

---

## 7. Sažet „cheat sheet"

1. **Izmeri** (`ls -la`, `du -sh`) i nađi **koje se slike koriste** (`grep` po `index.html`).
2. Uporedi stvarne dimenzije sa prikaznom veličinom iz CSS-a → smanji samo prevelike.
3. **Ciljna rezolucija** = najveći prikaz ×2 (retina); ovde `MAX=500` bilo dovoljno.
4. **Pillow**: `convert("RGBA")` → `thumbnail((MAX,MAX), LANCZOS)` → `save(... "WEBP", quality=82, method=6)`.
5. Snimi `.webp` **pored** originala (reverzibilno), pa **zameni reference** `.png`→`.webp` (sve pojave, uklj. `.dup`).
6. **Proveri**: veličine fajlova, da nema zaostalih `.png` referenci, oštrina u DevTools Network/Elements.
7. Originalne `.png` i nekorišćene slike možeš kasnije obrisati radi mesta u repo-u
   (ne utiče na brzinu — bitno je samo šta HTML referencira). Privremene fajlove
   čisti po [`instalacija-alata.md`](./instalacija-alata.md) §3.
