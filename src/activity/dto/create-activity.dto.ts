import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ActivityCompetenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  intitule: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['savoir', 'savoir_faire', 'savoir_etre'])
  type: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  niveau_min: number;
}

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  date?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  duration?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  seats?: number;

  @IsOptional()
  @IsIn(['formation', 'certification', 'projet', 'mission', 'audit'])
  type?: string;

  @IsOptional()
  @IsIn(['upskilling', 'consolidation', 'expertise'])
  prioritization?: string;

  @IsString()
  @IsNotEmpty()
  managerId: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivityCompetenceDto)
  competences_requises?: ActivityCompetenceDto[];
}
