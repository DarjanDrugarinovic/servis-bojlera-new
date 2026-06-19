# Instalacija alata (rad sa slikama)

Zajednički preduslovi za sve procese obrade slika na ovom projektu
(`servis-bojlera-new`). Na ovaj fajl se pozivaju:
[`hero-pozadina.md`](./hero-pozadina.md), [`transparentna-pozadina.md`](./transparentna-pozadina.md)
i [`pixel-perfect-sajt.md`](./pixel-perfect-sajt.md).

> Platforma: **Windows 11**, shell **PowerShell** (primarni) + **Git Bash**.
> Python skripte se pokreću kroz `python`, ostalo kroz PowerShell.

---

## 1. Provera Python-a i biblioteka

```powershell
# Da li Python postoji i gde
(Get-Command python -ErrorAction SilentlyContinue).Source
# -> C:\Users\User1\AppData\Local\Programs\Python\Python311\python.exe

# Provera da li su biblioteke već instalirane
python -c "import cv2, numpy; print('cv2', cv2.__version__)"
python -c "import PIL; print('PIL', PIL.__version__)"
```

Ako vrate `ModuleNotFoundError`, biblioteke nisu instalirane (vidi sledeći korak).

---

## 2. Instalacija OpenCV + numpy + Pillow

```powershell
python -m pip install --quiet opencv-python-headless numpy pillow
# Provera verzija
python -c "import cv2,numpy,PIL; print('cv2',cv2.__version__,'np',numpy.__version__,'PIL',PIL.__version__)"
# -> cv2 4.13.0 np 2.4.6 PIL 12.2.0
```

**Zašto `opencv-python-headless`, a ne `opencv-python`?**
`-headless` varijanta nema GUI zavisnosti (nema `cv2.imshow` prozore), što je idealno
za skripte na serveru/CI i izbegava nepotrebne GUI biblioteke. Slike ionako
**čuvamo na disk** (`cv2.imwrite`), ne prikazujemo ih u prozoru.

**Šta koja biblioteka radi:**
| Biblioteka | Uloga |
|-----------|-------|
| `cv2` (OpenCV) | obrada slike — inpainting, GrabCut, maske, konverzija boja, morfologija |
| `numpy` | rad sa pikselima kao matricama (slika = NumPy niz) |
| `pillow` (PIL) | čitanje dimenzija, skaliranje/krop, side-by-side combo i kontaktni listovi |

> Koju biblioteku traži pojedinačni proces piše u „Preduslovi" delu svakog procesnog
> dokumenta (hero-pozadina / transparentna-pozadina / pixel-perfect-sajt).

> Napomena: biblioteke ostaju trajno instalirane u Python 3.11 okruženju.
> Deinstalacija (ako zatreba): `python -m pip uninstall opencv-python-headless numpy pillow`

### Bez instalacije (samo za neke zadatke)

- **Kropovanje pravougaonika** → .NET `System.Drawing` (dolazi uz Windows) — vidi
  [`hero-pozadina.md`](./hero-pozadina.md).
- **Render/screenshot** → Microsoft Edge headless (već na sistemu) ili Chrome DevTools (MCP).

---

## 3. Privremeni fajlovi i čišćenje

Sve radne fajlove (preview maske, međukoraci, screenshot-ovi, `.py` skripte, `_measure.html`)
imenuj sa prefiksom `_` i obriši na kraju:

```powershell
$f = "C:\Users\User1\Desktop\servis-bojlera-new"
Get-ChildItem $f -Filter "_*" -File | Remove-Item -Force
```

Na kraju u folderu ostaju samo **rezultati** (npr. `hero_clean.jpg`,
`kapilarni-termostat.png`), ne i radni kod/screenshot-ovi.

> Alternativa: radne fajlove drži u scratchpad direktorijumu van projekta, a u repo
> kopiraj samo finalne slike.
