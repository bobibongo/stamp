import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const FONTS_DIR = join(import.meta.dirname, '..', 'public', 'fonts');

// Mapa fontów z export-logic.ts
const FONT_MAP = {
    'Arimo': { regular: '/arimo/Arimo-Regular.ttf' },
    'Tinos': { regular: '/tinos/Tinos-Regular.ttf', bold: '/tinos/Tinos-Bold.ttf' },
    'Roboto': { regular: '/roboto/Roboto-Regular.ttf' },
    'Montserrat': { regular: '/Inter,Montserrat/Montserrat/static/Montserrat-Regular.ttf' },
    'Inter': {
        regular: '/Inter,Montserrat/Inter/static/Inter_18pt-Regular.ttf',
        bold: '/Inter,Montserrat/Inter/static/Inter_18pt-Bold.ttf'
    }
};

async function testFontEmbedding() {
    console.log('--- Rozpoczynam test osadzania fontów ---');

    try {
        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);
        const page = pdfDoc.addPage([500, 800]);
        let y = 750;

        for (const [familyName, variants] of Object.entries(FONT_MAP)) {
            console.log(`Testuję: ${familyName}`);

            // Test Regular
            const regularPath = join(FONTS_DIR, variants.regular);
            try {
                const fontBytes = await readFile(regularPath);
                console.log(`  Wczytano plik: ${variants.regular} (${fontBytes.length} bajtów)`);

                const font = await pdfDoc.embedFont(fontBytes, { subset: true });
                console.log(`  Font osadzony poprawnie.`);

                page.drawText(`${familyName} Regular: Zażółć gęślą jaźń 123`, {
                    x: 50,
                    y: y,
                    size: 18,
                    font: font
                });
                y -= 30;
            } catch (e) {
                console.error(`  BŁĄD przy ${familyName} Regular:`, e.message);
            }

            // Test Bold (jeśli jest)
            if (variants.bold) {
                const boldPath = join(FONTS_DIR, variants.bold);
                try {
                    const fontBytes = await readFile(boldPath);
                    console.log(`  Wczytano plik: ${variants.bold} (${fontBytes.length} bajtów)`);

                    const font = await pdfDoc.embedFont(fontBytes, { subset: true });
                    console.log(`  Font Bold osadzony poprawnie.`);

                    page.drawText(`${familyName} Bold: Zażółć gęślą jaźń 123`, {
                        x: 50,
                        y: y,
                        size: 18,
                        font: font
                    });
                    y -= 30;
                } catch (e) {
                    console.error(`  BŁĄD przy ${familyName} Bold:`, e.message);
                }
            }
            y -= 20;
        }

        const pdfBytes = await pdfDoc.save();
        await writeFile('test_fonts.pdf', pdfBytes);
        console.log('\n--- Zapisano test_fonts.pdf ---');
        console.log('Sprawdź ten plik, czy wszystkie napisy są widoczne.');

    } catch (err) {
        console.error('FATAL ERROR:', err);
    }
}

testFontEmbedding();
