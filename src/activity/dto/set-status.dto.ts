import { IsIn, IsString } from 'class-validator';

export class SetActivityStatusDto {
  @IsString()
  @IsIn([
    'DRAFT',
    'AI_SUGGESTED',
    'HR_VALIDATED',
    'SENT_TO_MANAGER',
    'MANAGER_CONFIRMED',
    'NOTIFIED',
  ])
  status: string;
}
