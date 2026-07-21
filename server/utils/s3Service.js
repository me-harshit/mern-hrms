const {
    S3Client,
    PutObjectCommand,
    ListObjectsV2Command,
    GetObjectCommand
} = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const uploadToS3 = async (file, subFolder = 'Default') => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    let fileBuffer = file.buffer;
    let mimeType = file.mimetype;
    let originalExt = path.extname(file.originalname).toLowerCase();
    
    let s3Key = `HRMS/${subFolder}/${uniqueSuffix}${originalExt}`;

    if (mimeType.startsWith('image/')) {
        fileBuffer = await sharp(file.buffer)
            .resize({ width: 800, withoutEnlargement: true })
            .jpeg({ quality: 80 })
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

    await s3Client.send(command);
    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
};

const listForeverBeginsFiles = async () => {

    const PREFIX = "tempzips/";

    const response = await s3Client.send(
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
            s3Client,
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

module.exports = {
    uploadToS3,
    listForeverBeginsFiles
};