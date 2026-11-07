# Buenas Prácticas y Convenciones: PHP

Esta guía establece los estándares de código limpio, convenciones PSR (PSR-12, PER Coding Style) y prácticas modernas para PHP (8.2+).

---

## 1. Convenciones e Idiomas del Lenguaje

- **Tipado Estricto Obligatorio**:
  - Todo archivo PHP debe comenzar con `declare(strict_types=1);` inmediatamente después de `<?php`.
  - Todas las funciones y métodos deben declarar tipos para todos los parámetros y tipo de retorno (ej. `: string`, `: ?User`, `: void`).
- **Nombres**:
  - `camelCase` para variables, métodos y propiedades de clases.
  - `PascalCase` para clases, interfaces, traits y enums.
  - `SCREAMING_SNAKE_CASE` para constantes.
- **PHP Moderno (8.1+)**:
  - Usa **Constructor Property Promotion** para inyectar dependencias y reducir código repetitivo.
  - Usa propiedades `readonly` o clases `readonly class` para DTOs y Value Objects.
  - Usa `match` en lugar de `switch` tradicional para obtener comparaciones estrictas (`===`) y retornos limpios.
  - Usa `enums` respaldados (`enum Status: string`) en vez de cadenas mágicas o constantes dispersas.

---

## 2. Patrones de Código: Incorrecto vs Correcto

### A. Tipado estricto y Constructor Promotion

**Incorrecto (sin strict types, código verboso y tipado ausente):**
```php
<?php
// Mal: sin strict_types, tipos omitidos, propenso a coerciones inesperadas
class OrderService {
    private $repository;
    private $logger;

    public function __construct($repository, $logger) {
        $this->repository = $repository;
        $this->logger = $logger;
    }

    public function process($orderId, $amount) {
        // ...
    }
}
```

**Correcto (strict types, constructor promotion y tipos nativos):**
```php
<?php

declare(strict_types=1);

namespace App\Services;

use App\Repositories\OrderRepositoryInterface;
use Psr\Log\LoggerInterface;

final readonly class OrderService
{
    public function __construct(
        private OrderRepositoryInterface $orderRepository,
        private LoggerInterface $logger,
    ) {}

    public function process(string $orderId, float $amount): bool
    {
        $this->logger->info("Processing order {orderId}", ['orderId' => $orderId]);
        return $this->orderRepository->updateStatus($orderId, 'processed');
    }
}
```

---

### B. Uso de `match` vs `switch`

**Incorrecto (switch verboso con riesgo de fall-through y comparación débil):**
```php
// Mal: '1' == 1 puede causar bugs silenciosos, break obligatorio
function getRoleLevel($role) {
    switch ($role) {
        case 'admin':
            return 100;
        case 'editor':
            return 50;
        default:
            return 10;
    }
}
```

**Correcto (expresión match estricta y segura):**
```php
enum UserRole: string
{
    case Admin = 'admin';
    case Editor = 'editor';
    case Viewer = 'viewer';
}

function getRoleLevel(UserRole $role): int
{
    return match ($role) {
        UserRole::Admin => 100,
        UserRole::Editor => 50,
        UserRole::Viewer => 10,
    };
}
```

---

### C. Manejo de excepciones y tipado nulo seguro

**Incorrecto (retornar false o cadenas mágicas en caso de fallo):**
```php
// Mal: retornar false mezcla tipos de retorno y oculta el motivo del error
public function findUser(string $id)
{
    $row = $this->db->query("SELECT * FROM users WHERE id = '$id'");
    if (!$row) {
        return false;
    }
    return $row;
}
```

**Correcto (retorno tipado nullable o excepción específica):**
```php
public function findUser(string $id): ?User
{
    $stmt = $this->pdo->prepare('SELECT id, name, email FROM users WHERE id = :id');
    $stmt->execute(['id' => $id]);
    $data = $stmt->fetch();

    if ($data === false) {
        return null;
    }

    return new User(id: (string)$data['id'], name: (string)$data['name'], email: (string)$data['email']);
}
```

---

## 3. Linters y Formateadores de Referencia

- **Laravel Pint** (si el proyecto es Laravel):
  ```bash
  ./vendor/bin/pint --test
  ./vendor/bin/pint
  ```
- **PHP-CS-Fixer**:
  ```bash
  ./vendor/bin/php-cs-fixer fix --dry-run --diff
  ./vendor/bin/php-cs-fixer fix
  ```
- **PHPStan / Psalm (Análisis Estático)**:
  ```bash
  ./vendor/bin/phpstan analyse --level=8 src/
  ```
- **Pruebas (PHPUnit / Pest)**:
  ```bash
  ./vendor/bin/phpunit
  # O Pest:
  ./vendor/bin/pest
  ```

---

## 4. Checklist para PHP

- [ ] Todos los archivos creados o editados contienen `declare(strict_types=1);`.
- [ ] No se usan tipos mixtos (`mixed`) sin justificación estricta.
- [ ] Se utilizó constructor promotion y clases/propiedades `readonly` cuando corresponde.
- [ ] El análisis estático (`phpstan` o `psalm`) ejecuta sin observaciones.
- [ ] Las pruebas pasan con `./vendor/bin/phpunit`.
