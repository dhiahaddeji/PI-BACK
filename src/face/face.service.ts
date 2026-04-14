import {
  Injectable,
  OnModuleInit,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as path from 'path';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class FaceService implements OnModuleInit {
  private readonly logger = new Logger(FaceService.name);
  private modelsLoaded = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private faceapi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private canvas: any;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async onModuleInit() {
    await this.loadModels();
  }

  // ── Model loading ─────────────────────────────────────────────────────

  private async loadModels() {
    try {
      // @napi-rs/canvas has prebuilt binaries — no compilation needed on Windows
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.canvas = require('@napi-rs/canvas');

      // Use WASM TF backend — avoids native addon compilation issues on Windows
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@tensorflow/tfjs-backend-wasm');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tf = require('@tensorflow/tfjs-core');
      await tf.setBackend('wasm');
      await tf.ready();

      // face-api.node-wasm.js uses the WASM backend (no tfjs-node native addon)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');

      // Wrap Canvas so face-api's internal createCanvas(undefined, undefined) calls
      // don't crash @napi-rs/canvas which requires explicit numeric dimensions.
      const { Image, ImageData } = this.canvas;
      const NapiCanvas = this.canvas.Canvas;
      const napiCreateCanvas = this.canvas.createCanvas;

      class Canvas extends NapiCanvas {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(w?: any, h?: any) { super(w || 1, h || 1); }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createCanvas = (w?: any, h?: any) => napiCreateCanvas(w || 1, h || 1);

      this.faceapi.env.monkeyPatch({ Canvas, Image, ImageData, createCanvas });

      // Models are bundled inside the @vladmandic/face-api package
      const modelsPath = path.join(
        process.cwd(),
        'node_modules',
        '@vladmandic',
        'face-api',
        'model',
      );

      await this.faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
      await this.faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
      await this.faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);

      this.modelsLoaded = true;
      this.logger.log('Face recognition models loaded successfully (WASM backend)');
    } catch (err) {
      this.logger.error(
        'Face recognition models failed to load — feature disabled',
        err,
      );
    }
  }

  private assertReady() {
    if (!this.modelsLoaded) {
      throw new BadRequestException(
        'Face recognition service is unavailable. ' +
          'Run: npm install @vladmandic/face-api @napi-rs/canvas @tensorflow/tfjs-core @tensorflow/tfjs-backend-wasm',
      );
    }
  }

  // ── Image helpers ─────────────────────────────────────────────────────

  private async base64ToCanvas(base64: string) {
    const data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(data, 'base64');
    const img = await this.canvas.loadImage(buffer);
    const cnv = this.canvas.createCanvas(img.width, img.height);
    cnv.getContext('2d').drawImage(img, 0, 0);
    return cnv;
  }

  // ── Core face processing ──────────────────────────────────────────────

  async extractDescriptor(base64: string): Promise<number[]> {
    this.assertReady();
    const cnv = await this.base64ToCanvas(base64);

    const detection = await this.faceapi
      .detectSingleFace(cnv)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      throw new BadRequestException(
        'No face detected. Ensure your face is clearly visible and well-lit.',
      );
    }

    return Array.from(detection.descriptor);
  }

  // ── Public API ────────────────────────────────────────────────────────

  async registerFace(userId: string, base64: string): Promise<void> {
    const descriptor = await this.extractDescriptor(base64);
    await this.userModel.findByIdAndUpdate(userId, {
      faceDescriptor: descriptor,
    });
  }

  async loginWithFace(base64: string): Promise<UserDocument | null> {
    const descriptor = await this.extractDescriptor(base64);

    // Only fetch users who already have a registered face descriptor
    const users = await this.userModel
      .find({ faceDescriptor: { $exists: true, $not: { $size: 0 } } })
      .select(
        '_id name firstName lastName email role status photoUrl ' +
          'mustChangePassword isProfileComplete matricule faceDescriptor',
      )
      .lean()
      .exec();

    let bestMatch: UserDocument | null = null;
    let bestDist = Infinity;
    const THRESHOLD = 0.6;

    for (const user of users) {
      if (!user.faceDescriptor?.length) continue;
      const dist = this.euclidean(descriptor, user.faceDescriptor);
      if (dist < THRESHOLD && dist < bestDist) {
        bestDist = dist;
        bestMatch = user as unknown as UserDocument;
      }
    }

    return bestMatch;
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private euclidean(a: number[], b: number[]): number {
    if (a.length !== b.length) return Infinity;
    return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
  }
}
