# Kind Installation Guide

## Install Kind

### Linux/macOS
```bash
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind
```

### Windows
```powershell
curl.exe -Lo kind-windows-amd64.exe https://kind.sigs.k8s.io/dl/v0.20.0/kind-windows-amd64
Move-Item .\kind-windows-amd64.exe c:\some-dir-in-your-PATH\kind.exe
```

### Using Package Managers

**macOS (Homebrew):**
```bash
brew install kind
```

**Windows (Chocolatey):**
```powershell
choco install kind
```

**Linux (Go):**
```bash
go install sigs.k8s.io/kind@v0.20.0
```

## Verify Installation
```bash
kind version
```

## Create Cluster
```bash
kind create cluster --name my-cluster
```

## Setup Application
```bash
# Apply deployment
kubectl apply -f deployment.yml

# Apply service
kubectl apply -f service.yml

# Port forward to access locally
kubectl port-forward service/app-service 8080:80
```

## Access Application
Open browser: `http://localhost:8080`
