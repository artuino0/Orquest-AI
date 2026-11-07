# Unit Testing by Technology Stack

This reference compiles commands and idiomatic patterns for running and interpreting unit test suites across common development frameworks.

---

## 1. JavaScript / TypeScript (Vitest / Jest)

- **Execution Commands**:
  ```bash
  # Vitest
  npx vitest run
  npx vitest run src/utils/calculator.test.ts --coverage

  # Jest
  npx jest --bail
  npx jest src/services/user.test.ts
  ```

- **Standard Test Pattern**:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { calculateTax } from './taxCalculator';

  describe('calculateTax', () => {
    it('applies standard 16% rate for general goods', () => {
      const result = calculateTax({ amount: 100, category: 'general' });
      expect(result).toBe(16);
    });

    it('throws error on negative amount', () => {
      expect(() => calculateTax({ amount: -50, category: 'general' }))
        .toThrowError('Amount must be positive');
    });
  });
  ```

---

## 2. Python (Pytest)

- **Execution Commands**:
  ```bash
  pytest -v
  pytest tests/test_billing.py::test_discount_application
  pytest -x --tb=short
  ```

- **Parameterized Test Pattern**:
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

## 3. Java (JUnit 5 + AssertJ)

- **Execution Commands**:
  ```bash
  # Maven
  mvn test
  mvn test -Dtest=OrderServiceTest

  # Gradle
  ./gradlew test --info
  ```

- **Standard Test Pattern**:
  ```java
  import org.junit.jupiter.api.Test;
  import org.junit.jupiter.api.DisplayName;
  import static org.assertj.core.api.Assertions.*;

  class DiscountServiceTest {
      private final DiscountService service = new DiscountService();

      @Test
      @DisplayName("Should return zero discount for amounts under 100")
      void returnsZeroForLowAmounts() {
          var discount = service.calculate(BigDecimal.valueOf(50));
          assertThat(discount).isEqualByComparingTo(BigDecimal.ZERO);
      }
  }
  ```

---

## 4. C# (.NET - xUnit / NUnit)

- **Execution Commands**:
  ```bash
  dotnet test
  dotnet test --filter "FullyQualifiedName~OrderTests"
  ```

- **Standard Test Pattern (xUnit)**:
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

- **Execution Commands**:
  ```bash
  ./vendor/bin/phpunit --testdox
  ./vendor/bin/pest
  ```

- **Standard Test Pattern**:
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

- **Execution Commands**:
  ```bash
  go test ./...
  go test -v -race ./pkg/storage/...
  go test -cover ./...
  ```

- **Table-Driven Test Pattern**:
  ```go
  func TestValidateEmail(t *testing.T) {
      tests := []struct {
          name    string
          email   string
          wantErr bool
      }{
          {"valid normal", "user@example.com", false},
          {"missing at sign", "userexample.com", true},
          {"empty", "", true},
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

## 7. Unit Test Checklist

- [ ] Tests run using the pre-existing framework already configured in the repository.
- [ ] Existing assertions were not altered or relaxed to disguise functional bugs.
- [ ] 100% of the unit test suite passes cleanly and reproducibly.
- [ ] No slow tests or unmocked external network dependencies exist in unit suites.
