# Hospital Staff Hub

hi , please make a database website for my hospital staff , make the UI , design , font , colour , size , shape , minimalism same as the one in this website https://www.bmkg.go.id/gempabumi/20260816061534 . copy the UI , design , font , colour . 1 to 1

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f1a81ec0-d74a-4409-b29d-a16dc89718d3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Deploying to GitHub Pages

This project is fully configured for automated deployment to **GitHub Pages** via GitHub Actions.

### Quick Setup Steps on GitHub:

1. Push this repository to GitHub on branch `main` or `master`.
2. On GitHub, go to your repository **Settings** → **Pages** (under the "Code and automation" sidebar).
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. The workflow in `.github/workflows/deploy.yml` will automatically build and publish your site whenever you push changes to `main`!

### Features configured for GitHub Pages:

- **Automatic subpath base resolution**: Supports both `https://<username>.github.io/<repo-name>/` and custom domains.
- **Client-Side SPA Routing fallback**: Included `404.html` redirect and route static HTML pages to prevent 404 errors when reloading subpages like `/staff`, `/stress-test`, or `/holter`.
- **Bypass Jekyll**: `.nojekyll` included in the build output to ensure all static assets load properly.
- **Build output**: Static bundle is generated into `dist/` and `.output/public/`.

## Account Provisioning & Security Administration

All account creation and management (Administrator, Primary Care Health Clinics, Hospitals, KKIA, KD, and Outsource Diagnostic Providers) is enforced strictly through **trusted backend provisioning scripts** using the Firebase Admin SDK. The public React client cannot self-provision accounts or create authorization profiles (`users/{uid}` rules enforce `allow create: if false;`).

### Prerequisites

Execute provisioning scripts in a secure administrative environment with GCP / Firebase Admin service account credentials:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

> **Security Warning**: Never commit service account keys (`service-account.json` or similar) to version control. They are excluded via `.gitignore`. If credentials are unavailable, the backend manager will fail closed.

---

### Interactive Facility Account Manager CLI

For comprehensive administrative management of all ~84 canonical facilities (Hospitals, KK, KKIA, KD), use the unified backend management tool:

```bash
node scripts/manage-facilities.js
```

#### Main Menu Options:
1. **List All Facilities**: Displays all 84 canonical facilities with dynamic account existence and active/inactive status.
2. **Search Facility**: Search facilities by name, `facilityId`, or category.
3. **Filter by Category**: Filter facilities by `Hospital`, `Klinik Kesihatan (KK)`, `Klinik Kesihatan Ibu & Anak (KKIA)`, or `Klinik Desa (KD)`.
4. **Show Facilities Without Accounts**: Lists unprovisioned facilities for gradual rollout.
5. **Show Existing Accounts**: Lists all provisioned accounts.
6. **Create Facility Account**: Securely provisions a new facility Auth account and trusted Firestore profile (Create-Only with rollback safety). Allows manual password entry (min 12 characters) or cryptographic random password generation.
7. **Reset Facility Password**: Resets an existing facility's password while preserving stable UID, `facilityId`, role, and historical records. Requires explicit administrator confirmation (`YES`).
8. **Activate / Deactivate Facility**: Toggles facility account active status without deleting Firebase Auth credentials, appointments, or patient data.
9. **Inspect Facility Account**: Displays safe administrative metadata (Auth status, profile existence, UID, role, active status, creation time, last sign-in time) without exposing passwords or private keys.
0. **Exit**: Safely exits the manager.

---

### Individual Administrative Scripts

### 1. Provisioning an Administrator Account

```bash
node scripts/provision-admin.js [admin-email]
# Prompts interactively for secure password and confirmation
```

### 2. Provisioning a Primary Care Facility / Clinic Account

```bash
node scripts/provision-facility.js <facilityId> <facilityName> [category]
# Examples:
node scripts/provision-facility.js kk_masai "Klinik Kesihatan Masai" "Klinik Kesihatan"
# Prompts interactively for secure password and confirmation
```

### 3. Resetting a Facility Account Password

```bash
node scripts/reset-facility-password.js <facilityId>
# Example:
node scripts/reset-facility-password.js kk_masai
# Prompts interactively for new password and confirmation
```

### 4. Provisioning an Outsource Diagnostic Provider Account

```bash
node scripts/provision-outsource.js
# Prompts interactively for secure password and confirmation
```

## Medical Report Storage & Migration (Firebase Storage)

Diagnostic reports and outsource imaging scans are stored securely in **Firebase Storage** (partitioned by canonical `facilityId` and `reportId`), with access independently authorized via `storage.rules`. Firestore records contain metadata and `storagePath` references only.

### 1. Storage Security Rules

- Facility reports (`facilities/{facilityId}/reports/{reportId}/{fileName}`) require authentication and `users/{uid}.facilityId == facilityId` or `role == "admin"`.
- Outsource reports (`outsource/{facilityId}/reports/{reportId}/{fileName}`) permit access by the designated facility, administrators, and authorized outsource providers.
- File size is restricted to 20MB and content types to PDF and images.

### 2. Migrating Legacy Base64 Reports to Firebase Storage

To migrate any existing Base64 `dataUrl` reports into Firebase Storage:

```bash
node scripts/migrate-reports-to-storage.js
```

The migration script is idempotent and safely updates Firestore metadata only after verifying successful Storage upload.
