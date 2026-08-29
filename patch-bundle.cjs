const fs = require("fs");
const p = "D:/ryan work/harness/plugins/novel-forge/lib/client.js";
let s = fs.readFileSync(p, "utf8");
let changed = 0;

const selBefore = 'const CONVERSATION_COLUMN_SELECTOR = "[data-pane=\"conversation\"]";';
const selAfter  = 'const CONVERSATION_COLUMN_SELECTOR = "[data-pane=\"conversation\"], [class*=\"centerCol\"]";';
if (s.includes(selBefore)) { s = s.split(selBefore).join(selAfter); changed++; console.log("patched selector"); }
else console.log("selector not found");

// CSS: try escaped and unescaped forms
const cssForms = [
  ['[data-pane=\"conversation\"]{position:relative}', '[data-pane=\"conversation\"],[class*=\"centerCol\"]{position:relative}'],
  ['[data-pane="conversation"]{position:relative}', '[data-pane="conversation"],[class*="centerCol"]{position:relative}'],
];
for (const [b,a] of cssForms) {
  if (s.includes(b)) { s = s.split(b).join(a); changed++; console.log("patched css", a); break; }
}
if (changed>0) fs.writeFileSync(p, s);
console.log("done change=" + changed);
