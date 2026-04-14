import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HR, HRSchema } from './schemas/hr.schema';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: HR.name, schema: HRSchema }])],
  providers: [HrService],
  controllers: [HrController],
})
export class HrModule {}
