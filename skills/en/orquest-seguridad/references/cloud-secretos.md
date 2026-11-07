# Cloud Security and Secrets Management (AWS, GCP, Azure)

This reference defines standards for identity management, access control, and secrets storage across cloud environments.

---

## 1. Least Privilege in Cloud IAM

- **Forbidden**: Root accounts for daily operations, and wildcard policies (`"Action": "*"` or `"Resource": "*"`).
- **Forbidden**: Hardcoded long-lived cloud credentials (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) stored inside virtual machines, containers, or code repositories.
- **Mandatory**: Use **federated identities and short-lived assumed roles**:
  - AWS: IAM Roles for Service Accounts (IRSA) / ECS Task Roles / EC2 Instance Profiles.
  - GCP: Workload Identity Federation.
  - Azure: Azure Managed Identities.

---

## 2. Centralized Secrets Management

Secrets must never reside in plaintext inside codebases, configuration files, or build artifacts.

### Standard Secret Management Services:
- **AWS Secrets Manager / AWS Systems Manager Parameter Store (KMS)**.
- **Google Cloud Secret Manager**.
- **Azure Key Vault**.
- **HashiCorp Vault**.

### Secure Consumption Example in Node.js (AWS Secrets Manager):
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Initialized using task assumed role (no credentials hardcoded)
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

## 3. Automated Secret Rotation and Auditing

1. **Scheduled Rotation**: Database credentials and third-party API tokens must have automated rotation configured (every 30 to 90 days).
2. **Customer-Managed Encryption Keys (CMEK / KMS)**: Encrypt secrets stores with dedicated KMS keys with restrictive key policies.
3. **Immutable Audit Logs**: Enable access logging via AWS CloudTrail, GCP Cloud Audit Logs, or Azure Monitor to detect anomalous access patterns.

---

## 4. Cloud and Secrets Checklist

- [ ] Zero static cloud access keys stored in repositories or `.env` files.
- [ ] Applications assume temporary roles (IRSA, Workload Identity, Managed Identity).
- [ ] IAM policies scope actions to specific resource ARNs without wildcards.
- [ ] Secrets retrieved at startup from KMS-encrypted secret managers.
- [ ] Cloud access audit logging is enabled and monitored.
