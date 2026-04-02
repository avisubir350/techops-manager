#!/bin/bash

# 1. Update package list
sudo apt-get update

# 2. Install the buildx plugin package specifically
# This is the most reliable way to fix the 'no such file' error on Ubuntu/Debian
sudo apt-get install -y docker-buildx-plugin

# 3. Create the CLI plugins directory if it doesn't exist
mkdir -p ~/.docker/cli-plugins

# 4. Create a symbolic link to ensure Docker can find it in the expected location
# Docker looks in both /usr/libexec and /usr/local/lib
sudo ln -sf /usr/libexec/docker/cli-plugins/docker-buildx /usr/local/lib/docker/cli-plugins/docker-buildx

# 5. Verify the installation
docker buildx version
