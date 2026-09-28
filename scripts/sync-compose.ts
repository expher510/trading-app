import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_COMPOSE = path.resolve(__dirname, "..", "docker-compose.yml");

const HOST = "186.240.145.87";
const USERNAME = "root";
const PASSWORD = "FXEngine@510";
const REMOTE_DIR = "/var/www/trading-app";

const conn = new Client();
conn.on("ready", () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    console.log("Updating docker-compose.yml on remote server...");
    const content = fs.readFileSync(LOCAL_COMPOSE);
    const writeStream = sftp.createWriteStream(`${REMOTE_DIR}/docker-compose.yml`);
    writeStream.on("close", () => {
      console.log("docker-compose.yml uploaded! Reloading container...");
      conn.exec(`cd ${REMOTE_DIR} && docker compose up -d`, (err2, stream) => {
        if (err2) throw err2;
        stream.on("data", d => process.stdout.write(d.toString()));
        stream.stderr.on("data", d => process.stderr.write(d.toString()));
        stream.on("close", (code) => {
          console.log(`Container reloaded with code ${code}`);
          conn.end();
        });
      });
    });
    writeStream.write(content);
    writeStream.end();
  });
}).on("error", console.error).connect({
  host: HOST,
  port: 22,
  username: USERNAME,
  password: PASSWORD,
});
