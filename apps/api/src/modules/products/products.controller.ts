import { type PriceHistoryResponse, PriceHistoryQuery, type ProductResponse } from '@cheapa/core';
import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import { ProductsService } from './products.service.js';

const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid slug')
  .max(200);

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get(':slug')
  async bySlug(@Param('slug', new ZodPipe(Slug)) slug: string): Promise<ProductResponse> {
    const product = await this.products.bySlug(slug);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  @Get(':id/history')
  async history(
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Query(new ZodPipe(PriceHistoryQuery)) query: z.output<typeof PriceHistoryQuery>,
  ): Promise<PriceHistoryResponse> {
    if (!(await this.products.exists(id))) throw new NotFoundException('Product not found');
    return this.products.history(id, query.days);
  }
}
