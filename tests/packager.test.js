const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { generate, validate } = require('../packager.js');
const hash = 'A'.repeat(64);
function launcher(name = 'setup.msi', quiet = false, flag = '') { return generate(name, quiet, flag, hash); }
function runLauncher(script, { exists = true, confirmation = 6, exitCode = 0, fail = false, verifierExit = 0, verification = hash + '\r\nValid\r\nCN=Example Publisher\r\n', logFail = false } = {}) {
  const popups = [], commands = [], logs = [], verifierInputs = [];
  const quit = {};
  let status, verificationCommand;
  const shell = {
    Popup(message, timeout, title, flags) { popups.push({ message, title, flags }); return flags === 36 ? confirmation : 1; },
    Exec(command) { verificationCommand = command; return { StdIn: { WriteLine: (line) => verifierInputs.push(line), Close() {} }, StdOut: { ReadAll: () => verification }, ExitCode: verifierExit }; },
    Run(command, windowStyle, wait) { commands.push({ command, windowStyle, wait }); if (fail) throw new Error('cannot start'); return exitCode; }
  };
  const files = {
    BuildPath: (folder, name) => folder + '\\' + name,
    GetParentFolderName: () => 'C:\\Install Folder',
    FileExists: () => exists,
    OpenTextFile: () => { if (logFail) throw new Error('write failed'); return { WriteLine: line => logs.push(line), Close() {} }; }
  };
  const context = { ActiveXObject: function (name) { return name === 'WScript.Shell' ? shell : files; }, WScript: { ScriptFullName: 'C:\\Install Folder\\launcher.js', Quit(code) { status = code; throw quit; } } };
  try { vm.runInNewContext(script, context); } catch (error) { if (error !== quit) throw error; }
  return { popups, commands, logs, status, verifierInputs, verificationCommand };
}

test('MSI checks integrity and publisher, confirms, and waits for the quoted installer', () => {
  const result = runLauncher(launcher('My Setup.msi', true));
  assert.match(result.verificationCommand, /Get-FileHash/);
  assert.match(result.verificationCommand, /Get-AuthenticodeSignature/);
  assert.deepEqual(result.verifierInputs, ['C:\\Install Folder\\My Setup.msi']);
  assert.equal(result.popups[0].title, 'Confirm installation');
  assert.match(result.popups[0].message, /Signature: Valid[\s\S]*Publisher: CN=Example Publisher[\s\S]*Mode: Quiet/);
  assert.deepEqual(result.commands, [{ command: 'msiexec.exe /i "C:\\Install Folder\\My Setup.msi" /qn /norestart', windowStyle: 1, wait: true }]);
  assert.equal(result.status, 0);
  assert.match(result.logs.join('\n'), /Hash matched[\s\S]*Installation started[\s\S]*exited with code 0/);
});
test('cancellation and a missing installer never start a process', () => {
  const cancelled = runLauncher(launcher(), { confirmation: 7 });
  assert.equal(cancelled.commands.length, 0);
  assert.match(cancelled.logs.at(-1), /cancelled/);
  const missing = runLauncher(launcher(), { exists: false });
  assert.equal(missing.commands.length, 0);
  assert.equal(missing.status, 1);
  assert.match(missing.popups.at(-1).message, /same folder/);
});
test('hash mismatch and verification failure stop installation before confirmation', () => {
  for (const options of [{ verification: 'B'.repeat(64) + '\nValid\nCN=Other\n' }, { verifierExit: 1 }, { verification: 'invalid\n' }]) {
    const result = runLauncher(launcher(), options);
    assert.equal(result.commands.length, 0);
    assert.equal(result.status, 1);
    assert.equal(result.popups.some(p => p.title === 'Confirm installation'), false);
  }
});
test('unsigned installers are clearly identified at confirmation', () => {
  const result = runLauncher(launcher(), { verification: hash + '\nNotSigned\nUnavailable\n', confirmation: 7 });
  assert.match(result.popups[0].message, /NotSigned \(not verified as trusted\)[\s\S]*Publisher: Unavailable/);
  assert.equal(result.commands.length, 0);
});
test('EXE launcher uses and displays only the supplied quiet switch', () => {
  const quiet = runLauncher(launcher('setup.exe', true, '--silent'));
  assert.match(quiet.popups[0].message, /Quiet switch: --silent/);
  assert.equal(quiet.commands[0].command, '"C:\\Install Folder\\setup.exe" --silent');
  assert.equal(runLauncher(launcher('setup.exe', false, '/S')).commands[0].command, '"C:\\Install Folder\\setup.exe"');
});
test('rejects malformed names, unsafe switches, and missing or invalid hashes', () => {
  for (const name of ['bad".exe', '../setup.exe', 'setup.txt', 'setup;hi.exe']) assert.throws(() => validate(name, false, ''));
  for (const flag of ['', '/S & command', '/S /other', 'silent']) assert.throws(() => launcher('setup.exe', true, flag));
  for (const value of [undefined, '', 'x'.repeat(64), 'a'.repeat(63)]) assert.throws(() => generate('setup.exe', false, '', value));
});
test('reports installer failure, restart, startup errors, and log write failure', () => {
  const failure = runLauncher(launcher(), { exitCode: 1603 });
  assert.match(failure.popups.at(-1).message, /1603/);
  assert.equal(failure.status, 1603);
  assert.match(runLauncher(launcher('setup.msi', true), { exitCode: 3010 }).popups.at(-1).message, /restart/);
  assert.match(runLauncher(launcher('setup.exe'), { fail: true }).popups.at(-1).message, /cannot start/);
  const noLog = runLauncher(launcher(), { logFail: true });
  assert.equal(noLog.popups.filter(p => /Could not write/.test(p.message)).length, 1);
});
