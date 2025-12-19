import fs from "node:fs";
import path from "node:path";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import dotenv from "dotenv";

dotenv.config();

// 2025.12現在
// 画像のEmbeddingモデル "amazon.titan-embed-image-v1" は ap-northeast-1 で未提供
const REGION = process.env.BEDROCK_REGION ?? "us-east-1";
const BEDROCK_EMBED_MODEL =
  process.env.BEDROCK_EMBED_MODEL ?? "amazon.titan-embed-image-v1";

const IN_DIR = path.resolve("images");
const OUT_DIR = path.resolve("images-embed");

const client = new BedrockRuntimeClient({ region: REGION });

(async () => {

  try {
    // 読み込み先のディレクトリの存在チェック
    if (!fs.existsSync(IN_DIR)) {
      throw new Error(`Directory not found: ${IN_DIR}`);
    }

    // 出力先ディレクトリ
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // 画像ファイル名一覧を取得
    const imageList = fs
      .readdirSync(IN_DIR)
      .filter((f) => path.extname(f).toLowerCase() === ".jpg");

    if (imageList.length === 0) {
      throw new Error(`No image files found in directory: ${IN_DIR}`);
    }

    // 画像読み込み + Base64変換 + Embedding作成
    for (const fileName of imageList) {
      // 画像読み込み
      const buf = fs.readFileSync(path.join(IN_DIR, fileName));
      // Base64変換
      const base64 = buf.toString("base64");

      const body = JSON.stringify({
        inputImage: base64,
      });

      // Embeddinを作成
      const res = await client.send(new InvokeModelCommand({
        modelId: BEDROCK_EMBED_MODEL,
        contentType: "application/json",
        body: new TextEncoder().encode(body),
      }));

      const embedJson = JSON.parse(new TextDecoder().decode(res.body));
      // titan-embed-image-v1 では embedding で取得できる
      // ただし、モデルやバージョン差によって
      // embedding / embeddings などレスポンスのキーが変わる可能性がある
      const embedding = embedJson.embedding || null;

      if (!Array.isArray(embedding)) {
        throw new Error(
          `Unexpected embedding response for ${fileName}: ${JSON.stringify(
            embedJson
          ).slice(0, 300)}`
        );
      }

      const out = {
        fileName: fileName,
        embedding: embedding,
        dim: embedding.length,
      };

      const key = path.parse(fileName).name;

      const outPath = path.join(OUT_DIR, `${key}-embed.json`);
      fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

      console.log(`Embedding saved for ${key} (dim=${embedding.length})`);

    }

  } catch (err) {
    console.error(err);
    process.exit(1);
  }

})();
