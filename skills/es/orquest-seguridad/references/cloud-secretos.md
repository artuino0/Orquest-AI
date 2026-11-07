# Seguridad en la Nube y Gestión de Secretos (AWS, GCP, Azure)

Esta referencia define las directrices de seguridad para la gestión de identidades, roles de acceso y almacenamiento de secretos en proveedores de nube.

---

## 1. Principio de Privilegio Mínimo en IAM

- **Prohibido**: Utilizar credenciales de usuario raíz (*root account*) o asignar permisos comodín (`"Action": "*"` o `"Resource": "*"`).
- **Prohibido**: Almacenar credenciales estáticas de larga duración (`AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`) dentro de máquinas virtuales, repositorios o archivos de configuración.
- **Obligatorio**: Utilizar **identidades federadas y roles asumidos temporalmente**:
  - AWS: Roles de IAM asociados a instancias EC2 / ECS Tasks / EKS IRSA (IAM Roles for Service Accounts).
  - GCP: Cuentas de Servicio con Workload Identity.
  - Azure: Identidades Administradas (Managed Identities).

---

## 2. Gestión Centralizada de Secretos

Los secretos nunca deben residir en texto plano en repositorios ni en archivos de configuración desplegados.

### Servicios de Secretos Oficiales:
- **AWS Secrets Manager / AWS Systems Manager Parameter Store (KMS)**.
- **Google Cloud Secret Manager**.
- **Azure Key Vault**.
- **HashiCorp Vault**.

### Ejemplo de Consumo Seguro en Node.js (AWS Secrets Manager):
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Inicialización usando el rol asumido por el contenedor (sin credenciales hardcodeadas)
const client = new SecretsManagerClient({ region: 'us-east-1' });

export async function getDatabaseCredentials(): Promise<{ user: string; pass: string }> {
  const command = new GetSecretValueCommand({
    SecretId: 'production/core-db-credentials',
  });

  const response = await client.send(command);
  if (!response.SecretString) {
    throw new Error('Secret value is empty or not a string');
  }

  return JSON.parse(response.SecretString);
}
```

---

## 3. Rotación Automática y Auditoría

1. **Rotación programada**: Todo secreto de base de datos o API externa debe contar con un ciclo de rotación automático (cada 30 a 90 días).
2. **Cifrado con Claves Administradas por el Cliente (CMEK / KMS)**: Cifrar los almacenes de secretos utilizando llaves KMS dedicadas con políticas de uso restringidas.
3. **Auditoría inmutable**: Activar el registro de accesos a secretos mediante AWS CloudTrail, GCP Cloud Audit Logs o Azure Monitor para detectar accesos anómalos o intentos no autorizados.

---

## 4. Checklist para Cloud y Secretos

- [ ] No existen credenciales estáticas de nube almacenadas en código ni en variables locales `.env`.
- [ ] Las aplicaciones asumen roles temporales (IRSA, Workload Identity, Managed Identity).
- [ ] Las políticas de IAM restringen acciones a recursos ARN específicos sin usar comodines `*`.
- [ ] Los secretos se recuperan en tiempo de arranque desde un gestor de secretos cifrado con KMS.
- [ ] Está activada la auditoría de accesos a secretos en el proveedor de nube.
