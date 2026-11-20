const fs = require("fs");
const FA = ["۱", "۲", "۳", "۴"];
const files = ["01-nazariye-jameshenasi.txt","02-jameshenasi-haye-mokhtalef.txt","03-ravesh-tahqiq.txt","04-amar.txt","05-zaban.txt"];
let k = 0, fixed = 0, skipped = 0;
for (const f of files) {
  const p = "soalat/" + f;
  const L = fs.readFileSync(p, "utf8").split("\n");
  for (let i = 0; i < L.length; i++) {
    if (!/^[۰-۹]+\)/.test(L[i])) continue;
    // find option lines within next 8 lines
    const idx = [];
    for (let j = i + 1; j < Math.min(i + 9, L.length); j++) {
      if (/^\s*[۱-۴][.)]\s/.test(L[j])) idx.push(j);
    }
    if (idx.length !== 4) { skipped++; continue; }
    const texts = idx.map((j) => L[j].replace(/^\s*[۱-۴][.)]\s*/, "").trim());
    let keyLine = -1;
    for (let j = idx[3] + 1; j < Math.min(idx[3] + 4, L.length); j++) if (L[j].includes("✔ کلید")) { keyLine = j; break; }
    if (keyLine < 0) { skipped++; continue; }
    const m = L[keyLine].match(/گزینه\s*([۱-۴])/);
    if (!m) { skipped++; continue; }
    const old = FA.indexOf(m[1]);
    const target = k % 4;
    const correct = texts[old];
    const rest = texts.filter((_, n) => n !== old);
    const order = rest.slice();
    order.splice(target, 0, correct);
    const newKey = target;
    idx.forEach((j, n) => { L[j] = "   " + FA[n] + ". " + order[n]; });
    L[keyLine] = "   ✔ کلید: گزینه " + FA[newKey];
    if (newKey !== old) fixed++;
    k++;
  }
  fs.writeFileSync(p, L.join("\n"));
  console.log(f, "done");
}
console.log("total questions:", k, "key moved:", fixed, "skipped:", skipped);
