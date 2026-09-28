import { Client } from "ssh2";

const HOST = "186.240.145.87";
const USERNAME = "root";
const PASSWORD = "FXEngine@510";

const conn = new Client();
conn.on("ready", () => {
  conn.exec("docker ps --format '{{.Names}}' | grep -i traefik", (err, stream) => {
    if (err) throw err;
    let traefikName = "";
    stream.on("data", d => { traefikName += d.toString(); });
    stream.on("close", () => {
      traefikName = traefikName.trim();
      if (!traefikName) {
        console.log("No Traefik container found.");
        conn.end();
        return;
      }
      console.log("Found Traefik container:", traefikName);
      conn.exec(`docker inspect ${traefikName} --format '{{json .NetworkSettings.Networks}}'`, (err2, stream2) => {
        stream2.on("data", d => console.log("Traefik Networks:", d.toString()));
        stream2.on("close", () => conn.end());
      });
    });
  });
}).on("error", console.error).connect({
  host: HOST,
  port: 22,
  username: USERNAME,
  password: PASSWORD,
});
