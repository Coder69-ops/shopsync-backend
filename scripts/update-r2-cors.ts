import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';

const run = async () => {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
        console.error('Missing R2 environment variables');
        console.log('R2_ENDPOINT:', endpoint);
        console.log('R2_BUCKET_NAME:', bucketName);
        process.exit(1);
    }

    const client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });

    const command = new PutBucketCorsCommand({
        Bucket: bucketName,
        CORSConfiguration: {
            CORSRules: [
                {
                    AllowedHeaders: ['*'],
                    AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
                    AllowedOrigins: ['*'], // Allow all for development
                    ExposeHeaders: [],
                    MaxAgeSeconds: 3000,
                },
            ],
        },
    });

    try {
        await client.send(command);
        console.log(`Successfully updated CORS policy for bucket: ${bucketName}`);
    } catch (error) {
        console.error('Error updating CORS policy:', error);
        process.exit(1);
    }
};

run();
