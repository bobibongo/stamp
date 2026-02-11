// Script to download open-licensed fonts for StampMaster
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const FONTS_DIR = join(import.meta.dirname, '..', 'public', 'fonts');

const FONTS_TO_DOWNLOAD = [
    // Arimo (Apache 2.0) — metryczny zamiennik Arial (z Google Fonts)
    {
        name: 'Arimo-Regular.ttf',
        dir: 'arimo',
        url: 'https://github.com/google/fonts/raw/main/apache/arimo/Arimo%5Bwght%5D.ttf',
    },
    // Tinos (Apache 2.0) — metryczny zamiennik Times New Roman
    {
        name: 'Tinos-Regular.ttf',
        dir: 'tinos',
        url: 'https://github.com/google/fonts/raw/main/apache/tinos/Tinos-Regular.ttf',
    },
    {
        name: 'Tinos-Bold.ttf',
        dir: 'tinos',
        url: 'https://github.com/google/fonts/raw/main/apache/tinos/Tinos-Bold.ttf',
    },
    // Roboto (Apache 2.0) — variable font
    {
        name: 'Roboto-Regular.ttf',
        dir: 'roboto',
        url: 'https://github.com/google/fonts/raw/main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf',
    },
];

async function downloadFont(font) {
    const dir = join(FONTS_DIR, font.dir);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const outPath = join(dir, font.name);
    if (existsSync(outPath)) {
        console.log(`  OK Already exists: ${font.dir}/${font.name}`);
        return;
    }

    console.log(`  -> Downloading: ${font.dir}/${font.name}...`);
    const resp = await fetch(font.url, { redirect: 'follow' });
    if (!resp.ok) {
        console.error(`  !! FAILED HTTP ${resp.status} for ${font.url}`);
        return;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    await writeFile(outPath, buffer);
    console.log(`  OK Saved: ${font.dir}/${font.name} (${buffer.length} bytes)`);
}

console.log('Downloading open-licensed fonts...\n');
for (const font of FONTS_TO_DOWNLOAD) {
    await downloadFont(font);
}
console.log('\nDone!');
