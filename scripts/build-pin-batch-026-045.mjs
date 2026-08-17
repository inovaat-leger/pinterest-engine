import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const batch = JSON.parse(await readFile("config/pin-batch-026-045.json", "utf8")).pins;
const logo = await sharp("public/assets/StampdUpTravelLogo.png").resize(360, 180, { fit: "contain", background: "#fffaf0" }).png().toBuffer();
const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

for (const [index, pin] of batch.entries()) {
  const [line1, line2 = ""] = pin.overlayText.split("\n");
  const longest = Math.max(line1.length, line2.length);
  const headlineSize = longest > 18 ? 66 : longest > 14 ? 74 : 82;
  const image = await sharp(pin.sourceBackground).resize(1000, 850, { fit: "cover", position: index % 3 === 0 ? "attention" : "centre" }).modulate({ saturation: 0.92, brightness: 0.96 }).png().toBuffer();
  const accentLeft = index % 2 === 0 ? 70 : 770;
  const header = Buffer.from(`<svg width="1000" height="340"><rect width="1000" height="340" fill="#083f32"/><rect x="${accentLeft}" y="48" width="160" height="10" rx="5" fill="#f5b82e"/><text x="70" y="105" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#f5b82e">PHILIPPINES ARRIVAL KIT · PIN ${pin.id}</text><text x="70" y="198" font-family="Arial,sans-serif" font-size="${headlineSize}" font-weight="900" fill="#fffaf0">${escapeXml(line1)}</text><text x="70" y="286" font-family="Arial,sans-serif" font-size="${headlineSize}" font-weight="900" fill="#f5b82e">${escapeXml(line2)}</text></svg>`);
  const footer = Buffer.from(`<svg width="1000" height="310"><rect width="1000" height="310" fill="#fffaf0"/><rect width="1000" height="14" fill="#f5b82e"/><text x="55" y="74" font-family="Arial,sans-serif" font-size="27" font-weight="700" fill="#083f32">${escapeXml(pin.supportingText)}</text><text x="55" y="121" font-family="Arial,sans-serif" font-size="21" fill="#52655e">The Journey Is the Stamp.</text></svg>`);
  const output = path.join("public/pins/philippines", pin.filename);
  await sharp({ create: { width: 1000, height: 1500, channels: 4, background: "#fffaf0" } })
    .composite([
      { input: header, left: 0, top: 0 },
      { input: image, left: 0, top: 340 },
      { input: footer, left: 0, top: 1190 },
      { input: logo, left: 585, top: 1280 },
    ])
    .png({ compressionLevel: 9, palette: false })
    .toFile(output);
  console.log(`${pin.id}: ${output}`);
}
