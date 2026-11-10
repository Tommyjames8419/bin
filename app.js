(function () {
  'use strict';
  var input = document.getElementById('installer-file');
  var dropzone = document.getElementById('dropzone');
  var fileInfo = document.getElementById('file-info');
  var integrityCard = document.getElementById('integrity-card');
  var fileHash = document.getElementById('file-hash');
  var hashStatus = document.getElementById('hash-status');
  var fileError = document.getElementById('file-error');
  var optionError = document.getElementById('option-error');
  var quiet = document.getElementById('quiet');
  var flag = document.getElementById('exe-flag');
  var exeOptions = document.getElementById('exe-options');
  var generateButton = document.getElementById('generate');
  var result = document.getElementById('result');
  var selectedFile = null;
  var selectedHash = null;
  var selectionVersion = 0;

  function showError(element, message) { element.textContent = message || ''; element.hidden = !message; }
  function updateOptions() {
    exeOptions.hidden = !(selectedFile && /\.exe$/i.test(selectedFile.name) && quiet.checked);
    showError(optionError, '');
    result.hidden = true;
  }
  async function chooseFile(file) {
    var version = ++selectionVersion;
    selectedFile = null;
    selectedHash = null;
    result.hidden = true;
    showError(fileError, '');
    fileInfo.hidden = true;
    integrityCard.hidden = true;
    generateButton.disabled = true;
    if (!file) { updateOptions(); return; }
    try { PlainPack.validate(file.name, false, ''); }
    catch (error) { showError(fileError, error.message); input.value = ''; updateOptions(); return; }
    selectedFile = file;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-meta').textContent = (file.size / 1048576).toFixed(2) + ' MB · ' + (/\.msi$/i.test(file.name) ? 'Windows Installer' : 'Windows executable');
    fileInfo.hidden = false;
    integrityCard.hidden = false;
    fileHash.textContent = '';
    hashStatus.textContent = 'Calculating SHA-256…';
    updateOptions();
    try {
      if (!window.crypto || !window.crypto.subtle) throw new Error('SHA-256 requires a secure connection (HTTPS or localhost).');
      var bytes = await file.arrayBuffer();
      var digest = await window.crypto.subtle.digest('SHA-256', bytes);
      if (version !== selectionVersion) return;
      selectedHash = Array.from(new Uint8Array(digest), function (byte) { return byte.toString(16).padStart(2, '0'); }).join('').toUpperCase();
      fileHash.textContent = selectedHash;
      hashStatus.textContent = 'Ready to verify when you install';
      generateButton.disabled = false;
    } catch (error) {
      if (version !== selectionVersion) return;
      hashStatus.textContent = 'Fingerprint unavailable';
      showError(fileError, error.message || 'Could not read the installer. Select it again.');
    }
  }
  input.addEventListener('change', function () { chooseFile(input.files[0]); });
  document.getElementById('remove-file').addEventListener('click', function () { input.value = ''; chooseFile(null); });
  quiet.addEventListener('change', updateOptions);
  flag.addEventListener('input', function () { showError(optionError, ''); result.hidden = true; });
  ['dragenter', 'dragover'].forEach(function (eventName) { dropzone.addEventListener(eventName, function (event) { event.preventDefault(); dropzone.classList.add('dragging'); }); });
  ['dragleave', 'drop'].forEach(function (eventName) { dropzone.addEventListener(eventName, function (event) { event.preventDefault(); dropzone.classList.remove('dragging'); }); });
  dropzone.addEventListener('drop', function (event) { input.value = ''; chooseFile(event.dataTransfer.files[0]); });
  generateButton.addEventListener('click', function () {
    if (!selectedFile || !selectedHash) return;
    var script;
    try { script = PlainPack.generate(selectedFile.name, quiet.checked, flag.value, selectedHash); }
    catch (error) { showError(optionError, error.message); flag.focus(); return; }
    var blob = new Blob([script], { type: 'application/javascript;charset=us-ascii' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = selectedFile.name.replace(/\.(msi|exe)$/i, '') + '-launcher.js';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    document.getElementById('result-file').textContent = selectedFile.name;
    result.hidden = false;
  });
}());
