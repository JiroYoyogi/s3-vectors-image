import fs from "node:fs";
import path from "node:path";

const IN_DIR = path.resolve("images-embed");
const OUT_DIR = path.resolve("images-vectors");

(async () => {
  try {
    // 読み込み先のディレクトリの存在チェック
    if (!fs.existsSync(IN_DIR)) {
      throw new Error(`Directory not found: ${IN_DIR}`);
    }
    // 出力先ディレクトリ作成
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // JSONファイル名一覧を取得。Embeddingを格納したJSON
    const jsonList = fs
      .readdirSync(IN_DIR)
      .filter((f) => path.extname(f).toLowerCase() === ".json");

    if (jsonList.length === 0) {
      throw new Error(`No json files found in directory: ${IN_DIR}`);
    }

    for (const fileName of jsonList) {
      const filePath = path.join(IN_DIR, fileName);
      const raw = fs.readFileSync(filePath, "utf-8");
      const imageJson = JSON.parse(raw);

      if (!Array.isArray(imageJson.embedding)) {
        throw new Error(`Invalid embedding in file: ${fileName}`);
      }

      const baseName = path.parse(fileName).name;
      const key = String(baseName.replace(/-embed$/, ""));

      const out = {
        key,
        data: { float32: imageJson.embedding },
        metadata: {
          fileName: imageJson.fileName,
        },
      };

      const outPath = path.join(OUT_DIR, `${key}-vectors.json`);
      fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

      console.log(
        `saved S3 Vectors input: ${outPath} (key=${key}, dim=${imageJson.embedding.length})`
      );
    }

    console.log("Done.");
  } catch (err) {
    console.error(err)
    process.exit(1);
  }
})();
