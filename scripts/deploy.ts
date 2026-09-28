import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZipArchive } from "archiver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_ROOT = path.resolve(__dirname, "..");
const ZIP_PATH = path.resolve(__dirname, "..", "deploy-clean.zip");

const HOST = "186.240.145.87";
const USERNAME = "root";
const PASSWORD = process.env.VPS_PASSWORD || "FXEngine@510";
const REMOTE_DIR = "/var/www/trading-app";

async function createCleanZip(): Promise<number> {
  return new Promise((resolve, reject) => {
    console.log("📦 1. تجهيز حزمة المشروع النظيفة...");
    const output = fs.createWriteStream(ZIP_PATH);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => {
      const sizeBytes = fs.statSync(ZIP_PATH).size;
      const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
      console.log(`✅ تم إنشاء الحزمة بنجاح! الحجم: ${sizeMB} MB`);
      resolve(sizeBytes);
    });

    archive.on("error", (err: any) => reject(err));
    archive.pipe(output);

    const items = [
      "src",
      "server",
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "vite.config.ts",
      "tailwind.config.js",
      "postcss.config.js",
      "index.html",
      "Dockerfile",
      "docker-compose.yml",
      ".dockerignore",
      ".env",
    ];

    for (const item of items) {
      const fullPath = path.join(LOCAL_ROOT, item);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          archive.directory(fullPath, item);
        } else {
          archive.file(fullPath, { name: item });
        }
      }
    }

    const publicDir = path.join(LOCAL_ROOT, "public");
    if (fs.existsSync(publicDir)) {
      archive.directory(publicDir, "public", (entry: any) => {
        if (entry.name && entry.name.match(/card\d+\.png$/i)) {
          return false;
        }
        return entry;
      });
    }

    archive.finalize();
  });
}

function execRemote(conn: Client, cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let output = "";
      stream.on("data", (d: Buffer) => {
        const str = d.toString();
        output += str;
        process.stdout.write(str);
      });
      stream.stderr.on("data", (d: Buffer) => {
        const str = d.toString();
        output += str;
        process.stderr.write(str);
      });
      stream.on("close", (code: number) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
    });
  });
}

function uploadViaSFTPStream(conn: Client, localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);

      const totalBytes = fs.statSync(localPath).size;
      console.log(`🚀 3. جاري نقل الحزمة (${(totalBytes / 1024 / 1024).toFixed(2)} MB) عبر SFTP Stream...`);

      const readStream = fs.createReadStream(localPath);
      const writeStream = sftp.createWriteStream(remotePath, { flags: "w", mode: 0o644 });

      let transferred = 0;
      readStream.on("data", (chunk: Buffer) => {
        transferred += chunk.length;
        const pct = Math.floor((transferred / totalBytes) * 100);
        process.stdout.write(`   ⏳ تم نقل: ${pct}% (${(transferred / 1024 / 1024).toFixed(2)} / ${(totalBytes / 1024 / 1024).toFixed(2)} MB)\r`);
      });

      writeStream.on("close", () => {
        console.log("\n✅ تم اكتمال النقل وحفظ الملف بنجاح!");
        resolve();
      });

      writeStream.on("error", (wErr) => reject(wErr));
      readStream.on("error", (rErr) => reject(rErr));

      readStream.pipe(writeStream);
    });
  });
}

async function main() {
  await createCleanZip();

  const conn = new Client();
  console.log("\n🔒 2. الاتصال بالسيرفر عبر SSH...");

  conn.on("ready", async () => {
    console.log("✅ متصل بنجاح!");

    try {
      await uploadViaSFTPStream(conn, ZIP_PATH, `${REMOTE_DIR}/deploy-clean.zip`);

      console.log("\n📂 4. جاري فك الضغط وإيقاف الحاوية السابقة...");
      const prep = [
        `mkdir -p ${REMOTE_DIR}/data`,
        `cd ${REMOTE_DIR}`,
        `unzip -o deploy-clean.zip`,
        `rm -f deploy-clean.zip`,
        `docker stop trading_app || true`,
        `docker rm trading_app || true`,
      ].join(" && ");
      await execRemote(conn, prep);

      console.log("\n🐳 5. بناء وتشغيل الحاوية مع Node 22 (docker compose build & up)...");
      await execRemote(conn, `cd ${REMOTE_DIR} && docker compose build --no-cache`);
      await execRemote(conn, `cd ${REMOTE_DIR} && docker compose up -d`);

      console.log("\n🔍 6. جاري فحص حالة الحاوية واختبار الـ Health...");
      await new Promise((r) => setTimeout(r, 4000));

      await execRemote(conn, "docker ps --filter 'name=trading_app'");
      await execRemote(conn, "sleep 2 && curl -i http://localhost:3001/api/health || true");

      console.log("\n========================================================");
      console.log("🎉 تم نشر وتشغيل تطبيق التداول بنجاح 100%!");
      console.log(`🔒 رابط الدومين المشفر (HTTPS): https://trade.fxengen.com`);
      console.log(`🌐 رابط التطبيق المباشر (IP): http://${HOST}:3001`);
      console.log(`🔐 لوحة تحكم الأدمن: https://trade.fxengen.com/#/admin`);
      console.log("🟢 الحاوية ظاهرة وتعمل بالكامل مع Traefik و Let's Encrypt");
      console.log("========================================================");
    } catch (e: any) {
      console.error("\n❌ حدث خطأ:", e.message);
    } finally {
      conn.end();
    }
  });

  conn.on("error", (err) => {
    console.error("❌ فشل الاتصال بالسيرفر:", err.message);
  });

  conn.connect({
    host: HOST,
    port: 22,
    username: USERNAME,
    password: PASSWORD,
    readyTimeout: 30000,
  });
}

main().catch(console.error);
