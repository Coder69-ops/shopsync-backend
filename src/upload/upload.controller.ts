import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    UseGuards,
    BadRequestException,
} from '@nestjs/common';
import 'multer'; // Fix Express.Multer.File type error
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
    constructor(private readonly uploadService: UploadService) { }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Post('product-image')
    @ApiOperation({ summary: 'Upload product image to R2' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @UseInterceptors(FileInterceptor('file'))
    async uploadProductImage(@UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }
        const url = await this.uploadService.uploadFile(file, 'products');
        return { url };
    }
}
