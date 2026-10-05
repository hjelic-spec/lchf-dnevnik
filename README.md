# Porki

Jednostavna aplikacija za kontrolu težine na LCHF / keto prehrani.

- **Danas** – brzi unos težine, neto ugljikohidrati prema dnevnom limitu, makronutrijenti, potrošene kalorije i energetska bilanca, zadnje mjerenje ketona
- **Hrana** – unos ugljikohidrata, vlakana, masti i proteina (po porciji ili na 100 g), favoriti i nedavna hrana za unos jednim dodirom
- **Baza namirnica** – ~100 namirnica (meso, riba, mliječni, povrće, orašasti plodovi…) + online pretraga [Open Food Facts](https://world.openfoodfacts.org)
- **Skener barkoda** – kamera prepozna EAN kod, vrijednosti se povuku iz Open Food Factsa i zapamte za sljedeći put
- **Post** – timer s ciljem (12–24 h), početak od zadnjeg obroka, faze posta, obavijest kad je cilj ostvaren (Android) i tjedni pregled u Analizi
- **Težina** – graf s 7-dnevnim prosjekom, tempo kg/tjedan, BMI, procjena kad ćeš doći do cilja
- **Ketoni** – Keto-Diastix trakice (ketoni + glukoza), pregled zadnjih 30 dana, upozorenja
- **Analiza** – tjedni prosjeci, automatski uvidi, grafovi, tablica po danima i trend zadnjih 8 tjedana

Svi podaci ostaju **samo na uređaju**. Sigurnosnu kopiju napraviš u Postavke → Izvezi kopiju.

## Android aplikacija (preporučeno – automatski uvoz iz Health Connecta)

1. Na mobitelu otvori stranicu [Releases](https://github.com/hjelic-spec/porki/releases/latest) i preuzmi `porki.apk`.
2. Otvori datoteku i dopusti instalaciju iz tog izvora (Chrome / Datoteke → „Dopusti iz ovog izvora“).
3. Pokreni aplikaciju i dodirni **Dopusti** → odobri čitanje kalorija, koraka i težine.
4. Provjeri da tvoja aplikacija za sat ili aktivnost (Samsung Health, Google Fit, Fitbit, Garmin…) šalje podatke u Health Connect: *Postavke → Health Connect → Dozvole aplikacija*.

Aplikacija pri svakom otvaranju sinkronizira zadnjih 7 dana. Ručni unos za neki dan ima prednost pred sinkronizacijom.
Za Health Connect je potreban Android 9 ili noviji. Od Androida 14 je ugrađen u sustav, a na starijim verzijama aplikacija nudi instalaciju s Play Storea.

**Ažuriranje:** instaliraj novi APK preko postojećeg. Podaci ostaju sačuvani dok je APK potpisan istim ključem (gradi se na istom računalu).

## Web-verzija

https://hjelic-spec.github.io/porki/ – radi u svakom pregledniku i može se instalirati na početni zaslon. Web ne može čitati Health Connect, pa se potrošnja unosi ručno. Web i Android aplikacija imaju **odvojene podatke** – prenesi ih izvozom i uvozom kopije.

## Razvoj

```
npm install
npm run serve          # web na http://localhost:5173
npm run apk            # sync + android/app/build/outputs/apk/debug/app-debug.apk
```

Za build je potreban JDK 21 (`JAVA_HOME`) i Android SDK. Kod je u `www/` (čisti HTML/CSS/JS, bez bundlera), a nativni most prema Health Connectu je u `android/app/src/main/java/hr/lchf/dnevnik/HealthBridgePlugin.kt`.
