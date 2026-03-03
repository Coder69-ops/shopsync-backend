import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class BlogService {
  constructor(private prisma: DatabaseService) {}

  // --- Categories ---
  async getCategories() {
    return this.prisma.blogCategory.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCategory(data: { slug: string; name: string; color?: string }) {
    return this.prisma.blogCategory.create({ data });
  }

  async updateCategory(
    id: string,
    data: { slug?: string; name?: string; color?: string },
  ) {
    return this.prisma.blogCategory.update({
      where: { id },
      data,
    });
  }

  async deleteCategory(id: string) {
    return this.prisma.blogCategory.delete({ where: { id } });
  }

  // --- Posts ---
  async getPosts(publishedOnly = true) {
    return this.prisma.blogPost.findMany({
      where: publishedOnly ? { isPublished: true } : undefined,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPostBySlug(slug: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug },
      include: { category: true },
    });

    if (!post) {
      throw new NotFoundException(`Blog post with slug ${slug} not found`);
    }

    // Increment view count asynchronously
    this.prisma.blogPost
      .update({
        where: { id: post.id },
        data: { views: { increment: 1 } },
      })
      .catch(console.error);

    return post;
  }

  async getPostById(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!post) {
      throw new NotFoundException(`Blog post with id ${id} not found`);
    }

    return post;
  }

  async createPost(data: any) {
    if (data.slug) {
      const existingSlug = await this.prisma.blogPost.findUnique({
        where: { slug: data.slug },
      });
      if (existingSlug) {
        throw new BadRequestException(
          'A post with this URL slug already exists.',
        );
      }
    }

    if (data.isPublished) {
      data.publishedAt = new Date();
    }
    return this.prisma.blogPost.create({ data });
  }

  async updatePost(id: string, data: any) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Post not found');

    if (data.slug && data.slug !== existing.slug) {
      const existingSlug = await this.prisma.blogPost.findUnique({
        where: { slug: data.slug },
      });
      if (existingSlug) {
        throw new BadRequestException(
          'A post with this URL slug already exists.',
        );
      }
    }

    if (data.isPublished && !existing.isPublished) {
      data.publishedAt = new Date(); // Set publishedAt when switching from draft to published
    }

    return this.prisma.blogPost.update({
      where: { id },
      data,
    });
  }

  async deletePost(id: string) {
    return this.prisma.blogPost.delete({ where: { id } });
  }
}
