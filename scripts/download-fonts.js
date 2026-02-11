const https = require('https');
const fs = require('fs');

function download(url, dest) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return download(res.headers.location, dest).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                fs.writeFileSync(dest, buf);
                console.log(`${dest}: ${buf.length} bytes`);
                resolve();
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function main() {
    fs.mkdirSync('public/fonts', { recursive: true });

    // Inter v3.19 - complete font files (all glyphs, not subset)
    await download(
        'https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Regular.woff',
        'public/fonts/Inter-Regular.woff'
    );
    await download(
        'https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Bold.woff',
        'public/fonts/Inter-Bold.woff'
    );
}

main().catch((e) => { console.error(e); process.exit(1); });
