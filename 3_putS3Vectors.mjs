import fs from "node:fs";
import path from "node:path";
import { S3VectorsClient, PutVectorsCommand } from "@aws-sdk/client-s3vectors";
import dotenv from "dotenv";

dotenv.config();

const REGION = process.env.S3_VECTORS_REGION ?? "ap-northeast-1";
const VECTOR_BUCKET_NAME = process.env.VECTOR_BUCKET_NAME;
const VECTOR_INDEX_NAME = process.env.VECTOR_INDEX_NAME;

const IN_DIR = path.resolve("images-vectors");

const client = new S3VectorsClient({ region: REGION });

(async () => {
  try {
    if (!VECTOR_BUCKET_NAME || !VECTOR_INDEX_NAME) {
      throw new Error(
        "Required environment variables are not set (VECTOR_BUCKET_NAME, VECTOR_INDEX_NAME)."
      );
    }
    // 読み込み先のディレクトリの存在チェック
    if (!fs.existsSync(IN_DIR)) {
      throw new Error(`Directory not found: ${IN_DIR}`);
    }

    // S3 Vectorsのインプットの形式にフォーマットしたJSON
    const jsonList = fs
      .readdirSync(IN_DIR)
      .filter((f) => path.extname(f).toLowerCase() === ".json");

    if (jsonList.length === 0) {
      throw new Error(`No json files found in directory: ${IN_DIR}`);
    }

    // S3 Vectorsに投げる用データ一覧
    // データの合計が大きい（数Mになる）場合は、配列を分割・複数回に分けて保存するのが良さそう
    const vectorsToUpload = [];

    for (const fileName of jsonList) {
      const raw = fs.readFileSync(path.join(IN_DIR, fileName), "utf-8");
      const vectorItem = JSON.parse(raw);

      if (
        !vectorItem?.key ||
        !vectorItem?.data?.float32 ||
        !Array.isArray(vectorItem.data.float32)
      ) {
        throw new Error(`Invalid vector item format in file: ${fileName}`);
      }

      vectorsToUpload.push(vectorItem);
    }

    console.log(`Putting ${vectorsToUpload.length} vectors in a batch...`);

    const cmd = new PutVectorsCommand({
      vectorBucketName: VECTOR_BUCKET_NAME,
      indexName: VECTOR_INDEX_NAME,
      vectors: vectorsToUpload,
    });

    await client.send(cmd);

    console.log(`Done. inserted/updated ${vectorsToUpload.length} docs in one batch.`);

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
