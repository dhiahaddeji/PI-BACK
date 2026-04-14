import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  SUPERADMIN = 'SUPERADMIN',
  HR         = 'HR',
  MANAGER    = 'MANAGER',
  EMPLOYEE   = 'EMPLOYEE',
}

@Schema({ timestamps: true, collection: 'users' })
export class User {
  // ── Identité ──────────────────────────────────────────────────────────
  @Prop({ required: true })
  name!: string;

  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;

  @Prop({ required: true, unique: true })
  matricule!: string;

  @Prop()
  telephone?: string;

  // ── Auth ──────────────────────────────────────────────────────────────
  @Prop({ required: true, unique: true })
  email!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ default: false })
  mustChangePassword!: boolean;

  @Prop()
  passwordExpiresAt?: Date;

  @Prop({ default: false })
  isProfileComplete!: boolean;

  @Prop()
  githubId?: string;

  @Prop()
  refreshTokenHash?: string;

  @Prop()
  refreshTokenExpiresAt?: Date;

  // ── Rôle & statut ─────────────────────────────────────────────────────
  @Prop({ required: true, enum: UserRole })
  role!: UserRole;

  @Prop({ default: 'ACTIVE' })
  status!: string; // ACTIVE | INACTIVE | SUSPENDED

  @Prop({ default: false })
  en_ligne!: boolean;

  // ── Infos professionnelles ─────────────────────────────────────────────
  @Prop()
  date_embauche?: Date;

  @Prop()
  poste?: string;

  @Prop({ default: 0 })
  yearsExperience!: number;

  // ── Relations ─────────────────────────────────────────────────────────
  @Prop()
  departement_id?: string; // ref → Department._id

  @Prop()
  manager_id?: string; // ref → User._id (manager)

  // ── Médias ────────────────────────────────────────────────────────────
  @Prop()
  photoUrl?: string;

  @Prop()
  cvUrl?: string;

  // ── Disponibilité & capacité ─────────────────────────────────────────
  @Prop({ type: [Object], default: [] })
  leavePeriods!: { startDate: Date; endDate: Date; reason?: string }[];

  @Prop({ type: [String], default: [] })
  currentAssignments!: string[];

  @Prop({ default: 2 })
  maxCapacity!: number;

  // ── Face Recognition ──────────────────────────────────────────────────
  @Prop({ type: [Number], default: [] })
  faceDescriptor!: number[];
}

export const UserSchema = SchemaFactory.createForClass(User);
