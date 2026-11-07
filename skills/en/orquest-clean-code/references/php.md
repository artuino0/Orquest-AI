# Best Practices and Conventions: PHP

This guide establishes clean code standards, PSR conventions (PSR-12, PER Coding Style), and modern practices for PHP (8.2+).

---

## 1. Language Conventions and Idioms

- **Mandatory Strict Typing**:
  - Every PHP file must start with `declare(strict_types=1);` immediately following `<?php`.
  - All functions and methods must declare parameter types and return types (e.g., `: string`, `: ?User`, `: void`).
- **Naming**:
  - `camelCase` for variables, methods, and class properties.
  - `PascalCase` for classes, interfaces, traits, and enums.
  - `SCREAMING_SNAKE_CASE` for constants.
- **Modern PHP (8.1+)**:
  - Use **Constructor Property Promotion** for dependency injection.
  - Use `readonly` properties or `readonly class` for DTOs and Value Objects.
  - Use `match` instead of traditional `switch` for strict comparison (`===`) and clean returns.
  - Use backed enums (`enum Status: string`) instead of magic strings or scattered constants.

---

## 2. Code Patterns: Incorrect vs Correct

### A. Strict Types and Constructor Promotion

**Incorrect (missing strict_types, untyped and boilerplate-heavy):**
```php
<?php
// Bad: no strict_types, missing types, susceptible to unexpected coercion
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

**Correct (strict types, constructor promotion, and native types):**
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

### B. Using `match` vs `switch`

**Incorrect (verbose switch with fall-through risk and loose comparison):**
```php
// Bad: '1' == 1 can trigger subtle bugs; mandatory breaks
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

**Correct (strict, safe match expression):**
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

### C. Exception Handling and Safe Nullable Returns

**Incorrect (returning false or sentinel values on failure):**
```php
// Bad: returning false mixes return types and conceals error causes
public function findUser(string $id)
{
    $row = $this->db->query("SELECT * FROM users WHERE id = '$id'");
    if (!$row) {
        return false;
    }
    return $row;
}
```

**Correct (typed nullable return or specific exception):**
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

## 3. Reference Linters and Formatters

- **Laravel Pint** (if Laravel project):
  ```bash
  ./vendor/bin/pint --test
  ./vendor/bin/pint
  ```
- **PHP-CS-Fixer**:
  ```bash
  ./vendor/bin/php-cs-fixer fix --dry-run --diff
  ./vendor/bin/php-cs-fixer fix
  ```
- **PHPStan / Psalm (Static Analysis)**:
  ```bash
  ./vendor/bin/phpstan analyse --level=8 src/
  ```
- **Unit Tests (PHPUnit / Pest)**:
  ```bash
  ./vendor/bin/phpunit
  ./vendor/bin/pest
  ```

---

## 4. Checklist for PHP

- [ ] All edited or created files start with `declare(strict_types=1);`.
- [ ] No `mixed` types without strict justification.
- [ ] Constructor promotion and `readonly` properties/classes applied where appropriate.
- [ ] Static analysis (`phpstan` or `psalm`) passes with zero issues.
- [ ] Tests pass via `./vendor/bin/phpunit`.
