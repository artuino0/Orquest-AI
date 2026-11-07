# NestJS Security

This reference outlines security practices for TypeScript applications built with the NestJS framework.

---

## 1. Common Pitfalls and Vulnerabilities

- **Missing Global DTO Validation**: Controllers accepting request bodies without a `ValidationPipe`, allowing injection of unwhitelisted parameters.
- **Mass Assignment Vulnerabilities**: Directly saving `req.body` into database entities, enabling clients to elevate their privileges (`isAdmin`, `role`).
- **Unprotected Routes by Default**: Relying on manually decorating every individual endpoint with `@UseGuards(AuthGuard)` instead of enforcing authentication at the controller or global level.

---

## 2. Secure NestJS Configuration

Configure security in `main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. HTTP security headers
  app.use(helmet());

  // 2. Strict global validation and payload stripping
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips properties not explicitly defined in the DTO
      forbidNonWhitelisted: true, // Rejects requests with unexpected properties (HTTP 400)
      transform: true, // Automatically converts primitive types
      transformOptions: {
        enableImplicitConversion: false, // Prevents ambiguous conversions
      },
    }),
  );

  // 3. Restrictive CORS
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'https://app.example.com',
    credentials: true,
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
```

---

## 3. Code Patterns: Insecure vs Secure

### DTO Validation and Mass Assignment Prevention

**Insecure:**
```typescript
// Unannotated DTO
export class UpdateUserDto {
  name: string;
  role: string; // Dangerous: client can pass role="admin"
}

@Controller('users')
export class UserController {
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    // Insecure: directly persists unvalidated body
    return this.userService.update(id, body);
  }
}
```

**Secure:**
```typescript
import { IsString, Length, IsOptional } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 50)
  readonly name?: string;

  // 'role' is intentionally omitted from DTO and automatically stripped by whitelist: true
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Resource-level authorization check (prevention of IDOR)
    if (user.id !== id && !user.roles.includes('admin')) {
      throw new ForbiddenException('You cannot modify another user profile');
    }
    return this.userService.update(id, updateUserDto);
  }
}
```

---

## 4. NestJS Security Checklist

- [ ] Global `ValidationPipe` active with `whitelist: true` and `forbidNonWhitelisted: true`.
- [ ] All request DTOs use `class-validator` decorators.
- [ ] Resource-level access checks (IDOR prevention) enforced in Guards or services.
- [ ] No `any` types used in `@Body()` parameters.
- [ ] Private routes protected by `JwtAuthGuard`.
