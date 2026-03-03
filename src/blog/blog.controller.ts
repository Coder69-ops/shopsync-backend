import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { BlogService } from './blog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller()
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // ==========================================
  // PUBLIC ENDPOINTS (No Guards)
  // ==========================================

  @Get('blog/categories')
  async getCategories() {
    return this.blogService.getCategories();
  }

  @Get('blog')
  async getPublishedPosts() {
    return this.blogService.getPosts(true); // true = published only
  }

  @Get('blog/post/:slug')
  async getPostBySlug(@Param('slug') slug: string) {
    return this.blogService.getPostBySlug(slug);
  }

  // ==========================================
  // SUPERADMIN ENDPOINTS (Protected)
  // ==========================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Get('superadmin/blog')
  async getAllPostsForAdmin() {
    return this.blogService.getPosts(false); // false = return all including drafts
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Get('superadmin/blog/:id')
  async getPostByIdForAdmin(@Param('id') id: string) {
    return this.blogService.getPostById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('superadmin/blog')
  async createPost(@Body() data: any) {
    return this.blogService.createPost(data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Put('superadmin/blog/:id')
  async updatePost(@Param('id') id: string, @Body() data: any) {
    return this.blogService.updatePost(id, data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Delete('superadmin/blog/:id')
  async deletePost(@Param('id') id: string) {
    return this.blogService.deletePost(id);
  }

  // Categories CRUD (Superadmin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('superadmin/blog/categories')
  async createCategory(
    @Body() data: { slug: string; name: string; color?: string },
  ) {
    return this.blogService.createCategory(data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Put('superadmin/blog/categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() data: { slug?: string; name?: string; color?: string },
  ) {
    return this.blogService.updateCategory(id, data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Delete('superadmin/blog/categories/:id')
  async deleteCategory(@Param('id') id: string) {
    return this.blogService.deleteCategory(id);
  }
}
