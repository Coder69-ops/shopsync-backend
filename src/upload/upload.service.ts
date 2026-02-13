import { Injectable } from '@nestjs/common';
import 'multer'; // Fix Express.Multer.File type error
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
    private s3Client: S3Client;
    private bucketName: string;
    private publicDomain: string;

    constructor(private configService: ConfigService) {
        this.s3Client = new S3Client({
            region: 'auto',
            endpoint: this.configService.get<string>('R2_ENDPOINT')!,
            credentials: {
                accessKeyId: this.configService.get<string>('R2_ACCESS_KEY_ID')!,
                secretAccessKey: this.configService.get<string>('R2_SECRET_ACCESS_KEY')!,
            },
        });
        this.bucketName = this.configService.get<string>('R2_BUCKET_NAME')!;
        this.publicDomain = this.configService.get<string>('R2_PUBLIC_DOMAIN')!;
    }

    async uploadFile(file: Express.Multer.File, folder: string = 'products'): Promise<string> {
        const fileExtension = file.originalname.split('.').pop();
        const fileName = `${folder}/${uuidv4()}.${fileExtension}`;

        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileName,
            Body: file.buffer,
            ContentType: file.mimetype,
        });

        try {
            await this.s3Client.send(command);
            return `${this.publicDomain}/${fileName}`;
        } catch (error) {
            console.error('R2 Upload Error:', error);
            throw new Error('Failed to upload image to R2');
        }
    }
}
