import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { FaceService } from './face.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('face')
export class FaceController {
  constructor(
    private readonly faceService: FaceService,
    private readonly authService: AuthService,
  ) {}

  /**
   * POST /face/register
   * Requires a valid JWT. Captures the user's face and saves the descriptor.
   * Body: { image: string }  — base64-encoded image (data URL or raw base64)
   */
  @UseGuards(JwtAuthGuard)
  @Post('register')
  async register(
    @Request() req: any,
    @Body('image') image: string,
  ) {
    if (!image) throw new BadRequestException('image field is required');
    const userId: string = req.user?.userId ?? req.user?.sub;
    await this.faceService.registerFace(userId, image);
    return { message: 'Face registered successfully' };
  }

  /**
   * POST /face/login
   * Public endpoint. Compares the captured face with all stored descriptors.
   * Returns a JWT pair on success (same shape as /auth/login).
   * Body: { image: string }  — base64-encoded image
   */
  @Post('login')
  async login(@Body('image') image: string) {
    if (!image) throw new BadRequestException('image field is required');
    const user = await this.faceService.loginWithFace(image);
    if (!user) throw new UnauthorizedException('Face not recognized');
    return this.authService.loginAsUser(user);
  }
}
