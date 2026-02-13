To bardzo częsty i frustrujący problem w systemach Web-to-Print. Różnica rzędu 0.1–0.4 mm wynika najczęściej z niedokładności przeliczania jednostek (piksele vs punkty vs milimetry) oraz sposobu, w jaki przeglądarki i biblioteki PDF traktują zaokrąglenia liczb zmiennoprzecinkowych.

W Twoim stosie (Fabric.js + pdf-lib/jspdf) problem leży prawdopodobnie na styku **PPI (Pixels Per Inch)** przeglądarki a **DPI (Dots Per Inch)** pliku PDF.

Oto konkretne kroki i rozwiązania matematyczne, które pozwolą Ci uzyskać idealny wymiar ("pixel-perfect" dla druku).

### 1. Zrozumienie natywnej jednostki PDF

Format PDF nie "myśli" w milimetrach ani pikselach. Jego natywną jednostką jest **Point (pt)**.
Standard w PDF to:


Aby uzyskać idealny wymiar w milimetrach, musisz ręcznie przeliczyć go na punkty PDF z dużą precyzją, zanim przekażesz go do biblioteki.

**Złoty wzór konwersji:**


### 2. Rozwiązanie dla `pdf-lib` (Rekomendowane dla precyzji)

`pdf-lib` jest bardziej niskopoziomowe i domyślnie operuje na punktach (Points). Jeśli podajesz wymiary przeliczone "na oko" lub przez proste mnożenie, błąd się kumuluje.

Zastosuj taką funkcję pomocniczą:

```typescript
// lib/unit-conversion.ts

export const mmToPt = (mm: number): number => {
  // Używamy precyzyjnego dzielenia, wynik to punkty PDF
  return (mm * 72) / 25.4;
};

// Przykład użycia przy tworzeniu strony
import { PDFDocument } from 'pdf-lib';

export const createPrecisePdf = async (widthMm: number, heightMm: number) => {
  const pdfDoc = await PDFDocument.create();
  
  // Obliczamy wymiary strony z maksymalną precyzją
  const widthPt = mmToPt(widthMm);
  const heightPt = mmToPt(heightMm);

  const page = pdfDoc.addPage([widthPt, heightPt]);
  
  // ... reszta logiki
};

```

### 3. Rozwiązanie dla `jspdf`

Jeśli używasz `jspdf`, biblioteka pozwala zdefiniować jednostkę w konstruktorze, ale wewnętrznie i tak dokonuje konwersji. Często błąd wynika z tego, że `jspdf` używa wewnętrznego przelicznika, który może różnić się od tego w Fabric.js.

Wymuś precyzyjne wymiary przy inicjalizacji:

```typescript
import jsPDF from 'jspdf';

// Zamiast polegać na domyślnym A4, zdefiniuj format ręcznie
const doc = new jsPDF({
  orientation: width > height ? 'landscape' : 'portrait',
  unit: 'mm', // Ważne: ustawiamy mm
  format: [widthMm, heightMm], // Dokładne wymiary w mm (np. [38, 14])
  putOnlyUsedFonts: true,
  floatPrecision: 16 // Zwiększ precyzję liczb (domyślnie jest niska)
});

```

*Kluczowe jest ustawienie `floatPrecision`. Domyślna wartość w jspdf często zaokrągla współrzędne, co przy małych pieczątkach powoduje przesunięcia.*

### 4. Pułapka Fabric.js: Stroke Width (Obramowanie)

To najczęstsza przyczyna "dziwnych" wymiarów (np. 38.4mm zamiast 38mm).
Fabric.js renderuje obramowanie (stroke) w połowie **wewnątrz** i w połowie **na zewnątrz** obiektu.
Jeśli Twoja pieczątka ma ramkę o grubości 1px (lub przeliczoną na mm), to fizyczny rozmiar wyeksportowanego obrazka zwiększa się o połowę grubości ramki z każdej strony.

**Rozwiązanie:**
Podczas eksportu z Fabric.js musisz upewnić się, że eksportujesz **obszar roboczy (workspace)**, a nie sumę obiektów, lub zastosować `clipPath`.

```typescript
// W canvas-logic.ts podczas eksportu
const scaleFactor = 4; // Wyższa jakość dla druku (np. 300 DPI zamiast 72/96)

const dataUrl = canvas.toDataURL({
  format: 'png',
  multiplier: scaleFactor, 
  // Ważne: wymuś przycięcie do oryginalnych wymiarów canvasu
  width: canvas.width, 
  height: canvas.height,
  left: 0,
  top: 0
});

```

### 5. Problem PPI w Fabric.js vs PDF

Przeglądarki zazwyczaj traktują 1 cal jako 96 pikseli (CSS pixels). PDF traktuje 1 cal jako 72 punkty.
Jeśli ustawisz canvas w Fabric.js używając konwersji `1mm = 3.7795px` (bazując na 96 DPI), a potem wrzucisz to do PDF bez skalowania, wymiar się rozjedzie.

**Strategia "Sztywny Kontener":**
Nie pozwól, aby rozmiar obrazka z Fabric.js dyktował rozmiar PDF. Zrób odwrotnie:

1. Stwórz stronę PDF o idealnych wymiarach wektorowych (używając funkcji `mmToPt` z punktu 2).
2. Wygeneruj obraz z Fabric (jako PNG lub SVG).
3. Wstaw obraz do PDF, **wymuszając** jego wymiary, aby pasowały do strony.

```typescript
// Przykład dla pdf-lib
const pngImage = await pdfDoc.embedPng(fabricDataUrl);

page.drawImage(pngImage, {
  x: 0,
  y: 0,
  width: page.getWidth(),  // Dopasuj idealnie do szerokości strony (w pt)
  height: page.getHeight(), // Dopasuj idealnie do wysokości strony (w pt)
});

```

W ten sposób, nawet jeśli Fabric wygeneruje obrazek o 2 piksele za duży/mały, `pdf-lib` przeskaluje go idealnie do zadanego wymiaru milimetrowego (skonwertowanego na punkty).

### Podsumowanie - co wdrożyć najpierw?

1. Upewnij się, że obliczasz wymiary strony PDF używając wzoru .
2. Przy wstawianiu obrazu/SVG do PDF **zawsze** podawaj argumenty `width` i `height` równe wymiarom strony PDF, zamiast pozwalać bibliotece na "auto-size" na podstawie pikseli obrazka.
3. Jeśli używasz `jspdf`, ustaw `floatPrecision: 16`.

Czy chcesz, abym przygotował gotowy snippet dla pliku `lib/canvas-logic.ts`, który obsługuje eksport z uwzględnieniem tego przelicznika?