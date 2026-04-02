import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Manager, ManagerSchema } from './schemas/manager.schema';
import { ManagerService } from './manager.service';
import { ManagerController } from './manager.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Manager.name, schema: ManagerSchema }]),
  ],
  providers: [ManagerService],
  controllers: [ManagerController],
})
export class ManagerModule {}
