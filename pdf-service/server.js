const express = require('express');
const puppeteer = require('puppeteer-core');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const app = express();

// Manual CORS middleware
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Zwiększamy limit, bo SVG może być duży (zawierać Base64 obrazków itp.)
app.use(bodyParser.json({ limit: '50mb' }));

const FONT_DIR = path.join(__dirname, 'fonts');

// ── Helper: Map Font Files to CSS @font-face (Recursive) ───────
const getFontFaceCss = () => {
    if (!fs.existsSync(FONT_DIR)) return '';

    const fontFaces = [];
    const scanDir = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                scanDir(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (['.ttf', '.otf', '.woff', '.woff2'].includes(ext)) {
                    const fontName = path.parse(entry.name).name;
                    const base64 = fs.readFileSync(fullPath).toString('base64');

                    // Uproszczone mapowanie: używamy nazwy pliku jako font-family
                    fontFaces.push(`
                    @font-face {
                        font-family: '${fontName}';
                        src: url(data:font/ttf;base64,${base64}) format('truetype');
                        font-weight: normal;
                        font-style: normal;
                    }
                    @font-face {
                        font-family: '${fontName}';
                        src: url(data:font/ttf;base64,${base64}) format('truetype');
                        font-weight: bold;
                        font-style: normal;
                    }
                    `);
                }
            }
        }
    };

    scanDir(FONT_DIR);
    return fontFaces.join('\n');
};

let fontFacesCache = '';

// ── Endpoint: Generate PDF ───────────────────────────────────
app.post('/generate-pdf', async (req, res) => {
    const { svgContent, widthMm, heightMm, widthPx: reqWidthPx, heightPx: reqHeightPx } = req.body;

    if (!svgContent || !widthMm || !heightMm) {
        return res.status(400).send('Missing parameters: svgContent, widthMm, heightMm');
    }

    // Odśwież cache fontów przy każdym żądaniu
    if (!fontFacesCache) fontFacesCache = getFontFaceCss();

    let browser;
    try {
        const executablePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
            ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
            : fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
                ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
                : null;

        if (!executablePath) {
            throw new Error('Nie znaleziono Chrome ani Edge w standardowych lokalizacjach Windows.');
        }

        browser = await puppeteer.launch({
            executablePath: executablePath,
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--font-render-hinting=none',
                '--force-device-scale-factor=1'
            ]
        });
        const page = await browser.newPage();

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    @page {
                        size: ${widthMm}mm ${heightMm}mm;
                        margin: 0;
                    }
                    * { margin: 0; padding: 0; box-sizing: border-box; outline: none; }
                    ${fontFacesCache}
                    body { 
                        margin: 0; 
                        padding: 0; 
                        background-color: white;
                        width: ${widthMm}mm;
                        height: ${heightMm}mm;
                        overflow: hidden;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    svg {
                        width: ${widthMm}mm;
                        height: ${heightMm}mm;
                        display: block;
                        background-color: white;
                        shape-rendering: geometricPrecision;
                    }
                </style>
            </head>
            <body>
                ${svgContent}
            </body>
            </html>
        `;

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            width: `${widthMm}mm`,
            height: `${heightMm}mm`,
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
            pageRanges: '1',
            preferCSSPageSize: true
        });

        // ── Krok Perfekcjonisty: Normalizacja wymiarów przez pdf-lib ──
        const pdfDoc = await PDFDocument.create();
        const externalPdf = await PDFDocument.load(pdfBuffer);

        // Docelowe wymiary w punktach (1/72 cala) - definicja matematyczna
        const targetWidthPt = (widthMm * 72) / 25.4;
        const targetHeightPt = (heightMm * 72) / 25.4;

        const pageFinal = pdfDoc.addPage([targetWidthPt, targetHeightPt]);

        const [embeddedPage] = await pdfDoc.embedPdf(externalPdf, [0]);

        // Rysujemy stronę wypełniając idealnie obszar docelowy
        pageFinal.drawPage(embeddedPage, {
            x: 0,
            y: 0,
            width: targetWidthPt,
            height: targetHeightPt,
        });

        const finalPdfBytes = await pdfDoc.save();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': finalPdfBytes.length,
            'Content-Disposition': `attachment; filename="stamp_${Date.now()}.pdf"`
        });
        res.send(Buffer.from(finalPdfBytes));

    } catch (err) {
        console.error('PDF Generation Error:', err);
        res.status(500).send("Internal Server Error: " + err.message);
    } finally {
        if (browser) await browser.close();
    }
});

// ── Endpoint: Resize PDF ──────────────────────────────────────
app.post('/resize-pdf', async (req, res) => {
    try {
        const { pdfBase64, widthMm, heightMm } = req.body;

        if (!pdfBase64 || !widthMm || !heightMm) {
            return res.status(400).send('Missing parameters: pdfBase64, widthMm, heightMm');
        }

        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const embeddedPdf = await PDFDocument.create();

        // Docelowe wymiary w punktach
        const MM_TO_PT = 72 / 25.4;
        const targetWidthPt = widthMm * MM_TO_PT;
        const targetHeightPt = heightMm * MM_TO_PT;

        // Tworzymy NOWY dokument z idealnymi wymiarami
        const newPdfDoc = await PDFDocument.create();
        const page = newPdfDoc.addPage([targetWidthPt, targetHeightPt]);

        // Kopiujemy pierwszą stronę z oryginału
        const [embeddedPage] = await newPdfDoc.embedPdf(pdfDoc, [0]);

        // Rysujemy ją na nowej stronie, dopasowując do wymiarów
        page.drawPage(embeddedPage, {
            x: 0,
            y: 0,
            width: targetWidthPt,
            height: targetHeightPt,
        });

        // Kopiujemy metadane (MediaBox itp) dla pewności
        page.setMediaBox(0, 0, targetWidthPt, targetHeightPt);
        page.setBleedBox(0, 0, targetWidthPt, targetHeightPt);
        page.setTrimBox(0, 0, targetWidthPt, targetHeightPt);
        page.setArtBox(0, 0, targetWidthPt, targetHeightPt);

        const finalPdfBytes = await newPdfDoc.save();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': finalPdfBytes.length,
            'Content-Disposition': `attachment; filename="resized_${Date.now()}.pdf"`
        });
        res.send(Buffer.from(finalPdfBytes));

    } catch (err) {
        console.error('PDF Resize Error:', err);
        res.status(500).send("Internal Server Error: " + err.message);
    }
});

const PORT = 3001; // Używamy portu 3001, aby nie kolidował z Next.js (3000)
app.listen(PORT, () => {
    console.log(`PDF Microservice running on port ${PORT}`);
    if (!fs.existsSync(FONT_DIR)) {
        fs.mkdirSync(FONT_DIR, { recursive: true });
    }
});
