import fs from "node:fs";
import path from "node:path";

const BOOK = process.argv[2];
const TOTAL_SARGAS = Number(process.argv[3]);

if (!BOOK || !TOTAL_SARGAS) {
  console.log("Usage:");
  console.log("node scripts/create-sargas.js <book> <count>");
  process.exit(1);
}

const folder = path.join(
  process.cwd(),
  "content",
  "books",
  BOOK,
);

if (!fs.existsSync(folder)) {
  console.error(`Book folder not found: ${folder}`);
  process.exit(1);
}

for (let i = 2; i <= TOTAL_SARGAS; i++) {
  const file = path.join(folder, `sarga-${i}.md`);

  if (fs.existsSync(file)) {
    console.log(`Skipping sarga-${i}.md`);
    continue;
  }

  const content = `---
order: ${i}
title: సర్గ ${i}
---

`;

  fs.writeFileSync(file, content, "utf8");
  console.log(`Created sarga-${i}.md`);
}

console.log("Done.");