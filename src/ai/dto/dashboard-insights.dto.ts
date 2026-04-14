import { IsNotEmptyObject, IsObject } from 'class-validator';

export class DashboardInsightsDto {
  @IsObject()
  @IsNotEmptyObject()
  data: Record<string, any>;
}
