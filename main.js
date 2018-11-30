const { app, BrowserWindow } = require('electron');
const Messaging = require('./messaging');
const Database = require('./database');
const ipcMain = require('electron').ipcMain;
const ipcRenderer = require('electron').ipcRenderer;
const uuid4 = require('uuid4');

const RMQ_URL = "amqp://gxqzgwoj:hXDR_7ciQm93nouQGRC_YGLPbIYnFCid@mustang.rmq.cloudamqp.com/gxqzgwoj";
let NODE_ID = "reg01";

// Start the express app
let serv = require('./src/app');

var voter_served_callback = null;

var count = 1;
var count2 = 12;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

function createWindow () {
    win = new BrowserWindow({
        width: 1024,
        height: 600,
        resizable: true
    })
    // win.setMenu(null);
    win.loadURL('http://localhost:5000/');
    win.focus();

    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        Messaging.close();
        win = null
    });

    ipcMain.on('initDb',function (event,arg) {
        let data = Database.setupTable();

        event.sender.send("setupTable",data['status'],data['msg']);

        // let testJSON={
        //         "name": "NAME",
        //         "nim": "13517999",
        //         "last_queued": "2018-11-27 15:26:09",
        //         "voted": "1",
        //         "last_modified": new Date().toISOString().slice(0, 19).replace('T', ' ')
        // };
        // Database.performPersonDataUpdate(1,testJSON);
    });


    ipcMain.on('loadDb',function (event,arg) {
        let data = Database.init(arg);
        event.sender.send("init",data['status'],data['msg']);
    });

    ipcMain.on('loadAuth',function (event,arg) {
        let authFile = Database.loadJSON(arg);
        try {
            let data = Database.loadAuthorizationManifest(authFile);
            event.sender.send("loadAuthorizationManifest", data['status'], data['msg']);
        } catch (e) {
            event.sender.send("loadAuthorizationManifest", false, e.message);
        }
    });

    ipcMain.on('initManifest',function (event,arg) {
        let configFile = Database.loadJSON(arg);

        try {
            let data = Database.loadInitManifest(configFile);
            event.sender.send("loadInitManifest", data['status'], data['msg']);
        } catch (e) {
            event.sender.send("loadInitManifest", false, e.message);
        }
    });

    ipcMain.on('publish', function (self, queue, msg) {
        Messaging.publish(queue, msg);
    });

    ipcMain.on('subscribe', function (self, queue, callback) {
        Messaging.setMessageListener(queue, callback);
    });

    ipcMain.on('incoming_voter', function (event, voter_name, voter_nim) {
        incoming_voter(voter_name, voter_nim, function(nodeId) {
            event.sender.send("voter-served", nodeId);
        });
    });

    enableNode(NODE_ID, "hash", "", RMQ_URL);
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

/**
 * TODO Enable node (invoked after loading Authorization Mainfest)
 */
function enableNode(nodeId, originHash, machineKey, amqpUrl) {
    NODE_ID = nodeId;

    // Connect to broker
    Messaging.init(nodeId, Messaging.NODE_TYPE_REGDESK);
    Messaging.connect(amqpUrl, function() {
        Messaging.setMessageListener(Messaging.EX_VOTER_SERVED, function(msg, ch) {
            let data = JSON.parse(msg.content.toString());
            if(voter_served_callback != null) voter_served_callback(data.node_id);
        })
    });

    Database.authorize(machineKey);
}

/**
 * Incoming voter
 * Called when a voter is queued
 * @param voterName
 * @param voterNIM
 * @param callback callback
 */
function incoming_voter(voterName, voterNIM, callback) {

    // Publish to VOTER_QUEUED
    let payload = {
        "node_id": NODE_ID,
        "request_id": uuid4(),
        "voter_name": voterName,
        "voter_nim": voterNIM,
        "reply": Messaging.getQueueName(Messaging.EX_VOTER_SERVED)
    };

    Messaging.publish(Messaging.EX_VOTER_QUEUED, '', JSON.stringify(payload), null);

    voter_served_callback = callback;
}