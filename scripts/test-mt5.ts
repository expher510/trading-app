import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DAEMON = path.resolve(__dirname, "vps_mirror_daemon.py");

const HOST = "186.240.145.87";
const USERNAME = "root";
const PASSWORD = "FXEngine@510";

const conn = new Client();
conn.on("ready", () => {
  conn.exec("docker exec trading_app curl -s http://186.240.145.87:8008/health; echo ''; docker exec trading_app curl -s 'http://186.240.145.87:8008/candles?symbol=XAUUSD&tf=15m&count=2'", (err, stream) => {
    if (err) throw err;
    stream.on("data", d => process.stdout.write(d.toString()));
    stream.on("close", () => conn.end());
  });
}).on("error", console.error).connect({
  host: HOST,
  port: 22,
  username: USERNAME,
  password: PASSWORD,
});
