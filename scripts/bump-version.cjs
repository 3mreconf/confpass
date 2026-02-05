const fs = require('fs');
const path = require('path');

// Bump version type: patch, minor, or major
const bumpType = process.argv[2] || 'patch';

function bumpVersion(version, type) {
    const [major, minor, patch] = version.split('.').map(Number);

    switch (type) {
        case 'major':
            return `${major + 1}.0.0`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'patch':
        default:
            return `${major}.${minor}.${patch + 1}`;
    }
}

// Update package.json
const packagePath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const oldVersion = packageJson.version;
const newVersion = bumpVersion(oldVersion, bumpType);
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

// Update Cargo.toml
const cargoPath = path.join(__dirname, '..', 'src-tauri', 'Cargo.toml');
let cargoContent = fs.readFileSync(cargoPath, 'utf8');
cargoContent = cargoContent.replace(
    /^version = ".*"$/m,
    `version = "${newVersion}"`
);
fs.writeFileSync(cargoPath, cargoContent);

// Update tauri.conf.json
const tauriConfPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
if (fs.existsSync(tauriConfPath)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = newVersion;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
}

// Update native-messaging-host/Cargo.toml
const nativeCargoPath = path.join(__dirname, '..', 'src-tauri', 'native-messaging-host', 'Cargo.toml');
if (fs.existsSync(nativeCargoPath)) {
    let nativeCargoContent = fs.readFileSync(nativeCargoPath, 'utf8');
    nativeCargoContent = nativeCargoContent.replace(
        /^version = ".*"$/m,
        `version = "${newVersion}"`
    );
    fs.writeFileSync(nativeCargoPath, nativeCargoContent);
}

console.log(`✅ Version bumped: ${oldVersion} → ${newVersion}`);
console.log(`📦 Updated: package.json, Cargo.toml, tauri.conf.json, native-host/Cargo.toml`);
