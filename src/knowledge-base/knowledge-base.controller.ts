import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('knowledge-base')
@UseGuards(JwtAuthGuard)
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Post()
  create(
    @Request() req: any,
    @Body() createKnowledgeBaseDto: { question: string; answer: string },
  ) {
    const shopId = req.user.shopId;
    return this.knowledgeBaseService.create(shopId, createKnowledgeBaseDto);
  }

  @Get()
  findAll(@Request() req: any) {
    const shopId = req.user.shopId;
    return this.knowledgeBaseService.findAll(shopId);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    const shopId = req.user.shopId;
    return this.knowledgeBaseService.findOne(shopId, id);
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateKnowledgeBaseDto: { question?: string; answer?: string },
  ) {
    const shopId = req.user.shopId;
    return this.knowledgeBaseService.update(shopId, id, updateKnowledgeBaseDto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    const shopId = req.user.shopId;
    return this.knowledgeBaseService.remove(shopId, id);
  }
}
