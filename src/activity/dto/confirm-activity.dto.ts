import { IsArray, IsString } from 'class-validator';

export class ConfirmActivityDto {
  @IsArray()
  @IsString({ each: true })
  participants: string[];
}
