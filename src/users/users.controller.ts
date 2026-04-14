import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Request,
  Body,
  Query,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { Throttle } from '@nestjs/throttler';

import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AssignDepartmentDto } from './dto/assign-department.dto';

const profileFileFilter = (_req: any, file: any, cb: any) => {
  const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const cvTypes = ['application/pdf'];

  if (file.fieldname === 'photo') {
    if (photoTypes.includes(file.mimetype)) return cb(null, true);
    return cb(new BadRequestException('Format photo invalide.'), false);
  }

  if (file.fieldname === 'cv') {
    if (cvTypes.includes(file.mimetype)) return cb(null, true);
    return cb(new BadRequestException('Format CV invalide.'), false);
  }

  return cb(new BadRequestException('Champ de fichier non autorisé.'), false);
};

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('HR', 'SUPERADMIN')
  @Get('managers')
  async managers() {
    const all = await this.usersService.findAll();
    return all.filter(u => (u as any).role === 'MANAGER');
  }

  @Roles('HR', 'SUPERADMIN')
  @Get('employees')
  async employees(
    @Query() query: PaginationQueryDto,
  ) {
    const { page, limit } = query;
    if (!page && !limit) {
      const all = await this.usersService.findAll();
      return all.filter(u => (u as any).role === 'EMPLOYEE');
    }

    return this.usersService.listPaginated({ role: 'EMPLOYEE' }, page, limit);
  }

  @Patch('profile')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photo', maxCount: 1 },
        { name: 'cv', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (req, file, cb) => {
            const folder = file.fieldname === 'photo' ? 'avatars' : 'cvs';
            const dir = join(process.cwd(), 'uploads', folder);
            mkdirSync(dir, { recursive: true });
            cb(null, dir);
          },
          filename: (req, file, cb) => {
            const userId = (req as any).user?.userId || 'unknown';
            cb(null, `${userId}-${Date.now()}${extname(file.originalname)}`);
          },
        }),
        fileFilter: profileFileFilter,
        limits: { fileSize: 5 * 1024 * 1024 },
      },
    ),
  )
  async updateProfile(
    @Request() req,
    @Body() body: UpdateProfileDto,
    @UploadedFiles() files: { photo?: any[]; cv?: any[] },
  ) {
    const userId = req.user.userId;
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const updateData: any = {};

    if (body.firstName) updateData.firstName = body.firstName;
    if (body.lastName) updateData.lastName = body.lastName;
    if (body.firstName || body.lastName) {
      updateData.name = `${body.firstName || ''} ${body.lastName || ''}`.trim();
    }
    if (body.telephone) updateData.telephone = body.telephone;
    if (files?.photo?.[0])
      updateData.photoUrl = `${baseUrl}/uploads/avatars/${files.photo[0].filename}`;
    if (files?.cv?.[0])
      updateData.cvUrl = `${baseUrl}/uploads/cvs/${files.cv[0].filename}`;

    const updated = await this.usersService.update(userId, updateData);

    // Return without password
    const {
      password: _,
      refreshTokenHash: __,
      refreshTokenExpiresAt: ___,
      ...safe
    } = (updated as any).toObject
      ? (updated as any).toObject()
      : updated;
    return safe;
  }

  // ── HR: assign employee to a department ─────────────────────────────
  @Roles('HR', 'SUPERADMIN')
  @Patch(':id/department')
  async assignDepartment(
    @Param('id') id: string,
    @Body() body: AssignDepartmentDto,
  ) {
    return this.usersService.update(id, { departement_id: body.departement_id ?? null });
  }

  @Roles('HR', 'SUPERADMIN', 'MANAGER', 'EMPLOYEE')
  @Get(':id')
  async byId(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
