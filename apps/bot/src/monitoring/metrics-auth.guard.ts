import { timingSafeEqual } from 'node:crypto';
import { type IncomingMessage } from 'node:http';

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * GET /metrics 전용 인증 가드.
 * 환경 변수 METRICS_AUTH_TOKEN 과 Bearer 토큰을 비교한다.
 * 미설정 시 fail-closed(401) — 노출보다 차단을 택한다(스크레이프 소비자 0).
 * apps/bot 에는 @types/express 가 설치돼 있지 않으므로 express 의 Request 타입 대신
 * node 표준 IncomingMessage 를 사용한다(app.module.ts 의 기존 관행과 동일).
 * apps/api 의 MetricsAuthGuard 와 로직이 유사하나 키/용도가 달라 별도 클래스로 둔다(§7.1 —
 * libs/shared 는 런타임 의존이 0인 순수 타입/상수 패키지라 @nestjs/common·@nestjs/config
 * 의존을 주입할 수 없어 공유하지 않는다. api/bot 각각에 의도적으로 중복 배치한다).
 */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  private readonly token: string;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('METRICS_AUTH_TOKEN', '');
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.token) {
      throw new UnauthorizedException('METRICS_AUTH_TOKEN is not configured');
    }

    const request = context.switchToHttp().getRequest<IncomingMessage>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const provided = Buffer.from(authHeader.slice(7));
    const expected = Buffer.from(this.token);
    // timingSafeEqual 은 길이가 다르면 throw 하므로 길이 선검사(길이는 비밀이 아님)
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid metrics token');
    }

    return true;
  }
}
