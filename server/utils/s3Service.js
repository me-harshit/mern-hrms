const {
    S3Client,
    PutObjectCommand,
    ListObjectsV2Command,
    GetObjectCommand,
    DeleteObjectCommand
} = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');

// Built on first use rather than at require() time. Reading process.env when
// the module loads silently captures undefined credentials if anything requires
// this file before dotenv.config() has run — which fails much later, at upload
// time, with an unhelpful "Resolved credential object is not valid".
let _s3Client = null;
const getS3Client = () => {
    if (!_s3Client) {
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            throw new Error('AWS credentials are not configured — check that .env is loaded before uploading.');
        }
        _s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
        });
    }
    return _s3Client;
};

const uploadToS3 = async (file, subFolder = 'Default') => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    let fileBuffer = file.buffer;
    let mimeType = file.mimetype;
    let originalExt = path.extname(file.originalname).toLowerCase();
    
    let s3Key = `HRMS/${subFolder}/${uniqueSuffix}${originalExt}`;

    if (mimeType.startsWith('image/')) {
        /*
         * A profile picture is re-encoded twice -- once by the browser's crop
         * editor and again here -- and is then shown as a face at up to 300px,
         * where the compounded loss of two passes at quality 80 reads as
         * softness. It gets a higher quality for that reason.
         *
         * Everything else (task attachments, proof screenshots) stays at 80:
         * those are read as thumbnails or in a lightbox where slight softness
         * costs nothing, and there are far more of them, so storage matters
         * more there than fidelity.
         */
        const quality = subFolder === 'ProfilePic' ? 92 : 80;

        fileBuffer = await sharp(file.buffer)
            .resize({ width: 800, withoutEnlargement: true })
            .jpeg({ quality })
            .toBuffer();
        
        s3Key = `HRMS/${subFolder}/${uniqueSuffix}.jpg`;
        mimeType = 'image/jpeg';
    } 

    const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: mimeType,
    });

    await getS3Client().send(command);
    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
};

const listForeverBeginsFiles = async () => {

    const PREFIX = "tempzips/";

    const response = await getS3Client().send(
        new ListObjectsV2Command({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Prefix: PREFIX
        })
    );

    const files = [];

    for (const file of response.Contents || []) {

        if (file.Key.endsWith("/")) {
            continue;
        }

        const signedUrl = await getSignedUrl(
            getS3Client(),
            new GetObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: file.Key
            }),
            {
                expiresIn: 60 * 60 * 24 * 7 // 7 Days
            }
        );

        files.push({
            name: file.Key.replace(PREFIX, ""),
            size: file.Size,
            lastModified: file.LastModified,
            url: signedUrl
        });
    }

    files.sort((a, b) => a.name.localeCompare(b.name));

    return files;
};

/**
 * Removes an object given its public url. Best-effort: a failure here should
 * never block the database change that prompted it, or a user would be stuck
 * unable to delete a record because of a storage hiccup.
 */
const deleteFromS3 = async (url) => {
    if (!url || !url.startsWith('http')) return false;
    try {
        const Key = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
        await getS3Client().send(new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key
        }));
        return true;
    } catch (err) {
        console.error('[S3] Could not delete object for', url, '-', err.message);
        return false;
    }
};

module.exports = {
    uploadToS3,
    listForeverBeginsFiles,
    deleteFromS3
};