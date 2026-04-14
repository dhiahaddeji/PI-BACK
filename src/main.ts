import { setServers } from 'dns';
import { join } from 'path';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationError } from 'class-validator';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  // Force DNS servers for SRV resolution when needed.
  setServers(['8.8.8.8', '1.1.1.1']);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Servir les fichiers uploadés (photos de profil, CVs)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.use(cookieParser());

  const formatValidationErrors = (errors: ValidationError[], parentPath = '') =>
    errors.flatMap((error) => {
      const fieldPath = parentPath
        ? `${parentPath}.${error.property}`
        : error.property;
      const constraints = error.constraints
        ? Object.values(error.constraints)
        : [];
      const current = constraints.length
        ? [{ field: fieldPath, errors: constraints }]
        : [];
      const children = error.children?.length
        ? formatValidationErrors(error.children, fieldPath)
        : [];
      return [...current, ...children];
    });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      validationError: { target: false, value: false },
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: 'Validation failed',
          errors: formatValidationErrors(errors),
        }),
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
