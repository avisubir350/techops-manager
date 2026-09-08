# Prometheus and Grafana Setup

## Install Prometheus

### Create Prometheus Deployment
```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      containers:
      - name: prometheus
        image: prom/prometheus:latest
        ports:
        - containerPort: 9090
---
apiVersion: v1
kind: Service
metadata:
  name: prometheus-service
spec:
  selector:
    app: prometheus
  ports:
  - port: 9090
    targetPort: 9090
  type: ClusterIP
EOF
```

## Install Grafana

### Create Grafana Deployment
```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      containers:
      - name: grafana
        image: grafana/grafana:latest
        ports:
        - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: grafana-service
spec:
  selector:
    app: grafana
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
EOF
```

## Access Services

### Port Forward Prometheus
```bash
kubectl port-forward service/prometheus-service 9090:9090
```

### Port Forward Grafana
```bash
kubectl port-forward service/grafana-service 3000:3000
```

## Access URLs
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000
  - Default login: `admin` / `admin`

## Configure Grafana Data Source
1. Login to Grafana
2. Add Prometheus data source: `http://prometheus-service:9090`
3. Save & Test
