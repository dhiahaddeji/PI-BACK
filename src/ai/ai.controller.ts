import {
  BadRequestException,
  Controller, Post, Body, UseGuards, UseInterceptors,
  UploadedFile, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AiService } from './ai.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { ExtractSkillsDto } from './dto/extract-skills.dto';
import { DashboardInsightsDto } from './dto/dashboard-insights.dto';

const cvFileFilter = (_req: any, file: any, cb: any) => {
  if (file.mimetype === 'application/pdf') return cb(null, true);
  return cb(new BadRequestException('Seuls les fichiers PDF sont acceptés.'), false);
};

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Roles('HR', 'SUPERADMIN')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @Post('chat')
  async chat(@Body() body: AiChatDto) {
    return this.aiService.chat(body.message, body.context);
  }

  @Roles('HR', 'SUPERADMIN')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @Post('extract-skills')
  async extractSkills(@Body() body: ExtractSkillsDto) {
    return this.aiService.extractSkillsFromDescription(body.description);
  }

  // Analyze CV PDF with Claude native PDF reading
  @Roles('EMPLOYEE', 'HR', 'MANAGER', 'SUPERADMIN')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @Post('analyze-cv')
  @UseInterceptors(
    FileInterceptor('cv', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, tmpdir()),
        filename:    (_req, _file, cb) => cb(null, `cv-${Date.now()}.pdf`),
      }),
      fileFilter: cvFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async analyzeCv(@UploadedFile() file: any) {
    if (!file) return { skills: [], summary: 'Aucun fichier reçu.', total: 0 };
    let buffer: Buffer;
    try {
      buffer = readFileSync(file.path);
    } finally {
      try { unlinkSync(file.path); } catch { /* ignore */ }
    }
    return this.aiService.analyzeCv(buffer);
  }

  // AI dashboard insights powered by Claude
  @Roles('EMPLOYEE', 'HR', 'MANAGER', 'SUPERADMIN')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @Post('dashboard-insights')
  async dashboardInsights(
    @Request() req: any,
    @Body() body: DashboardInsightsDto,
  ) {
    const role = (req.user?.role || 'EMPLOYEE').toUpperCase();
    return this.aiService.getDashboardInsights(role, body.data || {});
  }
}
