const ipcRenderer = require('electron').ipcRenderer;

// TODO UI - NIM validation
document.querySelector('#home-btn').addEventListener('click', function() {
    document.querySelector('#loading').style.display = 'flex';
    ipcRenderer.send("incoming_voter", "Name", document.getElementById("nim").value);
});

ipcRenderer.on('voter-served', function (self, nodeId) {
    document.querySelector('#nim').value = "";
    document.querySelector('#loading').style.display = 'none';
    swal({
        title: "Selamat Datang!",
        text: `Silakan menuju ke ${nodeId}`,
        icon: 'success',
        button: 'Oke!'
    })
});