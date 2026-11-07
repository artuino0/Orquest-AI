# Seguridad en FastAPI

Esta referencia define las directrices de seguridad para APIs desarrolladas con FastAPI (Python 3.10+ y Pydantic v2).

---

## 1. Errores Típicos y Vulnerabilidades

- **CORS permisivo global (`allow_origins=["*"]`) con credenciales habilitadas**: Permite que cualquier sitio de un tercero haga peticiones autenticadas en nombre del usuario.
- **Falta de Validación Estricta en Schemas Pydantic**: No definir longitudes máximas (`max_length`) ni tipos estrictos, exponiendo la memoria a payloads masivos (DoS).
- **Inyección SQL en librerías asíncronas**: Concatenar parámetros de consulta al usar asyncpg, databases o SQLAlchemy sin vincular variables.
- **Exposición de Documentación Swagger/Redoc en Producción**: Dejar `/docs` y `/redoc` abiertos en internet sin autenticación, facilitando el mapeo de la superficie de ataque.

---

## 2. Configuración Segura de la Aplicación

```python
import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer

# 1. Desactivar docs interactivas en producción si es una API interna o privada
is_production = os.getenv("ENVIRONMENT") == "production"

app = FastAPI(
    title="Core Secure API",
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)

# 2. CORS restrictivo
allowed_origins = os.getenv("ALLOWED_ORIGINS", "https://app.example.com").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

---

## 3. Patrones de Código: Inseguro vs Seguro

### Validación con Pydantic y Control de Acceso a Recursos (IDOR)

**Inseguro:**
```python
# Inseguro: no valida longitud de campos y no verifica si el usuario es dueño del recurso
@app.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    return invoice # Retorna la factura de cualquier usuario
```

**Seguro:**
```python
from pydantic import BaseModel, Field
from typing import Annotated

class InvoiceResponse(BaseModel):
    id: int
    amount: float
    status: str

    class Config:
        from_attributes = True

@app.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: Annotated[int, Field(gt=0)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db)
):
    invoice = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.user_id == current_user.id # Previene IDOR verificando pertenencia
    ).first()

    if not invoice:
        # Se retorna 404 para no revelar si la factura existe o no a usuarios no autorizados
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Invoice not found"
        )

    return invoice
```

---

## 4. Checklist para FastAPI

- [ ] `/docs` y `/redoc` están deshabilitados o protegidos con autenticación en producción.
- [ ] CORS restringe orígenes a una lista blanca específica; no usa `*` junto con `allow_credentials=True`.
- [ ] Todos los modelos Pydantic definen límites de tamaño (`max_length`, `ge`, `le`) para prevenir ataques de denegación de servicio.
- [ ] Las consultas a base de datos verifican la propiedad del recurso contra `current_user` para prevenir IDOR.
- [ ] No se exponen contraseñas ni hashes en los modelos `response_model`.
