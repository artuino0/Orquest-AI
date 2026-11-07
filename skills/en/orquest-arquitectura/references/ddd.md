# Domain-Driven Design (DDD)

This reference outlines strategic and tactical DDD patterns applied to enterprise architecture design.

---

## 1. Strategic Design Patterns

### A. Ubiquitous Language
A rigorous, shared vocabulary between domain experts and software engineers. Never use database-centric terminology for domain concepts: if the business refers to a `Policy`, the code must contain a `Policy` class, not a `ContractRecordEntity`.

### B. Bounded Contexts
An explicit conceptual boundary within which a particular domain model strictly applies. The same real-world noun can mean different things across different contexts:
- In **Sales**, a `User` is a `Lead` or `Buyer` with checkout preferences.
- In **Billing**, that user is a `Taxpayer` with tax IDs, legal address, and payment cards.
- In **Logistics**, that user is a `Recipient` with geocoded coordinates and delivery instructions.

**Core Rule**: Do not force a single monolithic `User` model across the entire organization. Keep models separate per Bounded Context with explicit boundary translations.

---

## 2. Tactical Design Patterns

### A. Entities
Objects defined by a durable identity that persists over time, regardless of attribute changes (e.g., an `Order` tracked by its `OrderId`). Two orders with identical items and prices remain distinct if their IDs differ.

### B. Value Objects
Immutable objects defined solely by their attributes, with no conceptual identity (e.g., `Money(amount=100, currency='USD')`, `PostalAddress`, `DateRange`). Two Value Objects with identical attributes are completely interchangeable. Always make them immutable and self-validating upon construction.

### C. Aggregates and Aggregate Roots
A cluster of entities and value objects treated as a single transactional unit:
- External mutations must go exclusively through the **Aggregate Root**.
- Outside components must never directly access or modify internal aggregate entities.
- A single transaction should mutate **only one aggregate at a time**. Cross-aggregate coordination is achieved via domain events and eventual consistency.

---

## 3. Practical Example: Order Aggregate

```typescript
// Immutable Value Object
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

// Aggregate Root
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
    // Emits domain event: OrderConfirmedDomainEvent
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

## 4. DDD Verification Checklist

- [ ] Class and method names reflect business ubiquitous language, not database terms.
- [ ] Value Objects are immutable and lack artificial database identity keys.
- [ ] Child entities are mutated exclusively via Aggregate Root methods.
- [ ] Each transaction updates a single aggregate, ensuring short locks in the database.
