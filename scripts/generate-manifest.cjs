const fs = require('fs');
const path = require('path');

async function generateManifest() {
    console.log('--- Starting Exhaustive Manifest Generation ---');

    const version = process.env.PACKAGE_VERSION || require('../package.json').version;
    const tagName = process.env.GITHUB_REF_NAME || `v${version}`;
    const repo = process.env.GITHUB_REPOSITORY || '3mreconf/confpass';

    console.log(`App Version: ${version}`);
    console.log(`Tag Name: ${tagName}`);
    console.log(`Repo: ${repo}`);

    const baseDir = path.join(__dirname, '..');
    console.log(`Searching from: ${baseDir}`);

    const allFiles = [];
    const findFilesRecursive = (dir) => {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                // Skip some obvious ones to keep log clean but searchable
                if (item === 'node_modules' || item === '.git' || item === '.next' || item === 'target') {
                    // But still check target/release/bundle specifically
                    if (fullPath.includes('target') && (fullPath.endsWith('target') || fullPath.endsWith('release'))) {
                        findFilesRecursive(fullPath);
                    }
                    continue;
                }
                findFilesRecursive(fullPath);
            } else {
                allFiles.push(fullPath);
            }
        }
    };

    // Special scan for bundle directory
    const scanBundleDir = (dir) => {
        if (!fs.existsSync(dir)) return;
        console.log(`--- Tree Listing: ${dir} ---`);
        const walk = (d, indent = '') => {
            const items = fs.readdirSync(d);
            items.forEach(item => {
                const p = path.join(d, item);
                const s = fs.statSync(p);
                console.log(`${indent}${s.isDirectory() ? '[DIR]' : '[FILE]'} ${item}`);
                if (s.isDirectory()) walk(p, indent + '  ');
            });
        };
        walk(dir);
    };

    // Diagnostic: look for bundle dirs
    const bundleDirs = [
        path.join(baseDir, 'src-tauri', 'target', 'release', 'bundle'),
        path.join(baseDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'bundle')
    ];
    bundleDirs.forEach(scanBundleDir);

    findFilesRecursive(baseDir);

    console.log(`Total files found: ${allFiles.length}`);

    const sigFiles = allFiles.filter(f => f.endsWith('.sig'));
    const zipFiles = allFiles.filter(f => f.endsWith('.zip'));
    const msiFiles = allFiles.filter(f => f.endsWith('.msi'));
    const exeFiles = allFiles.filter(f => f.endsWith('.exe'));

    console.log('--- Artifacts Found ---');
    console.log(`Signatures (${sigFiles.length}): ${sigFiles.map(f => path.basename(f)).join(', ')}`);
    console.log(`ZIPs (${zipFiles.length}): ${zipFiles.map(f => path.basename(f)).join(', ')}`);
    console.log(`MSIs (${msiFiles.length}): ${msiFiles.map(f => path.basename(f)).join(', ')}`);
    console.log(`EXEs (${exeFiles.length}): ${exeFiles.map(f => path.basename(f)).join(', ')}`);

    if (sigFiles.length > 0) {
        console.log('--- Signature File Paths ---');
        sigFiles.forEach(f => console.log(f));
    }

    if (sigFiles.length === 0 || zipFiles.length === 0) {
        console.warn('⚠️ No updater files (.sig/.zip) found! Did you set TAURI_SIGNING_PRIVATE_KEY?');

        // If we found MSIs/EXEs but no ZIPs, maybe we need to zip them ourselves?
        // But Tauri SHOULD do it.
        process.exit(1);
    }

    const platforms = {};

    // Try to find a matching pair
    // Windows x64
    const winSig = sigFiles.find(f => f.includes('x64') || f.includes('x86_64') || f.includes('windows'));
    const winZip = zipFiles.find(f => f.includes('x64') || f.includes('x86_64') || f.includes('windows'));

    if (winSig && winZip) {
        const signature = fs.readFileSync(winSig, 'utf8').trim();
        const fileName = path.basename(winZip);

        platforms['windows-x86_64'] = {
            signature,
            url: `https://github.com/${repo}/releases/download/${tagName}/${fileName}`
        };
        console.log(`✅ Configured windows-x86_64 with ${fileName}`);
    }

    if (Object.keys(platforms).length === 0) {
        console.error('❌ Could not match signature with zip file.');
        process.exit(1);
    }

    const manifest = {
        version,
        notes: `Release ${tagName}`,
        pub_date: new Date().toISOString(),
        platforms
    };

    fs.writeFileSync('latest.json', JSON.stringify(manifest, null, 2));
    console.log('✨ latest.json generated successfully!');
}

generateManifest().catch(console.error);
