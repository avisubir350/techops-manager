#!/bin/bash

# Create cluster if it doesn't exist
kind create cluster --name my-cluster

# Apply monitoring stack
kubectl apply -f prometheus.yml
kubectl apply -f grafana.yml

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app=prometheus --timeout=300s
kubectl wait --for=condition=ready pod -l app=grafana --timeout=300s

# Get service ports
PROMETHEUS_PORT=$(kubectl get svc prometheus-service -o jsonpath='{.spec.ports[0].nodePort}')
GRAFANA_PORT=$(kubectl get svc grafana-service -o jsonpath='{.spec.ports[0].nodePort}')

echo "Prometheus: http://localhost:$PROMETHEUS_PORT"
echo "Grafana: http://localhost:$GRAFANA_PORT (admin/admin)"

# Port forward for easy access
kubectl port-forward service/prometheus-service 9090:9090 &
kubectl port-forward service/grafana-service 3000:3000 &

echo "Port forwarding started. Press Ctrl+C to stop."
wait
