import { Client } from "ssh2";

const HOST = "186.240.145.87";
const USERNAME = "root";
const PASSWORD = "FXEngine@510";

const conn = new Client();
conn.on("ready", () => {
  conn.exec("docker logs --tail 30 $(docker ps -q --filter 'name=traefik')", (err, stream) => {
    if (err) throw err;
    stream.on("data", d => process.stdout.write(d.toString()));
    stream.stderr.on("data", d => process.stderr.write(d.toString()));
    stream.on("close", () => conn.end());
  });
}).on("error", console.error).connect({
  host: HOST,
  port: 22,
  username: USERNAME,
  password: PASSWORD,
});
