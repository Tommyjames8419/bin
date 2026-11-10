(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlainPack = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function validate(name, quiet, flag) {
    if (typeof name !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9 ._()-]{0,145}\.(msi|exe)$/i.test(name)) {
      throw new Error('Use an .msi or .exe with a simple file name (letters, numbers, spaces, dots, hyphens, underscores, or parentheses).');
    }
    var isMsi = /\.msi$/i.test(name);
    var cleanFlag = (flag || '').trim();
    if (!isMsi && quiet && !/^(?:--?|\/)[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(cleanFlag)) {
      throw new Error('Enter one quiet switch from the installer’s documentation, such as /S or --silent.');
    }
    return { name: name, isMsi: isMsi, quiet: Boolean(quiet), flag: cleanFlag };
  }

  function generate(name, quiet, flag, expectedHash) {
    var options = validate(name, quiet, flag);
    if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error('The installer hash is unavailable. Select the file again.');
    var args = options.isMsi ? (options.quiet ? ' /qn /norestart' : '') : (options.quiet ? ' ' + options.flag : '');
    // File paths are passed on standard input, never interpolated into PowerShell code.
    var verification = "$ErrorActionPreference='Stop'; try { $p=[Console]::In.ReadLine(); $h=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash; $s=Get-AuthenticodeSignature -LiteralPath $p; $publisher=if ($s.SignerCertificate) { $s.SignerCertificate.Subject -replace '[\\r\\n]', ' ' } else { 'Unavailable' }; [Console]::Out.WriteLine($h); [Console]::Out.WriteLine($s.Status.ToString()); [Console]::Out.WriteLine($publisher); exit 0 } catch { [Console]::Error.WriteLine('Verification failed'); exit 1 }";
    return [
      '// PlainPack launcher. Keep this file beside the original installer.',
      '// Checks the file hash and publisher, then asks for confirmation.',
      'var installerName = ' + JSON.stringify(options.name) + ';',
      'var expectedHash = ' + JSON.stringify(expectedHash.toUpperCase()) + ';',
      'var shell = new ActiveXObject("WScript.Shell");',
      'var files = new ActiveXObject("Scripting.FileSystemObject");',
      'var folder = files.GetParentFolderName(WScript.ScriptFullName);',
      'var installerPath = files.BuildPath(folder, installerName);',
      'var logPath = files.BuildPath(folder, installerName + ".plainpack.log");',
      'var logUnavailable = false;',
      'function log(message) {',
      '  try { var f = files.OpenTextFile(logPath, 8, true); f.WriteLine(new Date().toString() + " | " + message); f.Close(); }',
      '  catch (error) { if (!logUnavailable) { logUnavailable = true; shell.Popup("Could not write the installation log beside the installer.", 0, "PlainPack", 48); } }',
      '}',
      'if (!files.FileExists(installerPath)) {',
      '  log("Installer not found: " + installerName);',
      '  shell.Popup("Installer not found: " + installerName + "\\n\\nPlace it in the same folder as this launcher.", 0, "PlainPack", 16);',
      '  WScript.Quit(1);',
      '}',
      'var verificationOutput;',
      'try {',
      '  var verifier = shell.Exec(' + JSON.stringify('powershell.exe -NoProfile -NonInteractive -Command "' + verification + '"') + ');',
      '  verifier.StdIn.WriteLine(installerPath);',
      '  verifier.StdIn.Close();',
      '  verificationOutput = verifier.StdOut.ReadAll();',
      '  if (verifier.ExitCode !== 0) throw new Error("Windows PowerShell could not verify the installer.");',
      '} catch (error) {',
      '  log("Verification failed: " + error.message);',
      '  shell.Popup("Could not verify this installer. Windows PowerShell is required.\\n\\n" + error.message, 0, "PlainPack", 16);',
      '  WScript.Quit(1);',
      '}',
      'var lines = verificationOutput.replace(/\\r/g, "").split("\\n");',
      'if (!/^[A-Fa-f0-9]{64}$/.test(lines[0]) || !lines[1] || !lines[2]) {',
      '  log("Verification returned an incomplete result.");',
      '  shell.Popup("Could not read the verification result. Installation was stopped.", 0, "PlainPack", 16);',
      '  WScript.Quit(1);',
      '}',
      'if (lines[0].toUpperCase() !== expectedHash) {',
      '  log("Hash mismatch; installation stopped.");',
      '  shell.Popup("The installer has changed since this launcher was created. Installation was stopped.", 0, "PlainPack", 16);',
      '  WScript.Quit(1);',
      '}',
      'var signature = lines[1] === "Valid" ? "Valid" : lines[1] + " (not verified as trusted)";',
      'log("Hash matched; signature: " + lines[1] + "; publisher: " + lines[2]);',
      'var details = "Installer: " + installerName + "\\nLocation: " + installerPath + "\\nSHA-256: " + expectedHash + "\\nSignature: " + signature + "\\nPublisher: " + lines[2] + "\\nMode: ' + (options.quiet ? 'Quiet' : 'Standard') + (options.quiet && !options.isMsi ? '\\nQuiet switch: ' + options.flag : '') + '";',
      'if (shell.Popup(details + "\\n\\nOnly continue if you trust the publisher and installer. Start installation?", 0, "Confirm installation", 36) !== 6) { log("Installation cancelled."); WScript.Quit(0); }',
      'try {',
      '  log("Installation started.");',
      '  var command = ' + (options.isMsi ? '"msiexec.exe /i \\\"" + installerPath + "\\\"' + args + '"' : '"\\\"" + installerPath + "\\\"' + args + '"') + ';',
      '  var result = shell.Run(command, 1, true);',
      '  log("Installer exited with code " + result);',
      '  if (result === 0) shell.Popup("The installer finished successfully. See " + logPath + " for the log.", 0, "PlainPack", 64);',
      '  else if (result === 3010 && ' + options.isMsi + ') shell.Popup("Installation finished. A restart is required. See " + logPath + " for the log.", 0, "PlainPack", 64);',
      '  else shell.Popup("The installer exited with code " + result + ". Check its documentation. Log: " + logPath, 0, "PlainPack", 48);',
      '} catch (error) {',
      '  log("Could not start installer: " + error.message);',
      '  shell.Popup("Could not start the installer: " + error.message, 0, "PlainPack", 16);',
      '  WScript.Quit(1);',
      '}',
      'WScript.Quit(result);',
      ''
    ].join('\r\n');
  }
  return { validate: validate, generate: generate };
}));
