const fs = require("fs");
const path = require("path");

function printTree(dir, indent = "") {
  const files = fs.readdirSync(dir);

  files.forEach((file, index) => {
    if (file === "node_modules") return;

    const fullPath = path.join(dir, file);
    const isLast = index === files.length - 1;
    const prefix = isLast ? "└── " : "├── ";

    console.log(indent + prefix + file);

    if (fs.statSync(fullPath).isDirectory()) {
      printTree(fullPath, indent + (isLast ? "    " : "│   "));
    }
  });
}

printTree("./");