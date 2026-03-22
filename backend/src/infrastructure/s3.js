import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import config from "../config.js";

const s3 = new S3Client({ region: config.region });

export async function generatePresignedUploadUrl(key, contentType) {
  const command = new PutObjectCommand({
    Bucket: config.s3.uploadsBucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function getObject(key) {
  const result = await s3.send(new GetObjectCommand({
    Bucket: config.s3.uploadsBucket,
    Key: key,
  }));
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function deleteObject(key) {
  await s3.send(new DeleteObjectCommand({
    Bucket: config.s3.uploadsBucket,
    Key: key,
  }));
}
