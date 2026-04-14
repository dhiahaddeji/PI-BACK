import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AssignDepartmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  departement_id?: string | null;
}
