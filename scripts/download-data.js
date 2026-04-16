const https = require("https");
const fs = require("fs");
const path = require("path");

const LFS_FILES = [
  {
    name: "features.json",
    localPath: path.join(process.cwd(), "data", "features.json"),
    externalUrl: process.env.FEATURES_JSON_URL,
  },
  {
    name: "features-manifest.json",
    localPath: path.join(process.cwd(), "data", "features-manifest.json"),
    externalUrl: process.env.FEATURES_MANIFEST_URL,
  },
  {
    name: "addressIndex.json",
    localPath: path.join(process.cwd(), "data", "addressIndex.json"),
    externalUrl: process.env.ADDRESS_INDEX_URL,
  },
];

async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          file.close();
          return downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        reject(err);
      });
  });
}

async function downloadIfNeeded(file) {
  const dir = path.dirname(file.localPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(file.localPath)) {
    const stats = fs.statSync(file.localPath);
    const minBytes = file.name === "features-manifest.json" ? 40 : 1000;
    if (stats.size > minBytes) {
      const label =
        file.name === "features-manifest.json"
          ? `${(stats.size / 1024).toFixed(1)} KB`
          : `${(stats.size / 1024 / 1024).toFixed(2)} MB`;
      console.log(`${file.name} already exists (${label}), skipping.`);
      return;
    }
  }

  if (!file.externalUrl) {
    console.log(`No URL configured for ${file.name}, skipping download. Generate locally with script.py.`);
    return;
  }

  console.log(`Downloading ${file.name} from ${file.externalUrl.substring(0, 80)}...`);
  try {
    await downloadFile(file.externalUrl, file.localPath);
    const stats = fs.statSync(file.localPath);
    if (stats.size < 100) {
      fs.unlinkSync(file.localPath);
      throw new Error("Downloaded file too small");
    }
    console.log(`OK: ${file.name} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error) {
    console.warn(`Could not download ${file.name}: ${error.message}`);
    console.warn(`  Run script.py locally to generate data files.`);
  }
}

async function main() {
  console.log("Checking data files...");
  await Promise.all(LFS_FILES.map(downloadIfNeeded));
  console.log("Done.");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
