# Seguridad en NestJS

Esta referencia detalla las directrices de seguridad para arquitecturas basadas en NestJS (TypeScript).

---

## 1. Errores Típicos y Vulnerabilidades

- **Falta de Validación Global de DTOs**: Controladores que aceptan payloads sin `ValidationPipe`, permitiendo inyección de propiedades maliciosas.
- **Asignación Masiva (Mass Assignment)**: Guardar directamente `req.body` en la base de datos sin depurar campos restringidos como `isAdmin` o `role`.
- **Rutas no protegidas por omisión**: Depender de aplicar `@UseGuards(AuthGuard)` en cada método individualmente, olvidando proteger nuevos endpoints creados.

---

## 2. Configuración Segura de NestJS

Configura pipes globales y seguridad en `main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Headers de seguridad
  app.use(helmet());

  // 2. Validación estricta global y limpieza de payloads
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina propiedades no definidas explícitamente en el DTO
      forbidNonWhitelisted: true, // Lanza error 400 si se envían propiedades adicionales
      transform: true, // Transforma tipos automáticamente
      transformOptions: {
        enableImplicitConversion: false, // Evita conversiones ambiguas
      },
    }),
  );

  // 3. CORS seguro
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'https://app.example.com',
    credentials: true,
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
```

---

## 3. Patrones de Código: Inseguro vs Seguro

### Validación de DTOs y Prevención de Asignación Masiva

**Inseguro:**
```typescript
// DTO sin anotaciones de class-validator
export class UpdateUserDto {
  name: string;
  role: string; // Peligroso: el cliente puede enviar role="admin"
}

@Controller('users')
export class UserController {
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    // Inseguro: guarda directamente sin validar
    return this.userService.update(id, body);
  }
}
```

**Seguro:**
```typescript
import { IsString, IsNotEmpty, Length, IsOptional } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 50)
  readonly name?: string;

  // 'role' NO está presente en el DTO, por lo que whitelist: true lo descartará automáticamente
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
    // Comprobación de propiedad o autorización (IDOR)
    if (user.id !== id && !user.roles.includes('admin')) {
      throw new ForbiddenException('You cannot modify another user profile');
    }
    return this.userService.update(id, updateUserDto);
  }
}
```

---

## 4. Checklist para NestJS

- [ ] `ValidationPipe` está activo globalmente con `whitelist: true` y `forbidNonWhitelisted: true`.
- [ ] Todos los DTOs utilizan decoradores de `class-validator` y `class-transformer`.
- [ ] Se verifica la autorización a nivel de recurso (prevenir IDOR) dentro de Guards o servicios.
- [ ] No se utiliza `any` en los parámetros de `@Body()`.
- [ ] Las rutas privadas están protegidas por `JwtAuthGuard` a nivel de controlador o global.
