import { SearchHistoryQuery, type SearchHistoryResponse } from '@cheapa/core';
import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Query } from '@nestjs/common';
import { ZodPipe } from '../../common/zod.pipe.js';
import { isUuid } from '../../common/uuid7.js';
import { CurrentIdentity, DeviceOrUser, type Identity } from '../auth/auth.decorators.js';
import { HistoryService } from './history.service.js';

/** History screen (08 §8.3, 8.5): the signed-in user's searches, or this device's. */
@DeviceOrUser()
@Controller('me/searches')
export class SearchesController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  list(
    @CurrentIdentity() identity: Identity,
    @Query(new ZodPipe(SearchHistoryQuery)) query: SearchHistoryQuery,
  ): Promise<SearchHistoryResponse> {
    return this.history.list(identity, query.cursor, query.limit);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentIdentity() identity: Identity, @Param('id') id: string): Promise<void> {
    if (!isUuid(id) || !(await this.history.remove(identity, id)))
      throw new NotFoundException('Search not found');
  }

  @Delete()
  @HttpCode(204)
  async clear(@CurrentIdentity() identity: Identity): Promise<void> {
    await this.history.clear(identity);
  }
}
