# Diseño Guiado por el Dominio (DDD - Domain-Driven Design)

Esta referencia resume los patrones tácticos y estratégicos de DDD aplicados al diseño de arquitecturas empresariales desacopladas.

---

## 1. Patrones Estratégicos

### A. Lenguaje Ubicuo (Ubiquitous Language)
Un vocabulario riguroso y compartido entre expertos del negocio y desarrolladores. No uses nombres técnicos para conceptos del dominio: si el negocio habla de `Poliza`, el código debe tener una clase `Policy`, no `ContractRecordEntity`.

### B. Contextos Delimitados (Bounded Contexts)
Un límite conceptual explícito dentro del cual un modelo de dominio aplica estrictamente. La misma palabra puede tener significados y necesidades completamente distintos en diferentes contextos:
- En el contexto de **Ventas**, un `Usuario` es un `Prospecto` o `Comprador` con historial de pedidos y preferencias de marketing.
- En el contexto de **Facturación**, el mismo usuario es un `Contribuyente` con RFC/NIF, dirección fiscal y cuenta bancaria.
- En el contexto de **Logística**, es un `Destinatario` con coordenadas y teléfono de contacto.

**Regla clave**: No intentes forzar un único modelo canónico universal de `User` para toda la empresa; mantenlo dividido por Bounded Contexts con transformaciones explícitas en las fronteras.

---

## 2. Patrones Tácticos

### A. Entidades (Entities)
Objetos que poseen una identidad única y duradera que persiste en el tiempo, independientemente de que sus atributos cambien (ej. un `Pedido` identificado por su `OrderId`). Dos pedidos con los mismos ítems e importe son distintos si su ID difiere.

### B. Objetos de Valor (Value Objects)
Objetos inmutables definidos exclusivamente por sus atributos, sin identidad propia (ej. `Dinero(monto=100, divisa='USD')`, `DireccionPostal`, `RangoFechas`). Dos Value Objects con atributos idénticos son completamente intercambiables. Siempre deben ser inmutables y auto-validados en su creación.

### C. Agregados y Raíces de Agregado (Aggregate Roots)
Un clúster de entidades y objetos de valor tratados como una unidad atómica para propósitos de cambios de estado y consistencia transaccional:
- Todo cambio externo al agregado debe pasar exclusivamente a través de la **Raíz del Agregado (Aggregate Root)**.
- Ningún componente externo debe acceder o mutar entidades internas del agregado directamente.
- Una transacción debe modificar únicamente **un solo agregado a la vez**. Si necesitas coordinar varios agregados, utiliza eventos de dominio y consistencia eventual.

---

## 3. Ejemplo Práctico: Agregado de Pedido

```typescript
// Objeto de Valor inmutable
class Money {
  constructor(public readonly amount: number, public readonly currency: string) {
    if (amount < 0) throw new Error("Money amount cannot be negative");
    if (!currency || currency.length !== 3) throw new Error("Invalid currency code");
  }
  add(other: Money): Money {
    if (this.currency !== other.currency) throw new Error("Currency mismatch");
    return new Money(this.amount + other.amount, this.currency);
  }
}

// Raíz de Agregado
class Order {
  private items: OrderItem[] = [];
  private status: 'Draft' | 'Confirmed' | 'Cancelled' = 'Draft';

  constructor(public readonly id: string, public readonly customerId: string) {}

  public addItem(productId: string, unitPrice: Money, quantity: number): void {
    if (this.status !== 'Draft') {
      throw new Error("Cannot add items to a confirmed or cancelled order");
    }
    if (quantity <= 0) throw new Error("Quantity must be greater than zero");
    
    this.items.push(new OrderItem(productId, unitPrice, quantity));
  }

  public confirm(): void {
    if (this.items.length === 0) {
      throw new Error("Cannot confirm an order with no items");
    }
    this.status = 'Confirmed';
    // Emite evento de dominio: OrderConfirmedDomainEvent
  }

  public calculateTotal(): Money {
    return this.items.reduce(
      (acc, item) => acc.add(item.subtotal()),
      new Money(0, 'USD')
    );
  }
}
```

---

## 4. Checklist de Aplicación de DDD

- [ ] ¿Los nombres de clases y métodos reflejan el lenguaje del negocio y no terminología de base de datos?
- [ ] ¿Los Value Objects son inmutables y no tienen identificadores numéricos artificiales?
- [ ] ¿Las entidades hijas solo se modifican invocando métodos en la Raíz del Agregado?
- [ ] ¿Cada transacción modifica un único agregado para asegurar transacciones cortas y evitar bloqueos en la BD?
