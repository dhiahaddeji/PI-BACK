import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SkillRequest, SkillRequestSchema } from './skill-request.schema';
import { SkillsService } from './skills.service';
import { SkillsController } from './skills.controller';
import { UsersModule } from '../users/users.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SkillRequest.name, schema: SkillRequestSchema },
    ]),
    UsersModule,
    AuditLogsModule,
  ],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
