# TechOps Manager CI/CD Pipeline

## Prerequisites

### GitHub Secrets
```
DOCKERHUB_USERNAME       # Docker Hub username
DOCKERHUB_TOKEN         # Docker Hub access token
SONAR_TOKEN            # SonarQube authentication token
SONAR_HOST_URL         # SonarQube server URL
ARGOCD_SERVER          # ArgoCD server URL (e.g., argocd.example.com)
ARGOCD_USERNAME        # ArgoCD username
ARGOCD_PASSWORD        # ArgoCD password
ARGOCD_APP_NAME        # ArgoCD application name
```

### Required Tools
- Docker Hub account
- SonarQube server
- ArgoCD server
- Kubernetes cluster

### Repository Structure
```
├── .github/workflows/ci-cd.yml
├── k8s/deployment.yml
├── Dockerfile
├── sonar-project.properties
├── go.mod
└── main.go
```

## Pipeline Stages

1. **Security Scan** - Trivy filesystem vulnerability scan
2. **Test** - Go tests with coverage reports
3. **Build & Scan** - Docker build, image scan, SonarQube analysis
4. **Deploy** - Update K8s manifests, ArgoCD sync
5. **Notify** - Deployment status

## Setup

1. Add required secrets to GitHub repository settings
2. Configure SonarQube project with key `techops-manager`
3. Create ArgoCD application pointing to your repository
4. Push to `devops` branch to trigger pipeline

## Pipeline Triggers
- Push to `devops` branch (full pipeline)
- Pull request to `devops` branch (scan + test only)
