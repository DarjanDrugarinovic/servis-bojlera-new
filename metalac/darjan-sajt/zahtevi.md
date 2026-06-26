# Tehnička specifikacija: UI/UX optimizacija za mobilne uređaje

Ovaj dokument sadrži zahteve za izmenu postojećeg koda (`index.html` i pratećih CSS stilova) na osnovu audio i video analize snimka ekrana. Cilj izmena je poboljšanje čitljivosti, smanjenje vizuelnog zagušenja i optimizacija konverzije na mobilnim ekranima.

## 1. Zaglavlje sajta (`<header>`)
* **Kompaktnost:** Smanjiti ukupnu visinu plavog zaglavlja (`padding` i `margin`) kako bi zauzimalo manje vertikalnog prostora na mobilnim ekranima.
* **Logotip:** Element "Metalac servis bojlera" i ikonicu kapi ređati i stilizovati tako da budu kompaktniji i u ravnijoj liniji.
* **Uklanjanje suvišnih informacija:** Potpuno izbaciti prikaz broja telefona (`.head-phone`) iz zaglavlja, jer se fiksni pozivi rešavaju kroz glavne akcione dugmiće niže na stranici.

## 2. Hero sekcija (`.hero`)
* **Pozadina:** Ukloniti trenutnu pozadinsku sliku (`background.jpg`) i zameniti je čistom, potpuno belom pozadinom (`#ffffff`). Ovo sprečava preklapanje teksta sa elementima slike na užim ekranima.
* **Tipografija i poravnanje:**
    * Tekst "SERVIS BOJLERA METALAC" i podnaslov približiti i izjednačiti po visini sa renderom samog bojlera (da budu u istoj horizontalnoj ravni).
    * Smanjiti prored (`line-height`) i vertikalni razmak iznad liste prednosti (`.checks`) kako bi se ceo blok blago povukao nagore.
* **Glavni akcioni dugmići (`.hero-btns`):**
    * **Varijanta A (Primarna):** Dugme "POZOVI ODMAH" treba da sadrži samo tekstualni poziv na akciju bez ispisanog broja telefona u samom dugmetu.
    * **Dimenzije ikonica:** Smanjiti visinu/debljinu ikonica unutar dugmića (Telefon i WhatsApp) kako bi dugmad izgledala elegantnije i manje robusno na mobilnom uređaju.
    * *Alternativni raspored (opciono):* Ako se dugmad preklapaju, postaviti "POZOVI ODMAH" u punoj širini, a "WHATSAPP" odmah ispod njega.

## 3. Traka sa statistikama (`.stats`)
* **Širina i padding:** Sužiti ceo plavi blok sa statistikama po horizontalnoj osi. Povećati bočne margine (`margin-left` / `margin-right`) i smanjiti unutrašnji razmak (`padding`) kako elementi unutar trake ne bi izgledali preširoko i razvučeno.

## 4. Naslovi sekcija (`h2.title`)
* **Smanjenje fonta:** Naslove sekcija "NAJČEŠĆI KVAROVI" i "POPULARNI MODELI" značajno smanjiti na mobilnim ekranima (responsive font-size). 
* **Zaštita od prelamanja:** Font mora biti dovoljno mali da naslov komotno stane u širinu ekrana bez ružnog prelamanja reči u novi red.

## 5. Karusel / Sekcija sa kvarovima (`.faults-track`)
* **Sličice i linkovi:** Omogućiti promenu postojećih privremenih sličica adekvatnim grafičkim prikazima kvarova.
* **Povezivanje:** Svaka kartica kvara mora voditi (link) ka posebnoj podstranici koja detaljno opisuje taj specifični kvar.

## 6. Originalni delovi (`.original`)
* **Peglanje pozadine:** Ceo ovaj blok (tekstualni deo, ikonica štita i slika grejača) postaviti na čistu belu pozadinu.
* **Kompaktnost:** Smanjiti ukupnu visinu ove sekcije kako bi bila u skladu sa ostatkom pročišćenog dizajna.

## 7. Donja fiksna/CTA traka (`.cta`)
* **Uklanjanje opcija:** Potpuno ukloniti dugme "ZAKAŽI TERMIN ONLINE" kako se ne bi zbunjivali korisnici na mobilnim telefonima koji žele brzu intervenciju.
* **Puna širina za poziv:** Preostalo dugme "POZOVITE ODMAH" proširiti na **100% širine trake**, centrirati ga i ukloniti sirovi ispis broja telefona iz teksta dugmeta (čist CTA).