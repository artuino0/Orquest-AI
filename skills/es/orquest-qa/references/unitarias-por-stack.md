# Pruebas Unitarias por Stack Tecnológico

Esta referencia compila los comandos y patrones para ejecutar e interpretar las suites de pruebas unitarias existentes en el repositorio según el lenguaje y framework disponible.

---

## 1. JavaScript / TypeScript (Vitest / Jest)

- **Comandos de ejecución**:
  ```bash
  # Vitest (rápido, ESM nativo)
  npx vitest run
  npx vitest run src/utils/calculator.test.ts --coverage

  # Jest
  npx jest --bail
  npx jest src/services/user.test.ts
  ```

- **Patrón de prueba unitaria estándar**:
  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { calculateTax } from './taxCalculator';

  describe('calculateTax', () => {
    it('aplica tasa estándar del 16% para productos generales', () => {
      const result = calculateTax({ amount: 100, category: 'general' });
      expect(result).toBe(16);
    });

    it('lanza error si el monto es negativo', () => {
      expect(() => calculateTax({ amount: -50, category: 'general' }))
        .toThrowError('Amount must be positive');
    });
  });
  ```

---

## 2. Python (Pytest)

- **Comandos de ejecución**:
  ```bash
  # Ejecutar toda la suite con salida detallada
  pytest -v

  # Ejecutar un archivo o función puntual
  pytest tests/test_billing.py::test_discount_application

  # Detener ejecución al primer fallo (-x)
  pytest -x --tb=short
  ```

- **Patrón idiomático con fixtures y parametrización**:
  ```python
  import pytest
  from billing.tax import calculate_vat

  @pytest.mark.parametrize(
      "subtotal, rate, expected",
      [
          (100.0, 0.21, 21.0),
          (0.0, 0.21, 0.0),
          (50.0, 0.10, 5.0),
      ],
  )
  def test_calculate_vat_valid_ranges(subtotal: float, rate: float, expected: float):
      assert calculate_vat(subtotal, rate) == pytest.approx(expected, 0.001)

  def test_calculate_vat_rejects_negative_subtotal():
      with pytest.raises(ValueError, match="Subtotal cannot be negative"):
          calculate_vat(-10.0, 0.21)
  ```

---

## 3. Java (JUnit 5 + AssertJ / Mockito)

- **Comandos de ejecución**:
  ```bash
  # Maven
  mvn test
  mvn test -Dtest=OrderServiceTest

  # Gradle
  ./gradlew test --info
  ```

- **Patrón estándar**:
  ```java
  import org.junit.jupiter.api.Test;
  import org.junit.jupiter.api.DisplayName;
  import static org.assertj.core.api.Assertions.*;

  class DiscountServiceTest {
      private final DiscountService service = new DiscountService();

      @Test
      @DisplayName("Debe retornar cero descuento para montos menores a 100")
      void returnsZeroForLowAmounts() {
          var discount = service.calculate(BigDecimal.valueOf(50));
          assertThat(discount).isEqualByComparingTo(BigDecimal.ZERO);
      }
  }
  ```

---

## 4. C# (.NET - xUnit / NUnit)

- **Comandos de ejecución**:
  ```bash
  dotnet test
  dotnet test --filter "FullyQualifiedName~OrderTests"
  ```

- **Patrón estándar (xUnit)**:
  ```csharp
  using Xunit;

  public class PaymentProcessorTests
  {
      [Fact]
      public void ProcessPayment_WithZeroAmount_ThrowsArgumentException()
      {
          var processor = new PaymentProcessor();
          Assert.Throws<ArgumentException>(() => processor.Process(0));
      }
  }
  ```

---

## 5. PHP (PHPUnit / Pest)

- **Comandos de ejecución**:
  ```bash
  ./vendor/bin/phpunit --testdox
  ./vendor/bin/pest
  ```

- **Patrón estándar**:
  ```php
  <?php
  use PHPUnit\Framework\TestCase;

  final class CurrencyConverterTest extends TestCase
  {
      public function testConvertsUsdToEurCorrectly(): void
      {
          $converter = new CurrencyConverter(rate: 0.92);
          $this->assertSame(92.0, $converter->convert(100.0));
      }
  }
  ```

---

## 6. Go (`go test`)

- **Comandos de ejecución**:
  ```bash
  go test ./...
  go test -v -race ./pkg/storage/...
  go test -cover ./...
  ```

- **Patrón estándar con pruebas de tabla (Table-driven tests)**:
  ```go
  func TestValidateEmail(t *testing.T) {
      tests := []struct {
          name    string
          email   string
          wantErr bool
      }{
          {"válido normal", "user@example.com", false},
          {"sin arroba", "userexample.com", true},
          {"vacío", "", true},
      }

      for _, tt := range tests {
          t.Run(tt.name, func(t *testing.T) {
              err := ValidateEmail(tt.email)
              if (err != nil) != tt.wantErr {
                  t.Errorf("ValidateEmail() error = %v, wantErr %v", err, tt.wantErr)
              }
          })
      }
  }
  ```

---

## 7. Checklist de Ejecución Unitaria

- [ ] Se ejecutaron las pruebas con el framework oficial preexistente en el repositorio.
- [ ] No se modificaron aserciones existentes para ocultar un fallo funcional.
- [ ] El 100% de las pruebas pasa en verde de forma reproducible.
- [ ] No hay pruebas lentas o con dependencias externas sin aislar.
