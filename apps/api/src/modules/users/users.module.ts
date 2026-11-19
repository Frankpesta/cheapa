import { Module } from '@nestjs/common';
import { SearchesModule } from '../searches/searches.module.js';
import { UsersController } from './users.controller.js';

@Module({ imports: [SearchesModule], controllers: [UsersController] })
export class UsersModule {}
