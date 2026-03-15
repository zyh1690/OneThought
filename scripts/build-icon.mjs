import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, "..", "build");
const pngPath = path.join(buildDir, "icon.png");
const squarePath = path.join(buildDir, "icon-256.png");
const icoPath = path.join(buildDir, "icon.ico");

async function main() {
  if (!fs.existsSync(pngPath)) {
    console.error("build/icon.png not found");
    process.exit(1);
  }
  const size = 256;
  await sharp(pngPath)
    .resize(size, size, { fit: "cover" })
    .png()
    .toFile(squarePath);
  const buf = await pngToIco(squarePath);
  fs.writeFileSync(icoPath, buf);
  try { fs.unlinkSync(squarePath); } catch (_) {}
  console.log("Written build/icon.ico");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
