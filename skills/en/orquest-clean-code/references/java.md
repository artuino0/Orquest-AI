# Best Practices and Conventions: Java

This guide establishes clean code guidelines, modern object-oriented patterns, and tooling for Java projects (Java 17 / 21 LTS).

---

## 1. Language Conventions and Idioms

- **Naming**:
  - `camelCase` for methods, variables, and parameters.
  - `PascalCase` for classes, interfaces, enums, and records.
  - `SCREAMING_SNAKE_CASE` for constants (`static final`).
  - Interface names as adjectives or capabilities (`Serializable`, `PaymentGateway`, `OrderRepository`); avoid obsolete `IOrderRepository` prefixes.
- **Modern Java Features**:
  - Use `record` for immutable DTOs and Value Objects instead of verbose boilerplate classes with getters/setters.
  - Use `var` only when the resulting type is obvious from the right-hand assignment (e.g., `var users = new ArrayList<User>();`).
  - Use `Optional<T>` as a return type when a method may yield no value. **Never use `Optional` as a method parameter or class field**.
- **Streams and Collections**:
  - Use `Stream` APIs for declarative transformations (`map`, `filter`), but avoid unreadable 5+ step pipelines.
  - If logic involves side effects or complex state mutation, a structured `for-each` loop is clearer and faster.
- **Immutability**:
  - Use immutable collections: `List.of(...)`, `Set.of(...)`, `Map.of(...)`.

---

## 2. Code Patterns: Incorrect vs Correct

### A. Immutable DTOs: Traditional Classes vs `record`

**Incorrect (redundant boilerplate prone to bugs and accidental mutation):**
```java
// Bad: 40 lines of boilerplate, mutable setters breaking encapsulation
public class CustomerDto {
    private String id;
    private String email;

    public CustomerDto(String id, String email) {
        this.id = id;
        this.email = email;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    // equals and hashCode omitted or out-of-sync
}
```

**Correct (concise, immutable, and safe Java Record):**
```java
// Good: canonical constructor, field immutability, auto equals/hashCode/toString
public record CustomerDto(
    String id,
    String email
) {
    public CustomerDto {
        Objects.requireNonNull(id, "id must not be null");
        Objects.requireNonNull(email, "email must not be null");
        if (!email.contains("@")) {
            throw new IllegalArgumentException("Invalid email format");
        }
    }
}
```

---

### B. Proper `Optional` Usage and Null Safety

**Incorrect (returning null or calling `Optional.get()` blindly):**
```java
// Bad: risks NullPointerException and misuses Optional
public class UserService {
    public User findUser(String id) {
        if (id == null) return null;
        // ... query DB
        return null; // Caller cannot tell if null check is required
    }

    public void process(Optional<User> optionalUser) { // Bad: Optional as parameter
        User user = optionalUser.get(); // Bad: throws NoSuchElementException if empty
        user.setActive(true);
    }
}
```

**Correct (`Optional` return and safe functional consumption):**
```java
public class UserService {
    private final UserRepository repository;

    public UserService(UserRepository repository) {
        this.repository = Objects.requireNonNull(repository, "repository is required");
    }

    public Optional<User> findUser(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        return repository.findById(id);
    }

    public void activateUser(String userId) {
        findUser(userId)
            .ifPresentOrElse(
                user -> user.activate(),
                () -> { throw new UserNotFoundException("User not found: " + userId); }
            );
    }
}
```

---

### C. Resource Management with `try-with-resources`

**Incorrect (manual closing prone to resource leaks):**
```java
// Bad: if reader.readLine() throws, stream is never closed
InputStream stream = new FileInputStream("data.txt");
BufferedReader reader = new BufferedReader(new InputStreamReader(stream));
String line = reader.readLine();
reader.close();
```

**Correct (structured `try-with-resources`):**
```java
// Good: guaranteed release of AutoCloseable resource under any exception
try (var stream = Files.newInputStream(Path.of("data.txt"));
     var reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
    String line;
    while ((line = reader.readLine()) != null) {
        processLine(line);
    }
}
```

---

## 3. Reference Linters and Formatters

- **Maven**:
  ```bash
  mvn clean compile
  mvn checkstyle:check
  mvn spotless:check
  mvn spotless:apply
  mvn test
  ```
- **Gradle**:
  ```bash
  ./gradlew check
  ./gradlew spotlessApply
  ./gradlew test
  ```

---

## 4. Checklist for Java

- [ ] `record` is used for immutable DTOs and value carriers.
- [ ] No `Optional<T>` as method parameters or class attributes.
- [ ] No naked calls to `optional.get()`; `orElse`, `orElseThrow`, or `ifPresent` are used.
- [ ] All closeable resources (`AutoCloseable`) are managed via `try-with-resources`.
- [ ] Build and unit tests in Maven/Gradle complete successfully.
