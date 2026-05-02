#!/bin/bash

# Exit on error
set -e

echo "📦 Starting extension packaging process..."

# Create VSIX
echo "📦 Creating VSIX package..."
# Uses @vscode/vsce from devDependencies
bunx vsce package --no-dependencies

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
NAME=$(node -p "require('./package.json').name")
VSIX_FILE="${NAME}-${VERSION}.vsix"

if [ -f "$VSIX_FILE" ]; then
    echo "✅ Success! Package created: $VSIX_FILE"
    echo "💡 To install, run: code --install-extension $VSIX_FILE"
else
    echo "❌ Error: VSIX file was not generated."
    exit 1
fi
