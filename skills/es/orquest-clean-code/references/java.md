# Buenas Prácticas y Convenciones: Java

Esta guía establece las directrices de código limpio, patrones orientados a objetos modernos y herramientas para proyectos en Java (Java 17 / 21 LTS).

---

## 1. Convenciones e Idiomas del Lenguaje

- **Nombres**:
  - `camelCase` para métodos, variables y parámetros.
  - `PascalCase` para clases, interfaces, enums y records.
  - `SCREAMING_SNAKE_CASE` para constantes (`static final`).
  - Nombres de interfaces como adjetivos o capacidades (`Serializable`, `PaymentGateway`, `OrderRepository`), no uses el prefijo obsoleto `IOrderRepository`.
- **Estructuras Modernas de Java**:
  - Usa `record` para DTOs y Value Objects inmutables en lugar de clases verbosas con getters/setters tradicionales.
  - Usa `var` exclusivamente cuando el tipo resultante sea evidente en el lado derecho de la asignación (ej. `var users = new ArrayList<User>();`).
  - Usa `Optional<T>` como tipo de retorno cuando un método pueda no devolver valor. **Nunca uses `Optional` como tipo de parámetro o atributo de clase**.
- **Streams y Colecciones**:
  - Usa la API de `Stream` para transformaciones declarativas (`map`, `filter`), pero no encadenes pipelines de más de 5 pasos difíciles de depurar.
  - Si la lógica requiere efectos colaterales o manipulación de estado complejo, un bucle `for-each` estructurado es más claro y performante.
- **Inmutabilidad**:
  - Usa colecciones inmutables: `List.of(...)`, `Set.of(...)`, `Map.of(...)`.

---

## 2. Patrones de Código: Incorrecto vs Correcto

### A. DTOs inmutables: Clases tradicionales vs `record`

**Incorrecto (código redundante propenso a errores y mutabilidad accidental):**
```java
// Mal: 40 líneas de boilerplate, setters mutables que rompen la encapsulación
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
    // equals y hashCode omitidos o desactualizados
}
```

**Correcto (Java Record conciso, inmutable y seguro):**
```java
// Bien: constructor canónico, inmutabilidad de atributos, equals/hashCode/toString automáticos
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

### B. Uso de `Optional` y prevención de `NullPointerException`

**Incorrecto (retornar null o usar `Optional.get()` sin verificar):**
```java
// Mal: arriesga NullPointerException y usa Optional incorrectamente
public class UserService {
    public User findUser(String id) {
        if (id == null) return null;
        // ... consulta BD
        return null; // El llamador no sabe si debe comprobar nulos
    }

    public void process(Optional<User> optionalUser) { // Mal: Optional como parámetro
        User user = optionalUser.get(); // Mal: lanza NoSuchElementException si está vacío
        user.setActive(true);
    }
}
```

**Correcto (retorno de `Optional` y consumo funcional seguro):**
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

### C. Gestión de Recursos con `try-with-resources`

**Incorrecto (cierre manual propenso a fugas de sockets o memoria):**
```java
// Mal: si reader.readLine() falla, stream no se cierra
InputStream stream = new FileInputStream("data.txt");
BufferedReader reader = new BufferedReader(new InputStreamReader(stream));
String line = reader.readLine();
reader.close();
```

**Correcto (`try-with-resources` estructurado):**
```java
// Bien: liberación garantizada del recurso AutoCloseable ante cualquier excepción
try (var stream = Files.newInputStream(Path.of("data.txt"));
     var reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
    String line;
    while ((line = reader.readLine()) != null) {
        processLine(line);
    }
}
```

---

## 3. Linters y Formateadores de Referencia

- **Maven**:
  ```bash
  # Compilar y validar tipos
  mvn clean compile
  # Ejecutar linter Checkstyle o Spotless
  mvn checkstyle:check
  mvn spotless:check
  mvn spotless:apply
  # Pruebas
  mvn test
  ```
- **Gradle**:
  ```bash
  ./gradlew check
  ./gradlew spotlessApply
  ./gradlew test
  ```

---

## 4. Checklist para Java

- [ ] Se usan `record` para DTOs inmutables y estructuras de datos.
- [ ] No se usa `Optional<T>` en parámetros de métodos ni atributos de clase.
- [ ] No hay llamadas directas a `optional.get()` sin comprobación previa; se usa `orElse`, `orElseThrow` o `ifPresent`.
- [ ] Todos los recursos cerrables (`AutoCloseable`) se gestionan mediante `try-with-resources`.
- [ ] La compilación y pruebas unitarias de Maven/Gradle terminan con éxito.
