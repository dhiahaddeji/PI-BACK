import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ExtractSkillsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  description: string;
}
