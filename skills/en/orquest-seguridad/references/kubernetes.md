# Kubernetes Workload Security

This reference defines standards for deploying hardened workloads on Kubernetes clusters.

---

## 1. Critical Pitfalls and Risk Vectors

- **Privileged Containers (`privileged: true`)**: Grants full access to all host devices on the underlying Kubernetes node.
- **Overprivileged ServiceAccount Tokens (`automountServiceAccountToken: true`)**: Default mounting of API tokens into every pod, allowing compromised workloads to query the Kubernetes API.
- **Flat Unrestricted Networks (Missing NetworkPolicies)**: Allowing all pods to communicate unrestricted across namespaces and ports.
- **Missing Resource Limits**: Pods without CPU/Memory limits can consume entire node resources, causing Denial of Service for adjacent pods.

---

## 2. Hardened Deployment and SecurityContext

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secure-backend
  namespace: production
  labels:
    app: secure-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: secure-backend
  template:
    metadata:
      labels:
        app: secure-backend
    spec:
      # 1. Do not mount ServiceAccount token unless explicitly required
      automountServiceAccountToken: false

      # 2. Pod-level SecurityContext
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        runAsGroup: 10001
        fsGroup: 10001
        seccompProfile:
          type: RuntimeDefault

      containers:
        - name: app
          image: myregistry.example.com/backend:1.0.4@sha256:45b43b0ce53e6...
          imagePullPolicy: IfNotPresent
          
          # 3. Container-level SecurityContext
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL

          # 4. Enforce strict resource limits
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "1000m"
              memory: "512Mi"

          # 5. Ephemeral in-memory volume for writable temporary files
          volumeMounts:
            - mountPath: /tmp
              name: tmp-volume

      volumes:
        - name: tmp-volume
          emptyDir: {}
```

---

## 3. Restrictive NetworkPolicy

Isolates workloads so they only accept traffic from the Ingress Gateway and only send traffic to PostgreSQL:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-network-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: secure-backend
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Accept incoming traffic only from Ingress controller on port 3000
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000
  egress:
    # Allow outbound traffic only to PostgreSQL pods
    - to:
        - podSelector:
            matchLabels:
              app: postgres-db
      ports:
        - protocol: TCP
          port: 5432
    # Allow cluster internal DNS resolution
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
```

---

## 4. Kubernetes Security Checklist

- [ ] `runAsNonRoot: true` and `allowPrivilegeEscalation: false` configured.
- [ ] Linux capabilities dropped via `capabilities: drop: ["ALL"]`.
- [ ] `readOnlyRootFilesystem: true` active with writable `/tmp` on `emptyDir`.
- [ ] `automountServiceAccountToken: false` set when cluster API access is not required.
- [ ] CPU and memory requests and limits defined.
- [ ] `NetworkPolicy` restricts east-west inter-pod traffic.
