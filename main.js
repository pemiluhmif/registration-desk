const { dialog, app, BrowserWindow } = require('electron');
const Messaging = require('./messaging');
const Database = require('./database');
const ipcMain = require('electron').ipcMain;
const yargs = require('yargs');
const uuid4 = require('uuid4');

const ManifestLoader = require('./modules/manifest_loader');

// Start the express app
let serv = require('./src/app');

var voter_served_callback = null;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win, openWindow;

function createWindow () {
    serv =  require('./src/app');

    newOpenWindow();

    ipcMain.on('publish', function (self, queue, msg) {
        Messaging.publish(queue, msg);
    });

    ipcMain.on('subscribe', function (self, queue, callback) {
        Messaging.setMessageListener(queue, callback);
    });

    ipcMain.on('incoming_voter', function (event, voter_nim) {
        let ret = checkNIM(voter_nim);
        if(ret['status']){
            incoming_voter(ret['name'], voter_nim, function(nodeId) {
                event.sender.send("voter-served", nodeId);

                // NOTE Line removed, last_queued handled on other channel
                //Database.updatePersonData(voter_nim,"last_queued",new Date().toISOString().slice(0, 19).replace('T', ' '));
            });
        }else{
            event.sender.send("invalid-voter",ret['msg']);
        }
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', ()=>{
    let yargsSetting = yargs.usage("Usage: $0 [options]")
        .example("$0 -i --setting=myManifest.json --auth=myAuth.json --db=myDb.db")
        .example("$0")
        .alias("h","help")
        .alias("v","version")
        .alias("i","initial")
        .boolean("i")
        .describe("i","Initial load (load JSON config)")
        .default("db","pemilu.db");

    let argv;
    if(app.isPackaged){
        argv = yargsSetting.parse(process.argv.slice(1));
    }else{
        argv = yargsSetting.argv;
    }

    let status = Database.init(argv.db);

    if(status["status"]){
        // Initial config if specified OR database is empty
        if(argv.initial || !(Database.hasTable("config") && Database.hasTable("voters") &&
            Database.hasTable("voting_types") && Database.hasTable("candidates"))) {

            if(argv.config !== undefined) {
                // If config is specified in argument, use that
                console.log("Loading manifest from file..");

                try {
                    let ret = Database.loadInitManifest(Database.loadJSON(argv.config));
                    if (ret['status'] === false) {
                        dialog.showErrorBox("Error on JSON (manifest) load", ret['msg']);
                        process.exit(1);
                    }
                } catch (e) {
                    dialog.showErrorBox("Error on JSON (manifest) load", e.message);
                    console.error(e.message);
                    process.exit(1);
                }
            } else {
                // Otherwise, try to initialize from built-in initialization manifest
                console.log("Loading built-in manifest..");

                try {
                    let init_config = require("./init_param").init_config;
                    let ret = Database.loadInitManifest(JSON.stringify(init_config));
                    if (ret['status'] === false) {
                        dialog.showErrorBox("Error on built-in JSON manifest load", ret['msg']);
                        process.exit(1);
                    }
                } catch (mnf) {
                    // Built-in manifest not found
                    dialog.showErrorBox("Error on JSON (manifest) load", "Built-in manifest not found");
                    console.log(mnf.message);
                    process.exit(1);
                }
            }
        }

        // auth config
        try {
            ret = Database.loadAuthorizationManifest(Database.loadJSON(argv.auth));
            if(ret['status']===false){
                dialog.showErrorBox("Error on JSON (auth) load",ret['msg']);
                process.exit(1);
            }
            if(argv.initial || !(Database.hasTable("last_signature") && Database.hasTable("vote_record"))){
                Database.setupTable();
            }
        } catch (e) {
            dialog.showErrorBox("Error on JSON (auth) load",e.message);
            console.error(e.message);
            process.exit(1);
        }

        // Setup node
        try{
            enableNode(Database.getConfig("node_id"),
                Database.getConfig("origin_hash"),
                Database.getConfig("machine_key"),
                Database.getConfig("amqp_url"));
        }catch (e) {
            dialog.showErrorBox("Error on node communication setup",e.message);
            console.error(e.message);
            process.exit(1);
        }

        createWindow();

    }else{
        dialog.showErrorBox("Error on init",status["msg"]);
    }

});

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
    // Connect to broker
    Messaging.init(nodeId, Messaging.NODE_TYPE_REGDESK);
    Messaging.connect(amqpUrl, function() {
        // Reply channel
        Messaging.setMessageListener(Messaging.EX_VOTER_SERVED, function(msg, ch) {
            let data = JSON.parse(msg.content.toString());
            if(voter_served_callback != null) voter_served_callback(data.node_id);
        });

        // Keeps track of casted vote
        Messaging.setMessageListener(Messaging.EX_VOTE_CASTED,function (msg,ch) {
            let data = JSON.parse(msg.content.toString());
            console.log("Receive vote data");
            if(data.node_id!==Database.getConfig("node_id")) {
                Database.performVoteDataUpdate(data.node_id, data.vote_payload);
                Database.performSigDataUpdate(data.node_id, data.last_signature);
                Database.updatePersonData(data.voter_nim,"voted",1);
                Database.updatePersonData(data.voter_nim,"last_queued",null);
            }
            ch.ack(msg);
        });

        // Keeps track of queued voter
        Messaging.setMessageListener(Messaging.EX_VOTER_QUEUED, (msg,ch)=>{
            let data = JSON.parse(msg.content.toString());
            console.log("Receive vote data");
            Database.updatePersonData(data.voter_nim, "last_queued", data.timestamp);
        });

        Messaging.setMessageListener(Messaging.EX_PERSON_DATA_REPLY,(msg,ch)=>{
            let data = JSON.parse(msg.content.toString());

            if(data.persons !== undefined){
                data.persons.forEach((item)=>{
                    Database.performPersonDataUpdate(data.node_id,item);
                })
            }
        });

        Messaging.setMessageListener(Messaging.EX_REQUEST_DATA_BROADCAST, (msg,ch)=>{
            let data = JSON.parse(msg.content.toString());
            console.log(data);
            let votes = Database.getVoteRecords();
            let lastSigs = Database.getLastSignatures();

            let replyVote = {
                "node_id": Database.getConfig("node_id"),
                "votes": votes,
                "last_hashes": lastSigs
            };
            Messaging.sendToQueue(Messaging.EX_VOTE_DATA_REPLY+":"+data.node_id,JSON.stringify(replyVote));

            let persons = Database.getVoters();
            console.log(persons);
            let replyPerson = {
                "node_id": Database.getConfig("node_id"),
                "persons": persons
            };

            Messaging.sendToQueue(Messaging.EX_PERSON_DATA_REPLY+":"+data.node_id,JSON.stringify(replyPerson));
        });

        Messaging.setMessageListener(Messaging.EX_VOTE_DATA_REPLY,(msg,ch)=>{
            let data = JSON.parse(msg.content.toString());

            if(data.votes !== undefined){
                data.votes.forEach((item)=>{
                    Database.performVoteDataUpdate(data.node_id,item);
                });
            }

            if(data.last_hashes!==undefined){
                data.last_hashes.forEach((item)=>{
                    Database.performSigDataUpdate(data.node_id,item);
                });
            }

        });

        let data = {
            "node_id" : Database.getConfig("node_id")
        };

        Messaging.publish(Messaging.EX_REQUEST_DATA_BROADCAST,'',JSON.stringify(data),null);
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
        "node_id": Database.getConfig("node_id"),
        "request_id": uuid4(),
        "voter_name": voterName,
        "voter_nim": voterNIM,
        "timestamp": Math.floor(Date.now() / 1000),
        "reply": Messaging.getQueueName(Messaging.EX_VOTER_SERVED)
    };

    Messaging.publish(Messaging.EX_VOTER_QUEUED, '', JSON.stringify(payload), null);

    voter_served_callback = callback;
}

function checkNIM(NIM){
    let voterData = Database.getVoter(NIM);

    if(voterData!=null){
        if(voterData.voted===0){
            return {"status":true, "name": voterData.name};
        }else{
            // TODO Check if last_queued is long enough
            return {"status":false,"msg":"Sudah pernah voting"};
        }
    }else{
        return {"status":false,"msg":"Tidak terdaftar pada DPT"};
    }
}


function newOpenWindow() {
    openWindow = new BrowserWindow({
        width: 600,
        height: 400,
        resizable: true
    });
    openWindow.loadFile('pages/open.html');
    //openWindow.webContents.openDevTools();

    // Emitted when the window is closed.
    openWindow.on('closed', () => {
        openWindow = null
    });

    // Called when a new session (open manifest) is invoked
    ipcMain.on('new_session', function (event, manifestPath, destPath) {
        ManifestLoader.loadInitializationManifest(manifestPath, destPath, function(msg) {
            console.log(msg);
            event.sender.send('new_session-reply', false, null, msg);
        }).then(function() {
            event.sender.send('new_session-reply', true, null, '');
        }).catch(function(e) {
            console.log(e);
            event.sender.send('new_session-reply', true, e, '');
        })
    });
}

function newVoteWindow() {
    win = new BrowserWindow({
        width: 1024,
        height: 600,
        resizable: true
    });
    win.close();

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
}