import { build } from "esbuild";

await build({
  entryPoints: ["src/lambda.js"],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: "dist/lambda.js",
  format: "cjs",
  minify: true,
  sourcemap: false,
  external: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/client-s3",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/s3-request-presigner",
  ],
});

console.log("Bundle complete: dist/lambda.js");
