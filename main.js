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

let win;

app.on('ready', function() {
    'use strict';

    win = new BrowserWindow({
        width: 1024,
        height: 600,
        resizable: true
    })
    // win.setMenu(null);
    win.loadURL('http://localhost:5000/');
    win.focus();

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
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});
app.on('activate', () => {
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