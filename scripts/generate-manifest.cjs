const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function generateManifest() {
    console.log('--- Starting Robust Manifest Generation ---');

    const version = process.env.PACKAGE_VERSION || require('../package.json').version;
    const tagName = process.env.GITHUB_REF_NAME || `v${version}`;
    const repo = process.env.GITHUB_REPOSITORY || '3mreconf/confpass';

    console.log(`App Version: ${version}`);
    console.log(`Tag Name: ${tagName}`);
    console.log(`Repo: ${repo}`);

    // Base search directory
    const baseDir = path.join(__dirname, '..');
    const srcTauriDir = path.join(baseDir, 'src-tauri');
    const targetDir = path.join(srcTauriDir, 'target');

    console.log(`Searching for artifacts in: ${baseDir}`);

    const findFiles = (dir, ext, results = []) => {
        if (!fs.existsSync(dir)) return results;

        // Skip node_modules and hidden folders
        if (dir.includes('node_modules') || path.basename(dir).startsWith('.')) return results;

        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                findFiles(fullPath, ext, results);
            } else if (file.endsWith(ext)) {
                // Specifically look for bundles/updater files
                if (fullPath.includes('bundle') || fullPath.includes('updater')) {
                    results.push(fullPath);
                }
            }
        }
        return results;
    };

    // Add specific common Tauri v2 target paths to ensure visibility
    const commonTargetPaths = [
        path.join(targetDir, 'release', 'bundle'),
        path.join(targetDir, 'x86_64-pc-windows-msvc', 'release', 'bundle')
    ];

    let sigFiles = findFiles(baseDir, '.sig');
    let zipFiles = findFiles(baseDir, '.zip');

    console.log(`Found signature files: ${sigFiles.map(f => path.basename(f)).join(', ')}`);
    console.log(`Found zip files: ${zipFiles.map(f => path.basename(f)).join(', ')}`);

    if (sigFiles.length === 0 || zipFiles.length === 0) {
        console.warn('⚠️ WARNING: Missing .sig or .zip files. Checking all files in release folders...');
        // Fallback: list everything in target/release
        const targetPath = path.join(baseDir, 'src-tauri', 'target');
        if (fs.existsSync(targetPath)) {
            console.log('--- Target Directory Contents (Partial) ---');
            const list = (d, depth = 0) => {
                if (depth > 3) return;
                if (!fs.existsSync(d)) return;
                fs.readdirSync(d).forEach(f => {
                    const p = path.join(d, f);
                    console.log(`${'  '.repeat(depth)}${f}`);
                    if (fs.statSync(p).isDirectory()) list(p, depth + 1);
                });
            };
            list(targetPath);
        }

        // If we still didn't find them, but we have an msi or nsis, maybe they aren't zipped?
        // In Tauri 2.0, sometimes they are named differently.
        if (sigFiles.length === 0) {
            console.error('❌ CRITICAL ERROR: Could not find any .sig files. Build might have failed to sign.');
            process.exit(1);
        }
    }

    // Map signatures to their zip files
    const platforms = {};

    // We expect windows-x86_64
    const winSig = sigFiles.find(f => f.includes('x64') || f.includes('x86_64'));
    const winZip = zipFiles.find(f => f.includes('x64') || f.includes('x86_64'));

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
        console.error('❌ Failed to find suitable assets for manifest.');
        process.exit(1);
    }

    const manifest = {
        version,
        notes: `Release ${tagName}`,
        pub_date: new Date().toISOString(),
        platforms
    };

    fs.writeFileSync('latest.json', JSON.stringify(manifest, null, 2));
    console.log('✨ Success: latest.json generated!');
    console.log(JSON.stringify(manifest, null, 2));
}

generateManifest().catch(err => {
    console.error(err);
    process.exit(1);
});
