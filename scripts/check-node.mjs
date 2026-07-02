const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

if (major < 22) {
  console.error(
    `\nNode.js 22+ is required (Wrangler 4). You are on ${process.versions.node}.\n\n` +
      "Fix:\n" +
      "  nvm install 22   # once\n" +
      "  nvm use          # uses .nvmrc in this repo\n" +
      "  pnpm dev:worker\n",
  );
  process.exit(1);
}
