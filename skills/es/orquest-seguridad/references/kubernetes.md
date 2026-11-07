# Seguridad en Kubernetes

Esta referencia establece las directrices de seguridad para desplegar cargas de trabajo protegidas en clústeres de Kubernetes.

---

## 1. Errores Críticos y Vectores de Riesgo

- **Contenedores Privilegiados (`privileged: true`)**: Otorga acceso total a todos los dispositivos del nodo host del clúster.
- **Permisos de Servicio Excesivos (`automountServiceAccountToken: true`)**: Dejar que todos los pods monten automáticamente el token del ServiceAccount por defecto, permitiendo que un atacante consulte la API de Kubernetes si compromete un pod.
- **Red Plana sin Aislamiento (Falta de NetworkPolicies)**: Permitir que cualquier pod hable con cualquier otro pod en el clúster sin restricción de puerto ni espacio de nombres.
- **Falta de Límites de Recursos (Resource Limits)**: Pods sin CPU/Memory limits que pueden agotar los recursos del nodo y causar caídas de pods vecinos (DoS).

---

## 2. Configuración Segura de Deployment y SecurityContext

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
      # 1. No montar automáticamente tokens de ServiceAccount innecesarios
      automountServiceAccountToken: false

      # 2. Configuración de seguridad a nivel de Pod
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
          
          # 3. Configuración de seguridad a nivel de Contenedor
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL

          # 4. Límites de recursos estrictos
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "1000m"
              memory: "512Mi"

          # 5. Sistema de archivos temporal montado en memoria para escritura
          volumeMounts:
            - mountPath: /tmp
              name: tmp-volume

      volumes:
        - name: tmp-volume
          emptyDir: {}
```

---

## 3. Política de Red Restrictiva (NetworkPolicy)

Aísla la carga de trabajo para que solo reciba tráfico del Ingress Controller y solo pueda comunicarse con la base de datos:

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
    # Solo permitir tráfico entrante desde el Ingress Gateway en puerto 3000
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000
  egress:
    # Solo permitir tráfico saliente hacia la base de datos PostgreSQL
    - to:
        - podSelector:
            matchLabels:
              app: postgres-db
      ports:
        - protocol: TCP
          port: 5432
    # Permitir resolución DNS dentro del clúster
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

## 4. Checklist para Kubernetes

- [ ] `runAsNonRoot: true` y `allowPrivilegeEscalation: false` están configurados.
- [ ] Las capacidades de Linux están revocadas con `drop: ["ALL"]`.
- [ ] `readOnlyRootFilesystem: true` está activo con `/tmp` montado en `emptyDir`.
- [ ] `automountServiceAccountToken: false` configurado si el pod no interactúa con la API de K8s.
- [ ] Se especifican límites (`limits`) y solicitudes (`requests`) de CPU y memoria.
- [ ] Se implementaron `NetworkPolicy` para restringir el tráfico este-oeste entre pods.
