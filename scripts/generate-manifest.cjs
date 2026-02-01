const fs = require('fs');
const path = require('path');

// Helper to find files recursively
function walkSync(dir, filelist = []) {
    fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            filelist = walkSync(filePath, filelist);
        } else {
            filelist.push(filePath);
        }
    });
    return filelist;
}

async function generateManifest() {
    console.log('--- Starting Manifest Generation ---');

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const version = packageJson.version;
    const tagName = process.env.GITHUB_REF_NAME || `v${version}`;
    const repo = process.env.GITHUB_REPOSITORY;

    console.log(`App Version: ${version}`);
    console.log(`Tag Name: ${tagName}`);
    console.log(`Repo: ${repo}`);

    const targetDir = path.join('src-tauri', 'target');
    if (!fs.existsSync(targetDir)) {
        console.error('Target directory not found! Build might have failed.');
        process.exit(1);
    }

    console.log('Scanning target directory for bundles...');
    const allFiles = walkSync(targetDir);

    // Tauri 2.0 Updater expects the .zip (or .msi.zip / .nsis.zip)
    const updateFiles = allFiles.filter(f => f.endsWith('.zip') && !f.includes('target/debug'));
    console.log('Found potential update files:', updateFiles);

    let updateFile = null;
    let sigFile = null;

    // Preference: 1. .msi.zip/sig  2. .nsis.zip/sig 3. any .zip/sig
    const msiZip = updateFiles.find(f => f.endsWith('.msi.zip'));
    if (msiZip) {
        updateFile = msiZip;
        sigFile = allFiles.find(f => f === `${msiZip}.sig`);
    }

    if (!updateFile) {
        const nsisZip = updateFiles.find(f => f.endsWith('.zip') && f.includes('bundle/nsis'));
        if (nsisZip) {
            updateFile = nsisZip;
            sigFile = allFiles.find(f => f === `${nsisZip}.sig`);
        }
    }

    if (!updateFile) {
        const anyZip = updateFiles[0];
        if (anyZip) {
            updateFile = anyZip;
            sigFile = allFiles.find(f => f === `${anyZip}.sig`);
        }
    }

    if (!updateFile || !sigFile) {
        console.error('Could not find a valid .zip update file and its .sig signature.');
        console.log('Searching for any signatures...');
        console.log(allFiles.filter(f => f.endsWith('.sig')));
        process.exit(1);
    }

    console.log(`Chosen Update File: ${updateFile}`);
    console.log(`Chosen Signature File: ${sigFile}`);

    const signature = fs.readFileSync(sigFile, 'utf8').trim();
    const fileName = path.basename(updateFile);
    const downloadUrl = `https://github.com/${repo}/releases/download/${tagName}/${fileName}`;

    const manifest = {
        version: version,
        notes: `ConfPass Release ${tagName}`,
        pub_date: new Date().toISOString(),
        platforms: {
            "windows-x86_64": {
                signature: signature,
                url: downloadUrl
            }
        }
    };

    fs.writeFileSync('latest.json', JSON.stringify(manifest, null, 2));
    console.log('--- ✅ latest.json generated successfully ---');
    console.log(JSON.stringify(manifest, null, 2));
}

generateManifest().catch(err => {
    console.error('--- ❌ Manifest Generation Failed ---');
    console.error(err);
    process.exit(1);
});
