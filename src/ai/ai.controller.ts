import {
  Controller, Post, Body, UseGuards, UseInterceptors,
  UploadedFile, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Roles('HR', 'SUPERADMIN')
  @Post('chat')
  async chat(
    @Body() body: {
      message: string;
      context?: {
        requiredSkills?: string[];
        prioritization?: string;
        recommendedList?: any[];
        activityTitle?: string;
      };
    },
  ) {
    return this.aiService.chat(body.message, body.context);
  }

  @Roles('HR', 'SUPERADMIN')
  @Post('extract-skills')
  async extractSkills(@Body() body: { description: string }) {
    return this.aiService.extractSkillsFromDescription(body.description);
  }

  // Analyze CV PDF with Claude native PDF reading
  @Roles('EMPLOYEE', 'HR', 'MANAGER', 'SUPERADMIN')
  @Post('analyze-cv')
  @UseInterceptors(
    FileInterceptor('cv', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, tmpdir()),
        filename:    (_req, _file, cb) => cb(null, `cv-${Date.now()}.pdf`),
      }),
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
  @Post('dashboard-insights')
  async dashboardInsights(
    @Request() req: any,
    @Body() body: { data: any },
  ) {
    const role = (req.user?.role || 'EMPLOYEE').toUpperCase();
    return this.aiService.getDashboardInsights(role, body.data || {});
  }
}
