const path = require("path");

module.exports = [
  {
    mode: 'production',
    entry: "./index.js",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "bundle.js",
    },
  },
  {
    mode: 'production',
    entry: "./index-hc.js",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "bundle-hc.js",
    },
  },
];
