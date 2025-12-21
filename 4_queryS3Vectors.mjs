import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  S3VectorsClient,
  QueryVectorsCommand,
} from "@aws-sdk/client-s3vectors";

dotenv.config();

// 2025.12現在
// "amazon.titan-embed-image-v1" は ap-northeast-1 で未提供
const BEDROCK_REGION = process.env.BEDROCK_REGION ?? "us-east-1";
// "amazon.titan-embed-image-v1"
// マルチモーダルEmbeddingモデル（画像もテキストもEmbeddingできる）
const BEDROCK_EMBED_MODEL =
  process.env.BEDROCK_EMBED_MODEL ?? "amazon.titan-embed-image-v1";
const S3_VECTORS_REGION = process.env.S3_VECTORS_REGION ?? "ap-northeast-1";
const VECTOR_BUCKET_NAME = process.env.VECTOR_BUCKET_NAME;
const VECTOR_INDEX_NAME = process.env.VECTOR_INDEX_NAME;

const IMAGES_EMBED_DIR = path.resolve("images-embed");

const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });
const s3vectorsClient = new S3VectorsClient({ region: S3_VECTORS_REGION });

(async () => {
  try {
    if (
      !VECTOR_BUCKET_NAME ||
      !VECTOR_INDEX_NAME
    ) {
      throw new Error(
        "Required environment variables are not set (VECTOR_BUCKET_NAME, VECTOR_INDEX_NAME)."
      );
    }

    // const query = "うさぎ";
    const query = "image_01-embed.json";

    const queryType = (() => {
      if (typeof query !== "string" || query.trim().length === 0) {
        throw new Error("query must be a non-empty string");
      }
      if (/^image_\d{2}-.*\.json$/.test(query)) {
        return "image";
      }
      return "text";
    })();

    const queryEmbedding = await createEmbedding({
      type: queryType,
      query,
    });

    console.log(
      `query embedding created (type=${queryType}, dim=${queryEmbedding.length})`
    );

    const res = await s3vectorsClient.send(
      new QueryVectorsCommand({
        vectorBucketName: VECTOR_BUCKET_NAME,
        indexName: VECTOR_INDEX_NAME,
        topK: 5,
        queryVector: { float32: queryEmbedding },
        returnDistance: true,
        returnMetadata: true,
      })
    );

    console.log("Search results:");

    for (const [i, item] of res.vectors.entries()) {
      console.log(
        `${i + 1}. key=${item.key}, distance=${item.distance?.toFixed(4)}, fileName=${item.metadata?.fileName ?? "-"}`
      );
    }

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();

async function createEmbedding({ type, query }) {
  if (type === "image") {
    const filePath = path.join(IMAGES_EMBED_DIR, query);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Embedding JSON not found: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw);

    if (!Array.isArray(json.embedding)) {
      throw new Error(`Invalid embedding JSON: ${query}`);
    }

    return json.embedding;
  }

  if (type === "text") {
    const body = JSON.stringify({
      inputText: query,
    });

    const res = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: BEDROCK_EMBED_MODEL,
        contentType: "application/json",
        body: new TextEncoder().encode(body),
      })
    );

    const json = JSON.parse(new TextDecoder().decode(res.body));

    const embedding = json.embedding || null;

    if (!Array.isArray(embedding)) {
      throw new Error(
        `Unexpected embedding response: ${JSON.stringify(json).slice(0, 300)}`
      );
    }

    return embedding;
  }

  throw new Error(`Unknown query type: ${type}`);
}