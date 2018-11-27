const { app, BrowserWindow } = require('electron');
const Messaging = require('./messaging');
const Database = require('./database');
const ipcMain = require('electron').ipcMain;

const RMQ_URL = "amqp://gxqzgwoj:hXDR_7ciQm93nouQGRC_YGLPbIYnFCid@mustang.rmq.cloudamqp.com/gxqzgwoj";

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

function createWindow () {
    // Create the browser window.
    win = new BrowserWindow({ width: 800, height: 600 });

    // and load the index.html of the app.
    win.loadFile('index.html');

    // Open the DevTools.
    //win.webContents.openDevTools()

    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        Messaging.close();
        win = null
    });

    ipcMain.on('initDb',function (event,arg) {
        Database.setupTable(sendStatus);
    })

    ipcMain.on('loadDb',function (event,arg) {
        Database.init(arg,sendStatus);
    })

    ipcMain.on('loadAuth',function (event,arg) {
        let authFile = Database.loadJSON(arg);
        Database.loadAuthorizationManifest(authFile,sendStatus);
    })

    ipcMain.on('initManifest',function (event,arg) {
        let configFile = Database.loadJSON(arg);
        Database.loadInitManifest(configFile,sendStatus);
    })

    ipcMain.on('publish', function (queue, msg) {
        Messaging.publish(queue, msg);
    });

    ipcMain.on('subscribe', function (queue, callback) {
        Messaging.setMessageListener(queue, callback);
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
});

function sendStatus(msg,status,errMsg){
    win.webContents.send(msg,status,errMsg);
}
/**
 * TODO Enable node (invoked after loading Authorization Mainfest)
 */
function enableNode(nodeId, originHash, machineKey, amqpUrl) {
    // Connect to broker
    Messaging.init(nodeId, Messaging.NODE_TYPE_REGDESK);
    Messaging.connect(amqpUrl, null);

    Database.authorize(machineKey);
}