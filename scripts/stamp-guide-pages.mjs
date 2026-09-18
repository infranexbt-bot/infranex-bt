// Stamp page numbers on the guide PDF per the standard scheme:
// page 1 = cover (hidden), last page = dark ending (hidden),
// body pages numbered 1..N centered footer. Also set metadata.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PDFDocument, rgb, StandardFonts } = require("/home/z/.npm-global/lib/node_modules/pdf-lib/cjs/index.js");

const SRC = "/home/z/my-project/download/devops-engine-miner-guide.pdf";
const OUT = "/home/z/my-project/download/devops-engine-miner-guide.numbered.pdf";

async function main() {
  const existing = fs.readFileSync(SRC);
  const pdf = await PDFDocument.load(existing);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const total = pages.length;

  let bodyNum = 1;
  for (let i = 0; i < total; i++) {
    const isCover = i === 0;
    const isEnding = i === total - 1;
    if (isCover || isEnding) continue;
    const page = pages[i];
    const { width } = page.getSize();
    const label = String(bodyNum++);
    const size = font.widthOfTextAtSize(label, 9);
    page.drawText(label, {
      x: (width - size) / 2,
      y: 22,
      size: 9,
      font,
      color: rgb(0x5a / 255, 0x7a / 255, 0x96 / 255),
    });
  }

  pdf.setTitle("DevOps Engine — Field Guide for GPU Miners");
  pdf.setAuthor("Z.ai");
  pdf.setCreator("Infranex Bittensor Platform");
  pdf.setSubject("What the DevOps Engine does, what GPU miners should check once started, when to check it, and step-by-step operating routines");

  fs.writeFileSync(OUT, await pdf.save());
  console.log(`stamped ${bodyNum - 1} body pages of ${total} total -> ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
