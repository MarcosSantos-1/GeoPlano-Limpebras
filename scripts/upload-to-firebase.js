/**
 * Script para fazer upload dos arquivos de dados para o Firebase Storage
 * 
 * Uso:
 * 1. Configure as variáveis de ambiente:
 *    - FIREBASE_PROJECT_ID
 *    - FIREBASE_STORAGE_BUCKET
 *    - GOOGLE_APPLICATION_CREDENTIALS (caminho para o arquivo de credenciais JSON)
 * 
 * 2. Execute: node scripts/upload-to-firebase.js
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Carrega variáveis de ambiente do .env.local
try {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, "utf-8");
    envFile.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    });
  }
} catch (error) {
  // Ignora erros ao carregar .env.local
}

// Configuração
const FILES_TO_UPLOAD = [
  {
    localPath: path.join(process.cwd(), "data", "features.json"),
    storagePath: "data/features.json",
    contentType: "application/json",
  },
  {
    localPath: path.join(process.cwd(), "data", "addressIndex.json"),
    storagePath: "data/addressIndex.json",
    contentType: "application/json",
  },
];

async function initializeFirebase() {
  // Verifica se já está inicializado
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || "limpebras-pt.firebasestorage.app";
  
  // Tenta usar credenciais do arquivo
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath && fs.existsSync(credentialsPath)) {
    const serviceAccount = require(path.resolve(credentialsPath));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: storageBucket,
    });
  } else {
    // Tenta usar variáveis de ambiente (para Vercel)
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: storageBucket,
        });
      } catch (error) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT deve ser um JSON válido");
      }
    } else {
      throw new Error(
        "Configure GOOGLE_APPLICATION_CREDENTIALS (caminho do arquivo) ou FIREBASE_SERVICE_ACCOUNT (JSON string)"
      );
    }
  }

  return admin.app();
}

async function uploadFile(fileConfig) {
  const bucket = admin.storage().bucket();
  const fileName = path.basename(fileConfig.localPath);

  if (!fs.existsSync(fileConfig.localPath)) {
    console.warn(`⚠ Arquivo não encontrado: ${fileConfig.localPath}`);
    return null;
  }

  const stats = fs.statSync(fileConfig.localPath);
  console.log(`📤 Fazendo upload de ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)...`);

  try {
    await bucket.upload(fileConfig.localPath, {
      destination: fileConfig.storagePath,
      metadata: {
        contentType: fileConfig.contentType,
        cacheControl: "public, max-age=3600",
      },
    });

    // Torna o arquivo público
    await bucket.file(fileConfig.storagePath).makePublic();

    // URL pública direta
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileConfig.storagePath}`;
    
    console.log(`✓ ${fileName} enviado com sucesso!`);
    console.log(`  URL pública: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    console.error(`✗ Erro ao fazer upload de ${fileName}:`, error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log("🔥 Inicializando Firebase...");
    await initializeFirebase();
    
    console.log("📦 Fazendo upload dos arquivos...");
    const urls = [];
    
    for (const fileConfig of FILES_TO_UPLOAD) {
      const url = await uploadFile(fileConfig);
      if (url) {
        urls.push({
          file: path.basename(fileConfig.localPath),
          url: url,
        });
      }
    }

    console.log("\n✅ Upload concluído!");
    console.log("\n📋 Configure as seguintes variáveis de ambiente na Vercel:");
    console.log(`FEATURES_JSON_URL=${urls.find(u => u.file === "features.json")?.url || ""}`);
    console.log(`ADDRESS_INDEX_URL=${urls.find(u => u.file === "addressIndex.json")?.url || ""}`);
  } catch (error) {
    console.error("\n❌ Erro:", error.message);
    process.exit(1);
  }
}

main();

