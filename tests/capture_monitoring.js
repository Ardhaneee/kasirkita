const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { SignJWT } = require("jose");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const JWT_SECRET = process.env.JWT_SECRET || "kasirkita-secret-key-change-in-production-min-32-chars-long";
const secretKey = new TextEncoder().encode(JWT_SECRET);

async function main() {
  const token = await new SignJWT({
    sub: "1",
    userId: 1,
    nama: "PEMILIK",
    username: "pemilik",
    role: "PEMILIK",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secretKey);

  const res = await fetch("http://localhost:3000/monitoring", {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });

  let html = await res.text();
  html = html.replace("<head>", '<head><base href="http://localhost:3000/">');

  const htmlPath = path.join(__dirname, "monitoring_rendered.html");
  const imgPath = path.join(__dirname, "monitoring_consistent.png");

  fs.writeFileSync(htmlPath, html, "utf-8");

  const args = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1280,1100",
    `--screenshot=${imgPath}`,
    htmlPath,
  ];

  execFile(CHROME, args, (err) => {
    if (err) {
      console.error("Gagal capture screenshot:", err);
    } else {
      console.log("Screenshot sukses disimpan ke:", imgPath);
    }
  });
}

main().catch(console.error);
