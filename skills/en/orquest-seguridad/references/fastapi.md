# FastAPI Security

This reference defines security best practices for APIs built with FastAPI (Python 3.10+ and Pydantic v2).

---

## 1. Common Pitfalls and Vulnerabilities

- **Permissive Global CORS (`allow_origins=["*"]`) with Credentials**: Allowing arbitrary origin domains to execute authenticated cross-site requests.
- **Unbounded Pydantic Schemas**: Failing to specify string lengths (`max_length`) or collection limits, enabling payload-based Denial of Service (DoS).
- **SQL Injection in Asynchronous Drivers**: Concatenating parameters when using asyncpg, databases, or raw SQLAlchemy sessions.
- **Exposed Swagger/Redoc in Production**: Leaving interactive documentation endpoints (`/docs`, `/redoc`) publicly accessible in production.

---

## 2. Secure Application Configuration

```python
import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer

# 1. Disable interactive docs in production
is_production = os.getenv("ENVIRONMENT") == "production"

app = FastAPI(
    title="Core Secure API",
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)

# 2. Restrictive CORS
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

## 3. Code Patterns: Insecure vs Secure

### Pydantic Validation and Broken Object Level Authorization (BOLA/IDOR)

**Insecure:**
```python
# Insecure: no length constraints and returns invoices belonging to any user
@app.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    return invoice
```

**Secure:**
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
        Invoice.user_id == current_user.id # Precludes IDOR by scoping to owner
    ).first()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Invoice not found"
        )

    return invoice
```

---

## 4. FastAPI Security Checklist

- [ ] `/docs` and `/redoc` are disabled or authenticated in production.
- [ ] CORS whitelists specific origins; does not use `*` with `allow_credentials=True`.
- [ ] Pydantic schemas enforce bounds (`max_length`, `ge`, `le`) to mitigate DoS.
- [ ] Queries scope resources to `current_user` to prevent BOLA/IDOR vulnerabilities.
- [ ] No passwords or sensitive hashes are exposed in `response_model` definitions.
