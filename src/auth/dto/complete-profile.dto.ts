import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telephone?: string;
}
