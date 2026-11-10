<!-- coderabbit-ai-generated:v1 -->

# PlainPack

PlainPack generates a readable Windows Script Host JavaScript launcher for an MSI or EXE installer selected in the browser. The installer is not uploaded or embedded.

## Run locally

Run `python3 -m http.server 4173` in this directory and open `http://localhost:4173/`. No package installation is required.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:fa4ec58a90f9cae11164adb2f7d371ac9a004b310fdbb58ee464b7056915f13a -->

## Use

1. Select a trusted `.msi` or `.exe` file. File names must use letters, numbers, spaces, dots, hyphens, underscores, or parentheses. The browser calculates the file's SHA-256 hash locally; no installer is uploaded. Hashing requires a secure context such as HTTPS or localhost.
2. Choose whether to use quiet mode. MSI quiet mode uses `/qn /norestart`. EXE quiet mode requires one switch documented by the installer's publisher.
3. Download the launcher and put it in the same folder as the original installer. On Windows, open the launcher with Windows Script Host. Windows PowerShell must also be available for the checks.
4. The launcher compares the installer hash to the saved hash and stops if they differ or the check fails. It then shows Windows' Authenticode signature status and certificate subject before asking for confirmation. An unsigned or untrusted file is identified as such, and the user can cancel. Depending on system settings, administrator approval may be required.

The launcher writes an installation log beside the installer, including the signature status, publisher, and outcome; it warns if it cannot write the log. Review the displayed publisher and compare the hash with a value supplied by a trusted source: a matching hash only confirms the file matches the one selected when the launcher was made, and a valid signature does not establish that software is safe. Files could change between the check and installation. Quiet switches vary by installer. The app does not sign the generated script.


<!-- /coderabbit-ai-generated:v1 -->
## Test

Run `node --test tests/packager.test.js`. The tests simulate Windows Script Host; testing on Windows is still needed for an actual installer.
