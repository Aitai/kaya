# Tauri Updater Setup Guide

This guide explains how to set up the Tauri auto-updater for Kaya.

## Overview

Kaya uses Tauri's built-in updater to provide automatic updates to users. The updater:

- Checks for new versions on startup (can be disabled)
- Can be manually triggered from the Help menu
- Uses cryptographic signatures to verify updates
- Downloads and installs updates in the background

## Setup Instructions

### 1. Generate Signing Keys

Run this command to generate a new key pair:

```bash
cd apps/desktop
bun tauri signer generate -w ~/.tauri/kaya.key
```

This creates:

- Private key: `~/.tauri/kaya.key`
- Public key: Printed to console

**Important**: Keep the private key secret! Never commit it to git.

### 2. Update Public Key

Copy the public key from the output and update `apps/desktop/src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://github.com/kaya-go/kaya/releases/latest/download/latest.json"],
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

### 3. Add GitHub Secrets

Add these secrets to your GitHub repository:

1. Go to **Settings → Secrets and variables → Actions**
2. Add two new secrets:

**TAURI_SIGNING_PRIVATE_KEY**:

```bash
cat ~/.tauri/kaya.key
```

Copy the entire contents (including the header/footer lines).

**TAURI_SIGNING_PRIVATE_KEY_PASSWORD**:
Enter the password you used when generating the key (or leave empty if no password).

### 4. Enable Auto-Check on Startup

After creating your first release, re-enable the startup check in `apps/desktop/src/Updater.tsx`:

```typescript
// Change this:
// checkForUpdates(true);

// To this:
checkForUpdates(true);
```

## Release Process

When you create a release using the GitHub Actions workflow:

1. Builds are created for all platforms
2. Signatures are generated for each installer (`.dmg.sig`, `.AppImage.sig`, `.exe.sig`)
3. `latest.json` is generated with download URLs and signatures
4. All files are uploaded to the GitHub release

The `latest.json` looks like this:

```json
{
  "version": "v0.1.0",
  "notes": "Release notes here",
  "pub_date": "2025-11-23T00:00:00Z",
  "platforms": {
    "darwin-x86_64": {
      "signature": "...",
      "url": "https://github.com/kaya-go/kaya/releases/download/v0.1.0/Kaya_0.1.0_universal.dmg"
    },
    "windows-x86_64": {
      "signature": "...",
      "url": "https://github.com/kaya-go/kaya/releases/download/v0.1.0/Kaya_0.1.0_x64-setup.exe"
    },
    "linux-x86_64": {
      "signature": "...",
      "url": "https://github.com/kaya-go/kaya/releases/download/v0.1.0/kaya_0.1.0_amd64.AppImage"
    }
  }
}
```

## Testing

### Test Updater Locally

1. Build the app: `bun run tauri:build`
2. Run the built app (not dev mode)
3. Click **Help → Check for Updates**
4. Verify the error message (expected if no releases yet)

### Test After First Release

1. Install version 0.1.0
2. Create version 0.1.1 release
3. Launch 0.1.0 app
4. Should auto-prompt for update (or check manually)
5. Verify download and installation

## Troubleshooting

### "Could not fetch a valid release JSON"

This is **expected** if:

- No releases have been created yet
- The release is a draft and not published
- The `latest.json` file is missing from the release

**Solution**: Publish your first release or disable auto-check.

### "Invalid signature"

The signature verification failed. Check:

- Public key in `tauri.conf.json` matches the private key used for signing
- GitHub secrets are correctly set
- Signature files (.sig) were uploaded to the release

### "Update failed to install"

- Check file permissions
- Ensure the app is not running when installing the update

## Security

- Private keys are stored in GitHub Secrets (encrypted)
- Updates are verified with Ed25519 signatures
- HTTPS is used for all downloads
- Tauri verifies signatures before installation

## Disabling the Updater

To completely disable the updater:

1. Remove the `updater` section from `tauri.conf.json`
2. Remove the `Updater` component from `apps/desktop/src/App.tsx`
3. Remove the "Check for Updates" menu item

## References

- [Tauri Updater Guide](https://v2.tauri.app/plugin/updater/)
- [Tauri Signing Documentation](https://v2.tauri.app/reference/cli/#signer)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
